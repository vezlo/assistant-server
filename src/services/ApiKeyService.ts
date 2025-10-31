import { SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import logger from '../config/logger';
import { PasswordUtils } from '../middleware/auth';

export interface ApiKey {
  uuid: string;
  company_id: number;
  name: string;
  key_hash: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export class ApiKeyService {
  private supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  /**
   * Generate a new API key for a company
   * If one already exists, update it; otherwise create a new one
   */
  async generateApiKey(companyId: number): Promise<{ uuid: string; apiKey: string }> {
    try {
      // Check if API key already exists
      const { data: existingKey } = await this.supabase
        .from('vezlo_api_keys')
        .select('uuid')
        .eq('company_id', companyId)
        .single();

      // Generate a new random API key
      const apiKey = this.generateRandomKey();
      // Hash with SHA-256 for direct comparison
      const crypto = require('crypto');
      const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

      if (existingKey) {
        // Update existing key
        const { data, error } = await this.supabase
          .from('vezlo_api_keys')
          .update({
            key_hash: keyHash,
            updated_at: new Date().toISOString()
          })
          .eq('uuid', existingKey.uuid)
          .select('uuid')
          .single();

        if (error) {
          throw new Error(`Failed to update API key: ${error.message}`);
        }

        return { uuid: data.uuid, apiKey };
      } else {
        // Create new key
        const { data, error } = await this.supabase
          .from('vezlo_api_keys')
          .insert({
            company_id: companyId,
            name: 'Default API Key',
            key_hash: keyHash
          })
          .select('uuid')
          .single();

        if (error) {
          throw new Error(`Failed to create API key: ${error.message}`);
        }

        return { uuid: data.uuid, apiKey };
      }
    } catch (error) {
      logger.error('Error generating API key:', error);
      throw error;
    }
  }

  /**
   * Get API key status for a company
   */
  async getApiKeyStatus(companyId: number): Promise<{ exists: boolean; uuid?: string }> {
    try {
      const { data, error } = await this.supabase
        .from('vezlo_api_keys')
        .select('uuid')
        .eq('company_id', companyId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return { exists: false };
        }
        throw new Error(`Failed to get API key status: ${error.message}`);
      }

      return { exists: true, uuid: data.uuid };
    } catch (error) {
      logger.error('Error getting API key status:', error);
      throw error;
    }
  }

  /**
   * Get API key by UUID (without returning the key itself)
   */
  async getApiKey(uuid: string): Promise<ApiKey | null> {
    try {
      const { data, error } = await this.supabase
        .from('vezlo_api_keys')
        .select('*')
        .eq('uuid', uuid)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        throw new Error(`Failed to get API key: ${error.message}`);
      }

      return data as ApiKey;
    } catch (error) {
      logger.error('Error getting API key:', error);
      throw error;
    }
  }

  /**
   * Generate a random API key (32 bytes, base64 encoded)
   */
  private generateRandomKey(): string {
    const randomBytes = crypto.randomBytes(32);
    return randomBytes.toString('base64url');
  }
}

