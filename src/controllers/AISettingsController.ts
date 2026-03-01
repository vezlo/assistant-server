import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { AISettingsService } from '../services/AISettingsService';
import logger from '../config/logger';
import { AISettings } from '../config/defaultAISettings';

/**
 * AISettingsController
 * Protected controller for managing company-specific AI settings
 */
export class AISettingsController {
  private aiSettingsService: AISettingsService;

  constructor(aiSettingsService: AISettingsService) {
    this.aiSettingsService = aiSettingsService;
  }

  /**
   * GET /api/companies/:companyUuid/ai-settings
   * Get AI settings for a company
   */
  async getSettings(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const companyUuid = Array.isArray(req.params.companyUuid) 
        ? req.params.companyUuid[0] 
        : req.params.companyUuid;

      if (!companyUuid) {
        res.status(400).json({ error: 'Company UUID is required' });
        return;
      }

      // Verify user has access to this company
      if (req.profile?.companyUuid !== companyUuid) {
        logger.warn(`Unauthorized access attempt to AI settings for company: ${companyUuid}`);
        res.status(403).json({ error: 'Unauthorized access to this company\'s settings' });
        return;
      }

      const settings = await this.aiSettingsService.getSettingsByCompanyUuid(companyUuid);

      logger.info(`✅ AI settings retrieved for company: ${companyUuid}`);
      res.json({
        success: true,
        settings
      });
    } catch (error) {
      logger.error('Error getting AI settings:', error);
      res.status(500).json({ 
        error: 'Failed to get AI settings',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * PUT /api/companies/:companyUuid/ai-settings
   * Update AI settings for a company
   */
  async updateSettings(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const companyUuid = Array.isArray(req.params.companyUuid) 
        ? req.params.companyUuid[0] 
        : req.params.companyUuid;

      if (!companyUuid) {
        res.status(400).json({ error: 'Company UUID is required' });
        return;
      }

      // requireAdmin middleware ensures req.profile exists and role is admin
      // Verify user has access to this company
      if (req.profile!.companyUuid !== companyUuid) {
        logger.warn(`Unauthorized access attempt to update AI settings for company: ${companyUuid}`);
        res.status(403).json({ error: 'Unauthorized access to this company\'s settings' });
        return;
      }

      const settingsUpdate: Partial<AISettings> = req.body;

      // Validate settings structure
      if (settingsUpdate.temperature !== undefined) {
        if (typeof settingsUpdate.temperature !== 'number' || 
            settingsUpdate.temperature < 0 || 
            settingsUpdate.temperature > 2) {
          res.status(400).json({ error: 'Temperature must be a number between 0 and 2' });
          return;
        }
      }

      if (settingsUpdate.max_tokens !== undefined) {
        if (typeof settingsUpdate.max_tokens !== 'number' || 
            settingsUpdate.max_tokens < 1 || 
            settingsUpdate.max_tokens > 16000) {
          res.status(400).json({ error: 'Max tokens must be a number between 1 and 16000' });
          return;
        }
      }

      if (settingsUpdate.model !== undefined) {
        const allowedModels = ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'];
        if (!allowedModels.includes(settingsUpdate.model)) {
          res.status(400).json({
            error: 'Invalid model',
            allowedModels
          });
          return;
        }
      }

      if (settingsUpdate.technical_depth !== undefined) {
        if (typeof settingsUpdate.technical_depth !== 'number' ||
            !Number.isInteger(settingsUpdate.technical_depth) ||
            settingsUpdate.technical_depth < 1 ||
            settingsUpdate.technical_depth > 5) {
          res.status(400).json({ error: 'technical_depth must be an integer between 1 and 5' });
          return;
        }
      }

      const updatedSettings = await this.aiSettingsService.updateSettings(companyUuid, settingsUpdate);

      logger.info(`✅ AI settings updated for company: ${companyUuid} by user: ${req.user?.uuid}`);
      res.json({
        success: true,
        settings: updatedSettings
      });
    } catch (error) {
      logger.error('Error updating AI settings:', error);
      res.status(500).json({ 
        error: 'Failed to update AI settings',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}
