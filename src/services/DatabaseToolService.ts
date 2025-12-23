/**
 * DatabaseToolService - External Database Integration
 * 
 * This service enables tool-based queries to external databases (e.g., Supabase)
 * Supports dynamic schema introspection and user-specific queries with RLS
 * 
 * NOTE: This is a separate experimental feature for direct database integration
 * Can be easily removed without affecting core functionality
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import logger from '../config/logger';

export interface DatabaseConfig {
  url: string;
  key: string;
  enabled: boolean;
}

export interface UserQueryContext {
  userId: string;
  companyId?: string;
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required: string[];
    };
  };
}

export class DatabaseToolService {
  private client: SupabaseClient | null = null;
  private enabled: boolean = false;
  private tableSchemas: Map<string, any> = new Map();

  constructor(config: DatabaseConfig) {
    if (config.enabled && config.url && config.key) {
      try {
        this.client = createClient(config.url, config.key);
        this.enabled = true;
        logger.info('🔌 Database Tool Service initialized');
      } catch (error) {
        logger.error('Failed to initialize Database Tool Service:', error);
        this.enabled = false;
      }
    } else {
      logger.info('🔌 Database Tool Service disabled (no config)');
    }
  }

  isEnabled(): boolean {
    return this.enabled && this.client !== null;
  }

  /**
   * Get table schema by introspecting the database
   */
  private async getTableSchema(tableName: string): Promise<any> {
    if (!this.client) {
      throw new Error('Database client not initialized');
    }

    // Check cache
    if (this.tableSchemas.has(tableName)) {
      return this.tableSchemas.get(tableName);
    }

    try {
      // Fetch a single row to understand structure
      const { data, error } = await this.client
        .from(tableName)
        .select('*')
        .limit(1);

      if (error) {
        logger.warn(`Failed to introspect table ${tableName}:`, error);
        return null;
      }

      const schema = data && data.length > 0 ? Object.keys(data[0]) : [];
      this.tableSchemas.set(tableName, schema);
      
      logger.info(`📊 Introspected table ${tableName}: ${schema.length} columns`);
      return schema;
    } catch (error) {
      logger.error(`Error introspecting table ${tableName}:`, error);
      return null;
    }
  }

  /**
   * Get available tools for LLM function calling
   */
  getTools(): ToolDefinition[] {
    if (!this.isEnabled()) {
      return [];
    }

    return [
      {
        type: 'function',
        function: {
          name: 'get_user_details',
          description: 'Fetch user profile details from the database including email, full name, and display name',
          parameters: {
            type: 'object',
            properties: {
              user_id: {
                type: 'string',
                description: 'The UUID of the user to fetch details for'
              }
            },
            required: ['user_id']
          }
        }
      }
    ];
  }

  /**
   * Execute a tool call
   */
  async executeTool(
    toolName: string,
    parameters: Record<string, any>,
    userContext?: UserQueryContext
  ): Promise<any> {
    if (!this.isEnabled()) {
      throw new Error('Database tool service is not enabled');
    }

    logger.info(`🔧 Executing tool: ${toolName} with params:`, parameters);

    switch (toolName) {
      case 'get_user_details':
        return this.getUserDetails(parameters.user_id);
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  /**
   * Tool Implementation: Get User Details
   */
  private async getUserDetails(userId: string): Promise<any> {
    if (!this.client) {
      throw new Error('Database client not initialized');
    }

    try {
      // First, introspect the table to understand its structure
      const schema = await this.getTableSchema('users');
      
      if (!schema) {
        return {
          success: false,
          error: 'Unable to access users table or table does not exist'
        };
      }

      // Build dynamic select based on available columns
      const selectFields = ['id'];
      const desiredFields = ['email', 'full_name', 'display_name', 'name', 'username', 'uuid'];
      
      desiredFields.forEach(field => {
        if (schema.includes(field)) {
          selectFields.push(field);
        }
      });

      logger.info(`🔍 Querying users table with fields: ${selectFields.join(', ')}`);

      // Determine ID column type - try uuid first, then id
      let query;
      if (schema.includes('uuid')) {
        // UUID column exists - query by uuid
        logger.info(`🔑 Using uuid column for query`);
        query = this.client
          .from('users')
          .select(selectFields.join(','))
          .eq('uuid', userId)
          .single();
      } else if (userId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        // userId looks like UUID but no uuid column - try id as uuid type
        logger.info(`🔑 Using id column as UUID for query`);
        query = this.client
          .from('users')
          .select(selectFields.join(','))
          .eq('id', userId)
          .single();
      } else {
        // Try as integer
        logger.info(`🔑 Using id column as integer for query`);
        const numericId = parseInt(userId, 10);
        if (isNaN(numericId)) {
          return {
            success: false,
            error: 'Invalid user ID format'
          };
        }
        query = this.client
          .from('users')
          .select(selectFields.join(','))
          .eq('id', numericId)
          .single();
      }

      // Execute query
      const { data, error } = await query;

      if (error) {
        logger.error('Database query error:', error);
        return {
          success: false,
          error: `Failed to fetch user details: ${error.message}`
        };
      }

      if (!data) {
        return {
          success: false,
          error: 'User not found'
        };
      }

      logger.info(`✅ Successfully fetched user details for ${userId}`);

      return {
        success: true,
        user: data
      };
    } catch (error: any) {
      logger.error('Error in getUserDetails:', error);
      return {
        success: false,
        error: error.message || 'Unknown error occurred'
      };
    }
  }

  /**
   * Clear schema cache (useful for testing)
   */
  clearSchemaCache(): void {
    this.tableSchemas.clear();
    logger.info('🧹 Schema cache cleared');
  }
}

