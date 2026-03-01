/**
 * DepthResolverService
 * Resolves the effective technical depth level using the priority chain:
 *   1. Per-request parameter
 *   2. Per-conversation setting
 *   3. Company default (vezlo_ai_settings.technical_depth)
 *   4. DEVELOPER_MODE env var fallback (true→5, false→2)
 *   5. Global default: 3
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { DepthResolutionContext } from '../types';
import logger from '../config/logger';

const GLOBAL_DEFAULT_DEPTH = parseInt(process.env.TECHNICAL_DEPTH_DEFAULT || '3', 10) || 3;

/**
 * Validates that a value is a valid technical depth level (integer 1-5).
 */
function isValidDepth(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5;
}

export class DepthResolverService {
  private supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  /**
   * Resolves the effective technical depth level.
   *
   * Resolution order:
   * 1. context.requestDepth if provided and valid (1-5)
   * 2. vezlo_conversations.technical_depth if conversation exists and column is not null
   * 3. vezlo_ai_settings.technical_depth for the company
   * 4. DEVELOPER_MODE env var mapping (true→5, false→2)
   * 5. Global default: 3 (or TECHNICAL_DEPTH_DEFAULT env var)
   */
  async resolveDepth(context: DepthResolutionContext): Promise<number> {
    // 1. Per-request parameter
    if (isValidDepth(context.requestDepth)) {
      logger.info(`🎚️ Technical depth resolved from request: ${context.requestDepth}`);
      return context.requestDepth;
    }

    // 2. Per-conversation setting
    if (context.conversationUuid) {
      try {
        const { data, error } = await this.supabase
          .from('vezlo_conversations')
          .select('technical_depth')
          .eq('uuid', context.conversationUuid)
          .single();

        if (!error && data && isValidDepth(data.technical_depth)) {
          logger.info(`🎚️ Technical depth resolved from conversation: ${data.technical_depth}`);
          return data.technical_depth;
        }
      } catch (err) {
        logger.warn('⚠️ Failed to fetch conversation technical_depth:', err);
      }
    }

    // 3. Company default from vezlo_ai_settings
    try {
      const { data: company } = await this.supabase
        .from('vezlo_companies')
        .select('id')
        .eq('uuid', context.companyUuid)
        .single();

      if (company) {
        const { data: aiSettings, error } = await this.supabase
          .from('vezlo_ai_settings')
          .select('technical_depth')
          .eq('company_id', company.id)
          .single();

        if (!error && aiSettings && isValidDepth(aiSettings.technical_depth)) {
          logger.info(`🎚️ Technical depth resolved from company AI settings: ${aiSettings.technical_depth}`);
          return aiSettings.technical_depth;
        }
      }
    } catch (err) {
      logger.warn('⚠️ Failed to fetch company technical_depth:', err);
    }

    // 4. DEVELOPER_MODE env var fallback
    const developerMode = process.env.DEVELOPER_MODE;
    if (developerMode !== undefined) {
      const depth = developerMode === 'true' ? 5 : 2;
      logger.info(`🎚️ Technical depth resolved from DEVELOPER_MODE=${developerMode}: ${depth}`);
      return depth;
    }

    // 5. Global default
    logger.info(`🎚️ Technical depth resolved to global default: ${GLOBAL_DEFAULT_DEPTH}`);
    return GLOBAL_DEFAULT_DEPTH;
  }
}
