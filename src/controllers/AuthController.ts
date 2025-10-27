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
      const { email, password, company_domain } = req.body;

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

      // If company_domain is provided, find matching profile
      let selectedProfile = profiles[0]; // Default to first profile
      
      if (company_domain) {
        const domainProfile = profiles.find(p => p.companies.domain === company_domain);
        if (domainProfile) {
          selectedProfile = domainProfile;
        }
      }

      // Generate tokens
      const { JWTUtils } = await import('../middleware/auth');
      const accessToken = JWTUtils.generateToken(
        selectedProfile.id.toString(),
        user.id.toString(),
        selectedProfile.company_id.toString(),
        user.token_updated_at,
        selectedProfile.role
      );

      const refreshToken = JWTUtils.generateRefreshToken(
        selectedProfile.id.toString(),
        user.id.toString(),
        selectedProfile.company_id.toString(),
        user.token_updated_at,
        selectedProfile.role
      );

      res.json({
        success: true,
        access_token: accessToken,
        refresh_token: refreshToken,
        user: {
          id: user.uuid,
          email: user.email,
          name: user.name
        },
        profile: {
          id: selectedProfile.uuid,
          company_id: selectedProfile.companies.uuid,
          company_name: selectedProfile.companies.name,
          role: selectedProfile.role
        },
        available_companies: profiles.map(p => ({
          id: p.companies.uuid,
          name: p.companies.name,
          domain: p.companies.domain,
          role: p.role
        }))
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
          id: req.user.uuid,
          email: req.user.email,
          name: req.user.name
        },
        profile: {
          id: req.profile.uuid,
          company_id: req.profile.companyUuid,
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

  // Refresh token endpoint
  async refreshToken(req: any, res: any): Promise<void> {
    try {
      const { refresh_token } = req.body;

      if (!refresh_token) {
        res.status(400).json({ error: 'refresh_token is required' });
        return;
      }

      // Verify refresh token
      const { JWTUtils } = await import('../middleware/auth');
      const decoded = JWTUtils.verifyToken(refresh_token);
      
      // Check if it's actually a refresh token
      if ((decoded as any).type !== 'refresh') {
        res.status(401).json({ error: 'Invalid refresh token' });
        return;
      }

      // Get user and profile data
      const [user, profile] = await Promise.all([
        this.getUserById(decoded.user_id),
        this.getProfileById(decoded.user_company_profile_id)
      ]);

      // Check if token is still valid (not logged out)
      if (user.token_updated_at !== decoded.user_token_updated_at) {
        res.status(401).json({ error: 'Refresh token has been invalidated' });
        return;
      }

      // Check if profile is active
      if (profile.status !== 'active') {
        res.status(401).json({ error: 'Profile is inactive' });
        return;
      }

      // Generate new access token
      const accessToken = JWTUtils.generateToken(
        profile.id.toString(),
        user.id.toString(),
        profile.company_id.toString(),
        user.token_updated_at,
        profile.role
      );

      res.json({
        success: true,
        access_token: accessToken
      });

    } catch (error) {
      logger.error('Refresh token error:', error);
      res.status(401).json({
        error: 'Failed to refresh token',
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
