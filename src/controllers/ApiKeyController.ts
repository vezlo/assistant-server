import { Response } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';
import { ApiKeyService } from '../services/ApiKeyService';
import logger from '../config/logger';
import { AuthenticatedRequest } from '../middleware/auth';

export class ApiKeyController {
  private apiKeyService: ApiKeyService;

  constructor(apiKeyService: ApiKeyService) {
    this.apiKeyService = apiKeyService;
  }

  /**
   * Generate or update API key
   * Only admins can generate API keys
   */
  async generateApiKey(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      // requireAdmin middleware ensures req.profile exists and role is admin
      const companyId = parseInt(req.profile!.companyId);
      const result = await this.apiKeyService.generateApiKey(companyId);

      res.status(200).json({
        success: true,
        uuid: result.uuid,
        api_key: result.apiKey,
        message: 'API key generated successfully'
      });
    } catch (error) {
      logger.error('Error generating API key:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate API key',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get API key status
   */
  async getApiKeyStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      // requireAdmin middleware ensures req.profile exists and role is admin
      const companyId = parseInt(req.profile!.companyId);
      const status = await this.apiKeyService.getApiKeyStatus(companyId);

      res.status(200).json({
        exists: status.exists,
        uuid: status.uuid || null,
        message: status.exists 
          ? 'API key exists for this company' 
          : 'No API key exists for this company'
      });
    } catch (error) {
      logger.error('Error getting API key status:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get API key status',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}




