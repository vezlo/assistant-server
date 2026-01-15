import { Response } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';
import { TeamService, type UpdateTeamMemberInput } from '../services/TeamService';
import logger from '../config/logger';
import { AuthenticatedRequest } from '../middleware/auth';

export class AccountController {
  private teamService: TeamService;
  private supabase: SupabaseClient;

  constructor(teamService: TeamService, supabase: SupabaseClient) {
    this.teamService = teamService;
    this.supabase = supabase;
  }

  /**
   * Get current user's account information
   * GET /api/account/profile
   */
  async getProfile(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.profile) {
        res.status(401).json({
          success: false,
          error: 'Not authenticated'
        });
        return;
      }

      const companyId = parseInt(req.profile.companyId);
      const profileUuid = req.profile.uuid;

      // Get profile directly from database
      const { data: profile, error: profileError } = await this.supabase
        .from('vezlo_user_company_profiles')
        .select(`
          uuid,
          role,
          status,
          created_at,
          updated_at,
          vezlo_users:user_id (
            uuid,
            email,
            name
          )
        `)
        .eq('uuid', profileUuid)
        .eq('company_id', companyId)
        .single();

      if (profileError || !profile) {
        logger.error('Error fetching profile:', profileError);
        res.status(404).json({
          success: false,
          error: 'Profile not found'
        });
        return;
      }

      const member = {
        uuid: profile.uuid,
        user_uuid: (profile.vezlo_users as any).uuid,
        email: (profile.vezlo_users as any).email,
        name: (profile.vezlo_users as any).name,
        role: profile.role,
        status: profile.status,
        created_at: profile.created_at,
        updated_at: profile.updated_at
      };

      res.status(200).json({
        success: true,
        member
      });
    } catch (error) {
      logger.error('Error getting profile:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get profile'
      });
    }
  }

  /**
   * Update current user's account (name and password only)
   * PUT /api/account/profile
   */
  async updateProfile(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.profile) {
        res.status(401).json({
          success: false,
          error: 'Not authenticated'
        });
        return;
      }

      const companyId = parseInt(req.profile.companyId);
      const profileUuid = req.profile.uuid;
      const { name, password } = req.body;

      const input: UpdateTeamMemberInput = {};
      if (name !== undefined) input.name = name.trim();
      if (password !== undefined) {
        if (password.length < 6) {
          res.status(400).json({
            success: false,
            error: 'Password must be at least 6 characters'
          });
          return;
        }
        input.password = password;
      }

      if (Object.keys(input).length === 0) {
        res.status(400).json({
          success: false,
          error: 'No fields to update'
        });
        return;
      }

      // Update using team service (will enforce self-update restrictions)
      const member = await this.teamService.updateTeamMember(companyId, profileUuid, input, profileUuid);

      res.status(200).json({
        success: true,
        member,
        message: 'Profile updated successfully'
      });
    } catch (error) {
      logger.error('Error updating profile:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to update profile';
      const statusCode = errorMessage.includes('cannot change your own role') ||
                        errorMessage.includes('cannot change your own status') ||
                        errorMessage.includes('cannot change another admin') ? 400 : 500;
      res.status(statusCode).json({
        success: false,
        error: errorMessage
      });
    }
  }
}
