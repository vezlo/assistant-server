import { Request, Response } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';
import logger from '../config/logger';
import { SetupService } from '../services/SetupService';
import { ApiKeyService } from '../services/ApiKeyService';
import { MigrationService } from '../services/MigrationService';
import { JWTUtils } from '../middleware/auth';

export class GenerateKeyController {
  private supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  /**
   * Generate API key endpoint
   * Supports two authentication methods:
   * 1. Bearer token: For authenticated admin users, generates key for their company
   * 2. Migration key: For Vercel deployments, generates key for default admin's company
   */
  async generateKey(req: Request, res: Response): Promise<void> {
    try {
      const authHeader = req.headers.authorization;
      const migrationKey = (req.query.key as string) || undefined;

      // Check for Bearer token first (frontend/admin access)
      if (authHeader && authHeader.startsWith('Bearer ')) {
        await this.handleBearerTokenAuth(req, res, authHeader);
        return;
      }

      // Fallback to migration key (Vercel deployment)
      if (!migrationKey) {
        res.status(401).json({
          success: false,
          message: 'No authentication provided',
          error: 'UNAUTHORIZED'
        });
        return;
      }

      await this.handleMigrationKeyAuth(req, res, migrationKey);
    } catch (error: any) {
      logger.error('Generate key failed:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate API key',
        error: error.message || 'GENERATE_KEY_FAILED',
        details: {
          error: error.message
        }
      });
    }
  }

  /**
   * Handle Bearer token authentication and generate key for user's company
   */
  private async handleBearerTokenAuth(req: Request, res: Response, authHeader: string): Promise<void> {
    const token = authHeader.substring(7);
    const decoded = JWTUtils.verifyToken(token);

    const { data: user } = await this.supabase
      .from('vezlo_users')
      .select('*')
      .eq('id', decoded.user_id)
      .single();

    if (!user || user.token_updated_at !== decoded.user_token_updated_at) {
      res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
        error: 'UNAUTHORIZED'
      });
      return;
    }

    const { data: profile } = await this.supabase
      .from('vezlo_user_company_profiles')
      .select(`
        role,
        company_id,
        companies:company_id(
          id,
          name
        )
      `)
      .eq('user_id', user.id)
      .eq('id', decoded.user_company_profile_id)
      .single();

    if (!profile || profile.role !== 'admin') {
      res.status(403).json({
        success: false,
        message: 'Only admin users can generate API keys',
        error: 'FORBIDDEN'
      });
      return;
    }

    const companyId = parseInt(profile.company_id);
    const apiKeyService = new ApiKeyService(this.supabase);
    const result = await apiKeyService.generateApiKey(companyId);

    const companyName = (profile.companies as any)?.name || 'Unknown Company';

    res.status(200).json({
      success: true,
      message: 'API key generated successfully',
      api_key_details: {
        uuid: result.uuid,
        company_name: companyName,
        user_name: user.name,
        api_key: result.apiKey
      }
    });
  }

  /**
   * Handle migration key authentication and generate key for default admin's company
   */
  private async handleMigrationKeyAuth(req: Request, res: Response, migrationKey: string): Promise<void> {
    const keyValid = MigrationService.validateApiKey(migrationKey);
    
    if (!keyValid) {
      res.status(401).json({
        success: false,
        message: 'Invalid or missing migration API key',
        error: 'UNAUTHORIZED'
      });
      return;
    }

    const setupService = new SetupService(this.supabase);
    const response = await setupService.executeGenerateKey();

    res.status(200).json({
      success: true,
      message: 'API key generated successfully',
      api_key_details: response
    });
  }
}
