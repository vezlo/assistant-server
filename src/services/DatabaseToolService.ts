/**
 * DatabaseToolService - Dynamic External Database Integration
 * 
 * This service enables tool-based queries to external databases (e.g., Supabase)
 * Dynamically loads tool configurations from database and executes queries
 * 
 * NOTE: This is a separate experimental feature for direct database integration
 * Can be easily removed without affecting core functionality
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import logger from '../config/logger';
import { DatabaseToolConfigService, DatabaseTool } from './DatabaseToolConfigService';

export interface DatabaseConfig {
  url: string;
  key: string;
  enabled: boolean;
}

export interface UserQueryContext {
  userId?: string;
  companyId?: number;
  user_uuid?: string;
  company_uuid?: string;
  [key: string]: any; // Allow any additional context keys
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
  private configService: DatabaseToolConfigService;
  private mainSupabase: SupabaseClient; // Main Vezlo database
  private tableSchemas: Map<string, any> = new Map();
  
  // Cache for external database clients per company
  private clientCache: Map<number, SupabaseClient> = new Map();

  constructor(mainSupabase: SupabaseClient, configService: DatabaseToolConfigService) {
    this.mainSupabase = mainSupabase;
    this.configService = configService;
    logger.info('🔌 Dynamic Database Tool Service initialized');
  }

  /**
   * Get or create external database client for a company
   */
  private async getExternalClient(companyId: number): Promise<SupabaseClient | null> {
    // Check cache
    if (this.clientCache.has(companyId)) {
      return this.clientCache.get(companyId)!;
    }

    // Fetch credentials
    const credentials = await this.configService.getDecryptedCredentials(companyId);
    
    if (!credentials) {
      return null;
    }

    // Create client
    try {
      const client = createClient(credentials.url, credentials.key);
      this.clientCache.set(companyId, client);
      logger.info(`✅ Created external database client for company ${companyId}`);
      return client;
    } catch (error) {
      logger.error(`Failed to create external client for company ${companyId}:`, error);
      return null;
    }
  }

  /**
   * Clear client cache (e.g., after config update)
   */
  clearClientCache(companyId?: number): void {
    if (companyId) {
      this.clientCache.delete(companyId);
      logger.info(`🧹 Cleared client cache for company ${companyId}`);
    } else {
      this.clientCache.clear();
      logger.info('🧹 Cleared all client caches');
    }
  }

  /**
   * Get table schema by introspecting the database
   */
  private async getTableSchema(client: SupabaseClient, tableName: string, companyId: number): Promise<string[]> {
    const cacheKey = `${companyId}:${tableName}`;
    
    // Check cache
    if (this.tableSchemas.has(cacheKey)) {
      return this.tableSchemas.get(cacheKey);
    }

    try {
      // Fetch a single row to understand structure
      const { data, error } = await client
        .from(tableName)
        .select('*')
        .limit(1);

      if (error) {
        logger.warn(`Failed to introspect table ${tableName}:`, error);
        return [];
      }

      const schema = data && data.length > 0 ? Object.keys(data[0]) : [];
      this.tableSchemas.set(cacheKey, schema);
      
      logger.info(`📊 Introspected table ${tableName}: ${schema.length} columns`);
      return schema;
    } catch (error) {
      logger.error(`Error introspecting table ${tableName}:`, error);
      return [];
    }
  }

  /**
   * Get available tools for a company for LLM function calling
   */
  async getToolsForCompany(companyId: number): Promise<ToolDefinition[]> {
    try {
      const tools = await this.configService.getEnabledToolsByCompany(companyId);
      
      if (!tools || tools.length === 0) {
        return [];
      }

      // Convert database tool configs to LLM tool definitions
      return tools.map(tool => this.convertToToolDefinition(tool));
    } catch (error) {
      logger.error(`Failed to get tools for company ${companyId}:`, error);
      return [];
    }
  }

  /**
   * Convert database tool config to LLM tool definition
   */
  private convertToToolDefinition(tool: DatabaseTool): ToolDefinition {
    const columns = typeof tool.columns === 'string' ? JSON.parse(tool.columns) : tool.columns;
    
    // If user context filtering is enabled, ID becomes optional
    const required = tool.requires_user_context ? [] : [tool.id_column];
    
    return {
      type: 'function',
      function: {
        name: tool.tool_name,
        description: tool.tool_description || `Fetch data from ${tool.table_name} table`,
        parameters: {
          type: 'object',
          properties: {
            [tool.id_column]: {
              type: tool.id_column_type === 'integer' ? 'integer' : 'string',
              description: `The ${tool.id_column} to query (optional if user context is used)`
            }
          },
          required
        }
      }
    };
  }

  /**
   * Execute a dynamic tool call
   */
  async executeTool(
    toolName: string,
    parameters: Record<string, any>,
    companyId: number,
    userContext?: UserQueryContext
  ): Promise<any> {
    logger.info(`🔧 Executing dynamic tool: ${toolName} for company ${companyId} with params:`, parameters);
    if (userContext) {
      logger.info(`🔧 User context provided:`, userContext);
    }

    try {
      // Get the tool configuration
      const tools = await this.configService.getEnabledToolsByCompany(companyId);
      const tool = tools.find(t => t.tool_name === toolName);

      if (!tool) {
        return {
          success: false,
          error: `Tool '${toolName}' not found or not enabled`
        };
      }

      // Get external database client
      const client = await this.getExternalClient(companyId);

      if (!client) {
        return {
          success: false,
          error: 'External database not configured for this company'
        };
      }

      // Execute the query
      return await this.executeToolQuery(client, tool, parameters, companyId, userContext);
    } catch (error: any) {
      logger.error(`Error executing tool ${toolName}:`, error);
      return {
        success: false,
        error: error.message || 'Tool execution failed'
      };
    }
  }

  /**
   * Execute a query for a specific tool
   */
  private async executeToolQuery(
    client: SupabaseClient,
    tool: DatabaseTool,
    parameters: Record<string, any>,
    companyId: number,
    userContext?: UserQueryContext
  ): Promise<any> {
    try {
      // Parse columns from tool config
      const columns = typeof tool.columns === 'string' ? JSON.parse(tool.columns) : tool.columns;
      
      // Introspect table to verify columns exist
      const schema = await this.getTableSchema(client, tool.table_name, companyId);
      
      if (!schema || schema.length === 0) {
        return {
          success: false,
          error: `Unable to access table '${tool.table_name}'`
        };
      }

      // Filter columns to only those that exist in the schema
      const validColumns = columns.filter((col: string) => schema.includes(col));
      
      if (validColumns.length === 0) {
        return {
          success: false,
          error: 'No valid columns configured for this tool'
        };
      }

      // Ensure ID column is included (if configured)
      if (tool.id_column && !validColumns.includes(tool.id_column)) {
        validColumns.unshift(tool.id_column);
      }

      logger.info(`🔍 Querying ${tool.table_name} with fields: ${validColumns.join(', ')}`);

      // Build READ-ONLY query (only SELECT, no INSERT/UPDATE/DELETE)
      let query = client
        .from(tool.table_name)
        .select(validColumns.join(','));

      // Apply user context filter FIRST (if configured)
      if (tool.requires_user_context && tool.user_filter_column && tool.user_context_key) {
        if (!userContext || !userContext[tool.user_context_key]) {
          logger.warn(`⚠️ Tool requires user context but '${tool.user_context_key}' not provided`);
          // Don't fail - just return empty result gracefully
          return {
            success: true,
            data: null,
            message: 'User context not available'
          };
        }

        const filterValue = userContext[tool.user_context_key];
        logger.info(`🔐 Applying user filter: ${tool.user_filter_column} = ${filterValue}`);

        // Apply filter based on type
        if (tool.user_filter_type === 'integer') {
          const numericValue = parseInt(String(filterValue), 10);
          if (!isNaN(numericValue)) {
            query = query.eq(tool.user_filter_column, numericValue);
          }
        } else {
          query = query.eq(tool.user_filter_column, String(filterValue));
        }
      }

      // Apply ID filter (if provided in parameters and valid)
      if (tool.id_column && parameters[tool.id_column] !== undefined && parameters[tool.id_column] !== null) {
        const idValue = parameters[tool.id_column];
        
        // Skip if ID is 0 or empty (invalid values)
        const isValidId = tool.id_column_type === 'integer' 
          ? (typeof idValue === 'number' && idValue > 0) || (typeof idValue === 'string' && parseInt(idValue) > 0)
          : (typeof idValue === 'string' && idValue.trim() !== '');
        
        if (isValidId) {
          // Apply ID filter based on type
          if (tool.id_column_type === 'integer') {
            const numericId = parseInt(String(idValue), 10);
            if (isNaN(numericId)) {
              return {
                success: false,
                error: `Invalid ${tool.id_column} format - expected integer`
              };
            }
            query = query.eq(tool.id_column, numericId);
          } else {
            query = query.eq(tool.id_column, String(idValue));
          }
        }
      }

      // Execute query - use .single() if ID provided, otherwise return array
      const hasIdFilter = tool.id_column && parameters[tool.id_column] !== undefined;
      const { data, error } = hasIdFilter ? await query.single() : await query;

      if (error) {
        // If single() fails, try returning as array (might be multiple results)
        if (error.code === 'PGRST116') {
          return {
            success: false,
            error: 'No data found'
          };
        }
        
        logger.error(`Database query error for ${tool.table_name}:`, error);
        return {
          success: false,
          error: `Query failed: ${error.message}`
        };
      }

      if (!data) {
        return {
          success: false,
          error: 'No data found'
        };
      }

      logger.info(`✅ Successfully executed tool ${tool.tool_name}`);

      return {
        success: true,
        data
      };
    } catch (error: any) {
      logger.error(`Error in executeToolQuery for ${tool.table_name}:`, error);
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

