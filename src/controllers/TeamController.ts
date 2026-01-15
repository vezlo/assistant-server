import { Response } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';
import { TeamService, type CreateTeamMemberInput, type UpdateTeamMemberInput } from '../services/TeamService';
import logger from '../config/logger';
import { AuthenticatedRequest } from '../middleware/auth';

export class TeamController {
  private teamService: TeamService;
  private supabase: SupabaseClient;

  constructor(teamService: TeamService, supabase: SupabaseClient) {
    this.teamService = teamService;
    this.supabase = supabase;
  }

  /**
   * Create a new team member
   * POST /api/companies/:companyUuid/team
   */
  async createTeamMember(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.profile) {
        res.status(401).json({
          success: false,
          error: 'Not authenticated'
        });
        return;
      }

      const companyId = parseInt(req.profile.companyId);
      const { email, password, name, role } = req.body;

      if (!email || !password || !name || !role) {
        res.status(400).json({
          success: false,
          error: 'Email, password, name, and role are required'
        });
        return;
      }

      if (!['admin', 'user'].includes(role)) {
        res.status(400).json({
          success: false,
          error: 'Role must be admin or user'
        });
        return;
      }

      const input: CreateTeamMemberInput = {
        email: email.trim().toLowerCase(),
        password,
        name: name.trim(),
        role
      };

      const member = await this.teamService.createTeamMember(companyId, input);

      res.status(201).json({
        success: true,
        member,
        message: 'Team member created successfully'
      });
    } catch (error) {
      logger.error('Error creating team member:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create team member'
      });
    }
  }

  /**
   * Get team members
   * GET /api/companies/:companyUuid/team
   */
  async getTeamMembers(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.profile) {
        res.status(401).json({
          success: false,
          error: 'Not authenticated'
        });
        return;
      }

      const companyId = parseInt(req.profile.companyId);
      const search = req.query.search as string | undefined;
      const page = req.query.page ? parseInt(req.query.page as string) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;

      const result = await this.teamService.getTeamMembers(companyId, {
        search,
        page: page > 0 ? page : 1,
        limit: limit > 0 && limit <= 100 ? limit : 50
      });

      res.status(200).json({
        success: true,
        ...result
      });
    } catch (error) {
      logger.error('Error getting team members:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get team members'
      });
    }
  }

  /**
   * Update team member
   * PUT /api/companies/:companyUuid/team/:userUuid
   */
  async updateTeamMember(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.profile) {
        res.status(401).json({
          success: false,
          error: 'Not authenticated'
        });
        return;
      }

      const companyId = parseInt(req.profile.companyId);
      const profileUuid = Array.isArray(req.params.userUuid) ? req.params.userUuid[0] : req.params.userUuid;
      const currentUserProfileUuid = req.profile.uuid;
      const { name, role, status, password } = req.body;

      const input: UpdateTeamMemberInput = {};
      if (name !== undefined) input.name = name.trim();
      if (role !== undefined) {
        if (!['admin', 'user'].includes(role)) {
          res.status(400).json({
            success: false,
            error: 'Role must be admin or user'
          });
          return;
        }
        input.role = role;
      }
      if (status !== undefined) {
        if (!['active', 'inactive'].includes(status)) {
          res.status(400).json({
            success: false,
            error: 'Status must be active or inactive'
          });
          return;
        }
        input.status = status;
      }
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

      const member = await this.teamService.updateTeamMember(companyId, profileUuid, input, currentUserProfileUuid);

      res.status(200).json({
        success: true,
        member,
        message: 'Team member updated successfully'
      });
    } catch (error) {
      logger.error('Error updating team member:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to update team member';
      const statusCode = errorMessage.includes('cannot change another admin') ||
                        errorMessage.includes('cannot change your own role') ||
                        errorMessage.includes('cannot change your own status') ? 400 : 500;
      res.status(statusCode).json({
        success: false,
        error: errorMessage
      });
    }
  }

  /**
   * Delete team member
   * DELETE /api/companies/:companyUuid/team/:userUuid
   */
  async deleteTeamMember(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.profile) {
        res.status(401).json({
          success: false,
          error: 'Not authenticated'
        });
        return;
      }

      const companyId = parseInt(req.profile.companyId);
      const profileUuid = Array.isArray(req.params.userUuid) ? req.params.userUuid[0] : req.params.userUuid;
      const currentUserProfileUuid = req.profile.uuid;

      await this.teamService.deleteTeamMember(companyId, profileUuid, currentUserProfileUuid);

      res.status(200).json({
        success: true,
        message: 'Team member removed successfully'
      });
    } catch (error) {
      logger.error('Error deleting team member:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete team member';
      const statusCode = errorMessage.includes('last admin') || errorMessage.includes('cannot delete your own') ? 400 : 500;
      res.status(statusCode).json({
        success: false,
        error: errorMessage
      });
    }
  }
}
