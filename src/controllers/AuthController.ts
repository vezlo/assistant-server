import { SupabaseClient } from '@supabase/supabase-js';
import { PasswordUtils } from '../middleware/auth';
import logger from '../config/logger';

export class AuthController {
  private supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  // Login endpoint
  async login(req: any, res: any): Promise<void> {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        res.status(400).json({ error: 'email and password are required' });
        return;
      }

      // Get user by email
      const user = await this.getUserByEmail(email);
      if (!user) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }

      // Verify password
      const isPasswordValid = await PasswordUtils.compare(password, user.password_hash);
      if (!isPasswordValid) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }

      // Get user's profiles
      const profiles = await this.getProfilesByUserId(user.id.toString());
      
      if (profiles.length === 0) {
        res.status(401).json({ error: 'User has no active company profiles' });
        return;
      }

      // Use first profile (default to first available company)
      const selectedProfile = profiles[0];

      // Generate token
      const { JWTUtils } = await import('../middleware/auth');
      const accessToken = JWTUtils.generateToken(
        selectedProfile.id.toString(),
        user.id.toString(),
        selectedProfile.company_id.toString(),
        user.token_updated_at,
        selectedProfile.role
      );

      res.json({
        access_token: accessToken
      });

    } catch (error) {
      logger.error('Login error:', error);
      res.status(500).json({
        error: 'Failed to login',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Logout endpoint
  async logout(req: any, res: any): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      // Update token_updated_at to invalidate all tokens
      await this.updateUserTokenUpdatedAt(req.user.id);

      res.json({
        success: true,
        message: 'Logged out successfully'
      });

    } catch (error) {
      logger.error('Logout error:', error);
      res.status(500).json({
        error: 'Failed to logout',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Get current user info
  async getMe(req: any, res: any): Promise<void> {
    try {
      if (!req.user || !req.profile) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      res.json({
        user: {
          uuid: req.user.uuid,
          email: req.user.email,
          name: req.user.name
        },
        profile: {
          uuid: req.profile.uuid,
          company_uuid: req.profile.companyUuid,
          company_name: req.profile.companyName,
          role: req.profile.role
        }
      });

    } catch (error) {
      logger.error('Get me error:', error);
      res.status(500).json({
        error: 'Failed to get user info',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Helper methods
  private async getUserById(userId: string) {
    const { data, error } = await this.supabase
      .from('vezlo_users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !data) {
      throw new Error('User not found');
    }

    return data;
  }

  private async getProfileById(profileId: string) {
    const { data, error } = await this.supabase
      .from('vezlo_user_company_profiles')
      .select(`
        *,
        companies:company_id (
          id,
          uuid,
          name,
          domain
        )
      `)
      .eq('id', profileId)
      .single();

    if (error || !data) {
      throw new Error('Profile not found');
    }

    return data;
  }

  private async getUserByEmail(email: string) {
    const { data, error } = await this.supabase
      .from('vezlo_users')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !data) {
      return null;
    }

    return data;
  }

  private async getProfilesByUserId(userId: string) {
    const { data, error } = await this.supabase
      .from('vezlo_user_company_profiles')
      .select(`
        *,
        companies:company_id (
          id,
          uuid,
          name,
          domain
        )
      `)
      .eq('user_id', userId)
      .eq('status', 'active');

    if (error) {
      throw new Error('Failed to fetch profiles');
    }

    return data || [];
  }

  private async updateUserTokenUpdatedAt(userId: string) {
    const { error } = await this.supabase
      .from('vezlo_users')
      .update({ token_updated_at: new Date().toISOString() })
      .eq('id', userId);

    if (error) {
      throw new Error('Failed to update token timestamp');
    }
  }
}
