/**
 * AISettingsService
 * Manages AI settings for companies with in-memory caching
 */

import { SupabaseClient } from '@supabase/supabase-js';
import logger from '../config/logger';
import { DEFAULT_AI_SETTINGS, AISettings } from '../config/defaultAISettings';

export interface AISettingsRecord {
  id: number;
  uuid: string;
  company_id: number;
  settings: AISettings;
  created_at: string;
  updated_at: string;
}

export class AISettingsService {
  private supabase: SupabaseClient;
  private cache: Map<string, { settings: AISettings; timestamp: number }>;
  private cacheTTL: number = 5 * 60 * 1000; // 5 minutes

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
    this.cache = new Map();
  }

  /**
   * Get AI settings by company UUID with caching
   */
  async getSettingsByCompanyUuid(companyUuid: string): Promise<AISettings> {
    try {
      // Check cache first
      const cached = this.cache.get(companyUuid);
      if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
        logger.info(`✅ AI settings cache hit for company: ${companyUuid}`);
        return cached.settings;
      }

      // Fetch from database
      const { data, error } = await this.supabase
        .from('vezlo_ai_settings')
        .select('settings')
        .eq('company_id', await this.getCompanyIdByUuid(companyUuid))
        .single();

      if (error || !data) {
        logger.warn(`⚠️  AI settings not found for company: ${companyUuid}, using defaults`);
        return DEFAULT_AI_SETTINGS;
      }

      const settings = data.settings as AISettings;

      // Update cache
      this.cache.set(companyUuid, { settings, timestamp: Date.now() });
      logger.info(`📥 AI settings loaded and cached for company: ${companyUuid}`);

      return settings;
    } catch (error) {
      logger.error('Error fetching AI settings:', error);
      return DEFAULT_AI_SETTINGS;
    }
  }

  /**
   * Get AI settings by company ID (internal use)
   */
  async getSettingsByCompanyId(companyId: number): Promise<AISettings> {
    try {
      const { data, error } = await this.supabase
        .from('vezlo_ai_settings')
        .select('settings')
        .eq('company_id', companyId)
        .single();

      if (error || !data) {
        logger.warn(`⚠️  AI settings not found for company ID: ${companyId}, using defaults`);
        return DEFAULT_AI_SETTINGS;
      }

      return data.settings as AISettings;
    } catch (error) {
      logger.error('Error fetching AI settings by ID:', error);
      return DEFAULT_AI_SETTINGS;
    }
  }

  /**
   * Update AI settings for a company
   */
  async updateSettings(companyUuid: string, settings: Partial<AISettings>): Promise<AISettings> {
    try {
      const companyId = await this.getCompanyIdByUuid(companyUuid);

      // Get current settings
      const currentSettings = await this.getSettingsByCompanyId(companyId);

      // Merge with new settings
      const updatedSettings: AISettings = {
        ...currentSettings,
        ...settings,
        prompts: {
          ...currentSettings.prompts,
          ...(settings.prompts || {})
        }
      };

      // Update in database
      const { data, error } = await this.supabase
        .from('vezlo_ai_settings')
        .update({ 
          settings: updatedSettings,
          updated_at: new Date().toISOString()
        })
        .eq('company_id', companyId)
        .select('settings')
        .single();

      if (error) {
        throw new Error(`Failed to update AI settings: ${error.message}`);
      }

      // Clear cache
      this.clearCache(companyUuid);
      logger.info(`✅ AI settings updated for company: ${companyUuid}`);

      return data.settings as AISettings;
    } catch (error) {
      logger.error('Error updating AI settings:', error);
      throw error;
    }
  }

  /**
   * Create default AI settings for a company
   */
  async createDefaultSettings(companyId: number): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('vezlo_ai_settings')
        .insert({
          company_id: companyId,
          settings: DEFAULT_AI_SETTINGS
        });

      if (error) {
        throw new Error(`Failed to create AI settings: ${error.message}`);
      }

      logger.info(`✅ Default AI settings created for company ID: ${companyId}`);
    } catch (error) {
      logger.error('Error creating default AI settings:', error);
      throw error;
    }
  }

  /**
   * Get company ID by UUID
   */
  private async getCompanyIdByUuid(companyUuid: string): Promise<number> {
    const { data, error } = await this.supabase
      .from('vezlo_companies')
      .select('id')
      .eq('uuid', companyUuid)
      .single();

    if (error || !data) {
      throw new Error(`Company not found: ${companyUuid}`);
    }

    return data.id;
  }

  /**
   * Clear cache for a specific company
   */
  clearCache(companyUuid?: string): void {
    if (companyUuid) {
      this.cache.delete(companyUuid);
      logger.info(`🗑️  AI settings cache cleared for company: ${companyUuid}`);
    } else {
      this.cache.clear();
      logger.info('🗑️  All AI settings cache cleared');
    }
  }
}
