import { SupabaseClient } from '@supabase/supabase-js';
import { PasswordUtils } from '../middleware/auth';
import logger from '../config/logger';

export class SetupService {
  private supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  /**
   * Get default admin credentials from environment variables
   */
  static getDefaultCredentials() {
    return {
      adminEmail: process.env.DEFAULT_ADMIN_EMAIL || 'admin@vezlo.org',
      adminPassword: process.env.DEFAULT_ADMIN_PASSWORD || 'admin123',
      companyName: process.env.ORGANIZATION_NAME || 'Vezlo'
    };
  }

  /**
   * Create default company and admin user for initial setup (CLI compatibility)
   * @deprecated Use getOrCreateDefaultData instead
   */
  async createDefaultData(options: {
    adminEmail: string;
    adminPassword: string;
    companyName: string;
  }) {
    const result = await this.getOrCreateDefaultData(options);

    if (result.alreadyExists) {
      logger.info('Default data already exists; returning existing records');
    }

    return result;
  }

  /**
   * Get or create default company and admin user for initial setup
   * Returns existing data if already created
   */
  async getOrCreateDefaultData(options: {
    adminEmail: string;
    adminPassword: string;
    companyName: string;
  }) {
    const { adminEmail, adminPassword, companyName } = options;

    try {
      logger.info('Checking for existing default company and admin user...');

      const existingData = await this.fetchExistingDefaultData();
      if (existingData) {
        logger.info('Default data already exists, returning existing data');
        return existingData;
      }

      logger.info('Creating default company and admin user...');

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
        if (this.isUniqueViolation(companyError)) {
          const fallbackData = await this.fetchExistingDefaultData();
          if (fallbackData) {
            logger.info('Company already exists, reusing existing data');
            return fallbackData;
          }
        }
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
        if (this.isUniqueViolation(userError)) {
          const fallbackData = await this.fetchExistingDefaultData();
          if (fallbackData) {
            logger.info('Admin user already exists, reusing existing data');
            return fallbackData;
          }
        }
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

      // Create default AI settings for the company
      try {
        const { AISettingsService } = await import('./AISettingsService');
        const aiSettingsService = new AISettingsService(this.supabase);
        await aiSettingsService.createDefaultSettings(company.id);
        logger.info(`✅ Default AI settings created for company: ${company.name}`);
      } catch (aiError) {
        logger.warn(`⚠️  Failed to create AI settings (non-critical): ${aiError}`);
      }

      const result = {
        success: true,
        alreadyExists: false,
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

      logger.info('Default setup completed successfully!');
      return result;

    } catch (error) {
      logger.error('Setup failed:', error);
      throw error;
    }
  }

  private isUniqueViolation(error: { code?: string; message?: string }) {
    return error?.code === '23505' || error?.message?.toLowerCase().includes('duplicate key');
  }

  private async fetchExistingDefaultData() {
    const { data: existingCompany } = await this.supabase
      .from('vezlo_companies')
      .select('*')
      .eq('domain', 'default')
      .single();

    if (!existingCompany) {
      return null;
    }

    const { data: profile } = await this.supabase
      .from('vezlo_user_company_profiles')
      .select('*, vezlo_users(*)')
      .eq('company_id', existingCompany.id)
      .eq('role', 'admin')
      .single();

    if (!profile || !profile.vezlo_users) {
      return null;
    }

    const user = profile.vezlo_users;

    return {
      success: true,
      alreadyExists: true,
      company: {
        id: existingCompany.uuid,
        name: existingCompany.name,
        domain: existingCompany.domain
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

  /**
   * Execute seed-default API - returns simplified response
   */
  async executeSeedDefault() {
    const credentials = SetupService.getDefaultCredentials();
    
    // Wait for schema cache to refresh
    await new Promise(resolve => setTimeout(resolve, 2000));

    const result = await this.getOrCreateDefaultData(credentials);

    // Prepare simplified response
    const response: any = {
      company_name: result.company.name,
      email: result.user.email,
      password: credentials.adminPassword,
      admin_name: result.user.name
    };

    return response;
  }

  /**
   * Execute generate-key API - returns API key for default admin
   */
  async executeGenerateKey() {
    const credentials = SetupService.getDefaultCredentials();
    
    // Wait for schema cache to refresh
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Find the admin user
    const { data: user, error: userError } = await this.supabase
      .from('vezlo_users')
      .select('id, uuid, name')
      .eq('email', credentials.adminEmail)
      .single();
    
    if (userError || !user) {
      throw new Error(`Admin user not found (${credentials.adminEmail}). Run seed-default first.`);
    }
    
    // Find the admin's company profile
    const { data: profile, error: profileError } = await this.supabase
      .from('vezlo_user_company_profiles')
      .select(`
        id,
        role,
        company_id,
        companies:company_id(
          id,
          uuid,
          name,
          domain
        )
      `)
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .single();
    
    if (profileError || !profile) {
      throw new Error(`Admin profile not found. Run seed-default first.`);
    }
    
    // Import ApiKeyService
    const { ApiKeyService } = await import('./ApiKeyService');
    
    // Generate the API key
    const apiKeyService = new ApiKeyService(this.supabase);
    // Use the joined company ID (same as generate-key.js script)
    const companyId = (profile.companies as any)?.id || profile.company_id;
    const { uuid, apiKey } = await apiKeyService.generateApiKey(typeof companyId === 'number' ? companyId : parseInt(String(companyId)));

    let companyName = 'Unknown Company';
    const companies = profile.companies as Record<string, any>;
    if (companies && typeof companies === 'object' && companies.name) {
      companyName = companies.name;
    }
    
    return {
      uuid,
      company_name: companyName,
      user_name: user.name,
      api_key: apiKey
    };
  }
}
