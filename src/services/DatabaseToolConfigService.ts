/**
 * DatabaseToolConfigService
 * 
 * Manages external database tool configurations for companies
 * Handles CRUD operations, encryption, and schema introspection
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import logger from '../config/logger';

export interface DatabaseToolConfig {
  id?: number;
  uuid?: string;
  company_id: number;
  db_url_encrypted: string;
  db_key_encrypted: string;
  enabled: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export interface DatabaseTool {
  id?: number;
  uuid?: string;
  config_id: number;
  table_name: string;
  tool_name: string;
  tool_description: string;
  columns: string[];
  id_column: string;
  id_column_type: 'integer' | 'uuid' | 'string';
  enabled: boolean;
  requires_user_context?: boolean;
  user_filter_column?: string | null;
  user_filter_type?: 'uuid' | 'integer' | 'string' | null;
  user_context_key?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

export interface TableSchema {
  table_name: string;
  columns: Array<{
    column_name: string;
    data_type: string;
    is_nullable: string;
  }>;
}

export class DatabaseToolConfigService {
  private supabase: SupabaseClient;
  private encryptionKey: string;
  private algorithm = 'aes-256-cbc';

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
    
    // Use JWT_SECRET for encryption
    const key = process.env.JWT_SECRET || 'default-encryption-key-change-this';
    
    // Ensure key is 32 bytes for aes-256-cbc
    this.encryptionKey = crypto.createHash('sha256').update(key).digest('hex').substring(0, 32);
    
    if (!process.env.JWT_SECRET) {
      logger.warn('⚠️  No JWT_SECRET found - using default (insecure for production)');
    }
  }

  /**
   * Encrypt sensitive data
   */
  private encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.encryptionKey, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  /**
   * Decrypt sensitive data
   */
  private decrypt(text: string): string {
    const parts = text.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = parts[1];
    const decipher = crypto.createDecipheriv(this.algorithm, this.encryptionKey, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  /**
   * Create a new database tool configuration
   */
  async createConfig(companyId: number, dbUrl: string, dbKey: string): Promise<DatabaseToolConfig> {
    const encryptedUrl = this.encrypt(dbUrl);
    const encryptedKey = this.encrypt(dbKey);

    const { data, error } = await this.supabase
      .from('vezlo_database_tool_configs')
      .insert({
        company_id: companyId,
        db_url_encrypted: encryptedUrl,
        db_key_encrypted: encryptedKey,
        enabled: true
      })
      .select()
      .single();

    if (error) {
      logger.error('Failed to create database tool config:', error);
      throw new Error(`Failed to create config: ${error.message}`);
    }

    logger.info(`✅ Created database tool config for company ${companyId}`);
    return data;
  }

  /**
   * Get configuration by company ID
   */
  async getConfigByCompany(companyId: number): Promise<DatabaseToolConfig | null> {
    const { data, error } = await this.supabase
      .from('vezlo_database_tool_configs')
      .select('*')
      .eq('company_id', companyId)
      .eq('enabled', true)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = not found
      logger.error('Failed to get database tool config:', error);
      throw new Error(`Failed to get config: ${error.message}`);
    }

    return data || null;
  }

  /**
   * Get decrypted credentials for a company
   */
  async getDecryptedCredentials(companyId: number): Promise<{ url: string; key: string } | null> {
    const config = await this.getConfigByCompany(companyId);
    
    if (!config) {
      return null;
    }

    try {
      const url = this.decrypt(config.db_url_encrypted);
      const key = this.decrypt(config.db_key_encrypted);
      return { url, key };
    } catch (error) {
      logger.error('Failed to decrypt credentials:', error);
      throw new Error('Failed to decrypt database credentials');
    }
  }

  /**
   * Get decrypted credentials by config UUID
   */
  async getDecryptedCredentialsByConfigId(configUuid: string): Promise<{ url: string; key: string } | null> {
    const { data: config, error } = await this.supabase
      .from('vezlo_database_tool_configs')
      .select('*')
      .eq('uuid', configUuid)
      .single();

    if (error || !config) {
      logger.error('Failed to get config by UUID:', error);
      return null;
    }

    try {
      const url = this.decrypt(config.db_url_encrypted);
      const key = this.decrypt(config.db_key_encrypted);
      return { url, key };
    } catch (error) {
      logger.error('Failed to decrypt credentials:', error);
      throw new Error('Failed to decrypt database credentials');
    }
  }

  /**
   * Update configuration by UUID
   */
  async updateConfig(configUuid: string, dbUrl?: string, dbKey?: string, enabled?: boolean): Promise<DatabaseToolConfig> {
    const updates: any = {};

    if (dbUrl) {
      updates.db_url_encrypted = this.encrypt(dbUrl);
    }
    if (dbKey) {
      updates.db_key_encrypted = this.encrypt(dbKey);
    }
    if (enabled !== undefined) {
      updates.enabled = enabled;
    }
    
    updates.updated_at = new Date().toISOString();

    const { data, error } = await this.supabase
      .from('vezlo_database_tool_configs')
      .update(updates)
      .eq('uuid', configUuid)
      .select()
      .single();

    if (error) {
      logger.error('Failed to update database tool config:', error);
      throw new Error(`Failed to update config: ${error.message}`);
    }

    logger.info(`✅ Updated database tool config ${configUuid}`);
    return data;
  }

  /**
   * Delete configuration by UUID
   */
  async deleteConfig(configUuid: string): Promise<void> {
    const { error } = await this.supabase
      .from('vezlo_database_tool_configs')
      .delete()
      .eq('uuid', configUuid);

    if (error) {
      logger.error('Failed to delete database tool config:', error);
      throw new Error(`Failed to delete config: ${error.message}`);
    }

    logger.info(`✅ Deleted database tool config ${configUuid}`);
  }

  /**
   * Validate database connection and credentials (READ-ONLY)
   */
  async validateConnection(dbUrl: string, dbKey: string): Promise<{ valid: boolean; error?: string; tables?: string[] }> {
    try {
      // Use Supabase REST API to get OpenAPI schema (read-only operation)
      // This doesn't require any functions to be created in the database
      const response = await fetch(`${dbUrl}/rest/v1/`, {
        method: 'GET',
        headers: {
          'apikey': dbKey,
          'Authorization': `Bearer ${dbKey}`
        }
      });

      if (!response.ok) {
        return { valid: false, error: `Connection failed: ${response.statusText}` };
      }

      const openApiSpec: any = await response.json();
      
      // Extract table names from OpenAPI spec paths
      const tables: string[] = [];
      if (openApiSpec.paths) {
        logger.info(`📋 Found ${Object.keys(openApiSpec.paths).length} paths in OpenAPI spec`);
        for (const path of Object.keys(openApiSpec.paths)) {
          // Paths are like "/table_name" - extract table name
          const match = path.match(/^\/([^\/\?]+)/);
          if (match && match[1] && !match[1].startsWith('rpc')) {
            tables.push(match[1]);
          }
        }
      } else {
        logger.warn('⚠️ No paths found in OpenAPI spec - check if tables are exposed to REST API');
      }

      const uniqueTables = [...new Set(tables)];
      logger.info(`✅ Found ${uniqueTables.length} tables available via REST API`);
      return { valid: true, tables: uniqueTables };
    } catch (error: any) {
      return { valid: false, error: error.message || 'Connection failed' };
    }
  }

  /**
   * Introspect database schema - get all tables (READ-ONLY, no database writes required)
   */
  async introspectTables(dbUrl: string, dbKey: string): Promise<string[]> {
    try {
      // Use Supabase REST API OpenAPI endpoint (read-only, no setup required)
      const response = await fetch(`${dbUrl}/rest/v1/`, {
        method: 'GET',
        headers: {
          'apikey': dbKey,
          'Authorization': `Bearer ${dbKey}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch database schema: ${response.statusText}`);
      }

      const openApiSpec: any = await response.json();
      
      // Extract table names from OpenAPI spec
      const tables: string[] = [];
      if (openApiSpec.paths) {
        logger.info(`📋 Found ${Object.keys(openApiSpec.paths).length} paths in OpenAPI spec`);
        for (const path of Object.keys(openApiSpec.paths)) {
          // Paths are like "/table_name" - extract table name
          const match = path.match(/^\/([^\/\?]+)/);
          if (match && match[1] && !match[1].startsWith('rpc')) {
            tables.push(match[1]);
          }
        }
      } else {
        logger.warn('⚠️ No paths found in OpenAPI spec - tables may not be exposed to REST API');
      }

      const uniqueTables = [...new Set(tables)].sort();
      logger.info(`✅ Successfully introspected ${uniqueTables.length} tables available via REST API`);
      
      if (uniqueTables.length === 0) {
        logger.warn('⚠️ No tables found. Possible reasons:');
        logger.warn('  1. Database has no tables');
        logger.warn('  2. Tables are not exposed to Supabase REST API');
        logger.warn('  3. Check Supabase Dashboard > API Settings > API Docs to see available tables');
      }
      
      return uniqueTables;
    } catch (error: any) {
      logger.error('Failed to introspect tables:', error);
      throw new Error(`Failed to introspect tables: ${error.message}`);
    }
  }

  /**
   * Introspect table schema - get columns and types (READ-ONLY, no database writes required)
   */
  async introspectTableColumns(dbUrl: string, dbKey: string, tableName: string): Promise<TableSchema> {
    try {
      // Use Supabase REST API OpenAPI endpoint (read-only, no setup required)
      const response = await fetch(`${dbUrl}/rest/v1/`, {
        method: 'GET',
        headers: {
          'apikey': dbKey,
          'Authorization': `Bearer ${dbKey}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch database schema: ${response.statusText}`);
      }

      const openApiSpec: any = await response.json();
      
      // Find the schema definition for this table
      const tableDefinition = openApiSpec.definitions?.[tableName];
      
      if (!tableDefinition || !tableDefinition.properties) {
        throw new Error(`Table "${tableName}" not found or has no accessible columns`);
      }

      // Extract column information
      const columns: Array<{ column_name: string; data_type: string; is_nullable: string }> = [];
      
      for (const [columnName, columnSchema] of Object.entries(tableDefinition.properties)) {
        const schema = columnSchema as any;
        let dataType = schema.type || 'unknown';
        
        // Map OpenAPI types to PostgreSQL types
        if (schema.format === 'uuid') dataType = 'uuid';
        else if (schema.format === 'date-time') dataType = 'timestamp';
        else if (schema.format === 'date') dataType = 'date';
        else if (schema.type === 'integer') dataType = 'integer';
        else if (schema.type === 'number') dataType = 'numeric';
        else if (schema.type === 'boolean') dataType = 'boolean';
        else if (schema.type === 'string') dataType = 'text';
        else if (schema.type === 'array') dataType = 'array';
        
        const isNullable = tableDefinition.required?.includes(columnName) ? 'NO' : 'YES';
        
        columns.push({
          column_name: columnName,
          data_type: dataType,
          is_nullable: isNullable
        });
      }

      logger.info(`✅ Successfully introspected ${columns.length} columns for table "${tableName}"`);
      
      return {
        table_name: tableName,
        columns: columns.sort((a, b) => a.column_name.localeCompare(b.column_name))
      };
    } catch (error: any) {
      logger.error('Failed to introspect table columns:', error);
      throw new Error(`Failed to introspect columns for table "${tableName}": ${error.message}`);
    }
  }

  /**
   * Create a tool for a specific table (configUuid from API, get internal id)
   */
  async createTool(
    configUuid: string,
    tableName: string,
    toolName: string,
    toolDescription: string,
    columns: string[],
    idColumn: string,
    idColumnType: 'integer' | 'uuid' | 'string',
    requiresUserContext?: boolean,
    userFilterColumn?: string,
    userFilterType?: 'uuid' | 'integer' | 'string',
    userContextKey?: string
  ): Promise<DatabaseTool> {
    // Get internal config ID from UUID
    const { data: config } = await this.supabase
      .from('vezlo_database_tool_configs')
      .select('id')
      .eq('uuid', configUuid)
      .single();

    if (!config) {
      throw new Error('Config not found');
    }

    // Ensure columns is an array before stringifying
    const columnsArray = Array.isArray(columns) ? columns : 
                        (typeof columns === 'string' ? JSON.parse(columns) : columns);
    
    const { data, error } = await this.supabase
      .from('vezlo_database_tools')
      .insert({
        config_id: config.id,
        table_name: tableName,
        tool_name: toolName,
        tool_description: toolDescription,
        columns: JSON.stringify(columnsArray),
        id_column: idColumn,
        id_column_type: idColumnType,
        enabled: true,
        requires_user_context: requiresUserContext || false,
        user_filter_column: userFilterColumn || null,
        user_filter_type: userFilterType || null,
        user_context_key: userContextKey || null
      })
      .select()
      .single();

    if (error) {
      logger.error('Failed to create database tool:', error);
      throw new Error(`Failed to create tool: ${error.message}`);
    }

    logger.info(`✅ Created tool ${toolName} for table ${tableName}`);
    
    // Parse columns before returning
    return {
      ...data,
      columns: typeof data.columns === 'string' ? JSON.parse(data.columns) : data.columns
    };
  }

  /**
   * Get all tools for a configuration (by config internal ID)
   */
  async getToolsByConfigId(configId: number): Promise<DatabaseTool[]> {
    const { data, error } = await this.supabase
      .from('vezlo_database_tools')
      .select('*')
      .eq('config_id', configId)
      .order('table_name');

    if (error) {
      logger.error('Failed to get database tools:', error);
      throw new Error(`Failed to get tools: ${error.message}`);
    }

    // Parse columns JSONB field
    return (data || []).map(tool => ({
      ...tool,
      columns: typeof tool.columns === 'string' ? JSON.parse(tool.columns) : tool.columns
    }));
  }

  /**
   * Get all enabled tools for a company
   */
  async getEnabledToolsByCompany(companyId: number): Promise<DatabaseTool[]> {
    const { data, error } = await this.supabase
      .from('vezlo_database_tools')
      .select('*, vezlo_database_tool_configs!inner(company_id, enabled)')
      .eq('vezlo_database_tool_configs.company_id', companyId)
      .eq('vezlo_database_tool_configs.enabled', true)
      .eq('enabled', true);

    if (error) {
      logger.error('Failed to get enabled database tools:', error);
      throw new Error(`Failed to get enabled tools: ${error.message}`);
    }

    // Parse columns JSONB field
    return (data || []).map(tool => ({
      ...tool,
      columns: typeof tool.columns === 'string' ? JSON.parse(tool.columns) : tool.columns
    }));
  }

  /**
   * Update a tool by UUID
   */
  async updateTool(
    toolUuid: string,
    updates: {
      tool_name?: string;
      tool_description?: string;
      columns?: string[];
      id_column?: string;
      id_column_type?: 'integer' | 'uuid' | 'string';
      enabled?: boolean;
      requires_user_context?: boolean;
      user_filter_column?: string;
      user_filter_type?: 'uuid' | 'integer' | 'string';
      user_context_key?: string;
    }
  ): Promise<DatabaseTool> {
    const updateData: any = { ...updates, updated_at: new Date().toISOString() };
    
    if (updates.columns) {
      // Ensure columns is an array before stringifying
      const columnsArray = Array.isArray(updates.columns) ? updates.columns : 
                          (typeof updates.columns === 'string' ? JSON.parse(updates.columns) : updates.columns);
      updateData.columns = JSON.stringify(columnsArray);
    }

    const { data, error } = await this.supabase
      .from('vezlo_database_tools')
      .update(updateData)
      .eq('uuid', toolUuid)
      .select()
      .single();

    if (error) {
      logger.error('Failed to update database tool:', error);
      throw new Error(`Failed to update tool: ${error.message}`);
    }

    logger.info(`✅ Updated tool ${toolUuid}`);
    
    // Parse columns before returning
    return {
      ...data,
      columns: typeof data.columns === 'string' ? JSON.parse(data.columns) : data.columns
    };
  }

  /**
   * Delete a tool by UUID
   */
  async deleteTool(toolUuid: string): Promise<void> {
    const { error } = await this.supabase
      .from('vezlo_database_tools')
      .delete()
      .eq('uuid', toolUuid);

    if (error) {
      logger.error('Failed to delete database tool:', error);
      throw new Error(`Failed to delete tool: ${error.message}`);
    }

    logger.info(`✅ Deleted tool ${toolUuid}`);
  }
}

