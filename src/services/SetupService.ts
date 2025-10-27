import { SupabaseClient } from '@supabase/supabase-js';
import { PasswordUtils } from '../middleware/auth';
import logger from '../config/logger';

export class SetupService {
  private supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  /**
   * Create default company and admin user for initial setup
   */
  async createDefaultData(options: {
    adminEmail: string;
    adminPassword: string;
    companyName: string;
  }) {
    const { adminEmail, adminPassword, companyName } = options;

    try {
      logger.info('Creating default company and admin user...');

      // Check if default company already exists
      const { data: existingCompany } = await this.supabase
        .from('vezlo_companies')
        .select('id')
        .eq('domain', 'default')
        .single();

      if (existingCompany) {
        throw new Error('Default company already exists');
      }

      // Check if admin user already exists
      const { data: existingUser } = await this.supabase
        .from('vezlo_users')
        .select('id')
        .eq('email', adminEmail)
        .single();

      if (existingUser) {
        throw new Error(`User with email ${adminEmail} already exists`);
      }

      // Create default company
      const { data: company, error: companyError } = await this.supabase
        .from('vezlo_companies')
        .insert({
          name: companyName,
          domain: 'default'
        })
        .select()
        .single();

      if (companyError) {
        throw new Error(`Failed to create company: ${companyError.message}`);
      }

      logger.info(`✅ Company created: ${company.name} (${company.uuid})`);

      // Hash password
      const passwordHash = await PasswordUtils.hash(adminPassword);

      // Create admin user
      const { data: user, error: userError } = await this.supabase
        .from('vezlo_users')
        .insert({
          email: adminEmail,
          name: 'Default Admin',
          password_hash: passwordHash
        })
        .select()
        .single();

      if (userError) {
        throw new Error(`Failed to create user: ${userError.message}`);
      }

      logger.info(`✅ Admin user created: ${user.email} (${user.uuid})`);

      // Create admin profile
      const { data: profile, error: profileError } = await this.supabase
        .from('vezlo_user_company_profiles')
        .insert({
          user_id: user.id,
          company_id: company.id,
          role: 'admin',
          status: 'active'
        })
        .select()
        .single();

      if (profileError) {
        throw new Error(`Failed to create profile: ${profileError.message}`);
      }

      logger.info(`✅ Admin profile created: ${profile.uuid}`);

      const result = {
        success: true,
        company: {
          id: company.uuid,
          name: company.name,
          domain: company.domain
        },
        user: {
          id: user.uuid,
          email: user.email,
          name: user.name
        },
        profile: {
          id: profile.uuid,
          role: profile.role
        }
      };

      logger.info('🎉 Default setup completed successfully!');
      return result;

    } catch (error) {
      logger.error('Setup failed:', error);
      throw error;
    }
  }

  /**
   * Check if setup is already completed
   */
  async isSetupCompleted(): Promise<boolean> {
    try {
      const { data } = await this.supabase
        .from('vezlo_companies')
        .select('id')
        .eq('domain', 'default')
        .single();

      return !!data;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get setup status
   */
  async getSetupStatus() {
    try {
      const isCompleted = await this.isSetupCompleted();
      
      if (!isCompleted) {
        return {
          completed: false,
          message: 'Setup not completed. Run setup to create default company and admin user.'
        };
      }

      // Get default company info
      const { data: company } = await this.supabase
        .from('vezlo_companies')
        .select(`
          *,
          vezlo_user_company_profiles!inner (
            *,
            vezlo_users!inner (
              email,
              name
            )
          )
        `)
        .eq('domain', 'default')
        .eq('vezlo_user_company_profiles.role', 'admin')
        .single();

      return {
        completed: true,
        company: {
          name: company?.name,
          domain: company?.domain
        },
        adminUser: {
          email: company?.vezlo_user_company_profiles?.[0]?.vezlo_users?.email,
          name: company?.vezlo_user_company_profiles?.[0]?.vezlo_users?.name
        }
      };

    } catch (error) {
      logger.error('Failed to get setup status:', error);
      return {
        completed: false,
        message: 'Failed to check setup status'
      };
    }
  }
}
