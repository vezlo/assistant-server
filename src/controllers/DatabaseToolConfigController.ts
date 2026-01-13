/**
 * DatabaseToolConfigController
 * 
 * Handles API endpoints for managing external database tool configurations
 * Admin-only access
 */

import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { DatabaseToolConfigService } from '../services/DatabaseToolConfigService';
import { DatabaseToolService } from '../services/DatabaseToolService';
import logger from '../config/logger';

export class DatabaseToolConfigController {
  private service: DatabaseToolConfigService;
  private toolService?: DatabaseToolService;

  constructor(service: DatabaseToolConfigService, toolService?: DatabaseToolService) {
    this.service = service;
    this.toolService = toolService;
  }

  /**
   * Create new database configuration
   * POST /api/database-tools/config
   */
  async createConfig(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { db_url, db_key } = req.body;
      const companyId = parseInt(req.profile?.companyId || '0');

      if (!db_url || !db_key) {
        res.status(400).json({
          success: false,
          error: 'db_url and db_key are required'
        });
        return;
      }

      if (!companyId) {
        res.status(401).json({
          success: false,
          error: 'Company ID not found'
        });
        return;
      }

      // Check if config already exists
      const existing = await this.service.getConfigByCompany(companyId);
      if (existing) {
        res.status(409).json({
          success: false,
          error: 'Database configuration already exists for this company'
        });
        return;
      }

      const config = await this.service.createConfig(companyId, db_url, db_key);

      // Clear cache for this company (new config added)
      if (this.toolService) {
        this.toolService.clearClientCache(companyId);
        this.toolService.clearSchemaCache();
        logger.info(`🧹 Cleared cache after creating config for company ${companyId}`);
      }

      res.status(201).json({
        success: true,
        config: {
          uuid: config.uuid,
          company_id: config.company_id,
          enabled: config.enabled,
          created_at: config.created_at
        }
      });
    } catch (error) {
      logger.error('Create database config error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create configuration'
      });
    }
  }

  /**
   * Get database configuration for current company
   * GET /api/database-tools/config
   */
  async getConfig(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const companyId = parseInt(req.profile?.companyId || '0');

      if (!companyId) {
        res.status(401).json({
          success: false,
          error: 'Company ID not found'
        });
        return;
      }

      const config = await this.service.getConfigByCompany(companyId);

      if (!config) {
        res.status(404).json({
          success: false,
          error: 'No database configuration found'
        });
        return;
      }

      res.json({
        success: true,
        config: {
          uuid: config.uuid,
          company_id: config.company_id,
          enabled: config.enabled,
          created_at: config.created_at,
          updated_at: config.updated_at
        }
      });
    } catch (error) {
      logger.error('Get database config error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get configuration'
      });
    }
  }

  /**
   * Update database configuration
   * PUT /api/database-tools/config/:configId
   */
  async updateConfig(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const configId = Array.isArray(req.params.configId) ? req.params.configId[0] : req.params.configId;
      const { db_url, db_key, enabled } = req.body;
      const companyId = parseInt(req.profile?.companyId || '0');

      if (!companyId) {
        res.status(401).json({
          success: false,
          error: 'Company ID not found'
        });
        return;
      }

      // Verify ownership (configId from API is UUID)
      const existing = await this.service.getConfigByCompany(companyId);
      if (!existing || existing.uuid !== configId) {
        res.status(403).json({
          success: false,
          error: 'Configuration not found or access denied'
        });
        return;
      }

      const config = await this.service.updateConfig(configId, db_url, db_key, enabled);

      // Clear cache for this company (credentials or settings changed)
      if (this.toolService) {
        this.toolService.clearClientCache(companyId);
        this.toolService.clearSchemaCache();
        logger.info(`🧹 Cleared cache after updating config for company ${companyId}`);
      }

      res.json({
        success: true,
        config: {
          id: config.id,
          company_id: config.company_id,
          enabled: config.enabled,
          updated_at: config.updated_at
        }
      });
    } catch (error) {
      logger.error('Update database config error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update configuration'
      });
    }
  }

  /**
   * Delete database configuration
   * DELETE /api/database-tools/config/:configId
   */
  async deleteConfig(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const configId = Array.isArray(req.params.configId) ? req.params.configId[0] : req.params.configId;
      const companyId = parseInt(req.profile?.companyId || '0');

      if (!companyId) {
        res.status(401).json({
          success: false,
          error: 'Company ID not found'
        });
        return;
      }

      // Verify ownership (configId from API is UUID)
      const existing = await this.service.getConfigByCompany(companyId);
      if (!existing || existing.uuid !== configId) {
        res.status(403).json({
          success: false,
          error: 'Configuration not found or access denied'
        });
        return;
      }

      await this.service.deleteConfig(configId);

      // Clear cache for this company (config deleted)
      if (this.toolService) {
        this.toolService.clearClientCache(companyId);
        this.toolService.clearSchemaCache();
        logger.info(`🧹 Cleared cache after deleting config for company ${companyId}`);
      }

      res.json({
        success: true,
        message: 'Configuration deleted successfully'
      });
    } catch (error) {
      logger.error('Delete database config error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete configuration'
      });
    }
  }

  /**
   * Validate database connection
   * POST /api/database-tools/validate
   */
  async validateConnection(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { db_url, db_key } = req.body;

      if (!db_url || !db_key) {
        res.status(400).json({
          success: false,
          error: 'db_url and db_key are required'
        });
        return;
      }

      const result = await this.service.validateConnection(db_url, db_key);

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      logger.error('Validate connection error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to validate connection'
      });
    }
  }

  /**
   * Get available tables from database
   * POST /api/database-tools/tables
   */
  async getTables(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { db_url, db_key } = req.body;

      if (!db_url || !db_key) {
        res.status(400).json({
          success: false,
          error: 'db_url and db_key are required'
        });
        return;
      }

      const tables = await this.service.introspectTables(db_url, db_key);

      res.json({
        success: true,
        tables
      });
    } catch (error) {
      logger.error('Get tables error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get tables'
      });
    }
  }

  /**
   * Get available tables from existing config
   * GET /api/database-tools/config/:configId/tables
   */
  async getTablesFromConfig(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const configId = Array.isArray(req.params.configId) ? req.params.configId[0] : req.params.configId;
      const companyId = parseInt(req.profile?.companyId || '0');

      if (!companyId) {
        res.status(401).json({
          success: false,
          error: 'Company ID not found'
        });
        return;
      }

      // Get decrypted credentials
      const credentials = await this.service.getDecryptedCredentialsByConfigId(configId);
      
      if (!credentials) {
        res.status(404).json({
          success: false,
          error: 'Configuration not found'
        });
        return;
      }

      const tables = await this.service.introspectTables(credentials.url, credentials.key);

      res.json({
        success: true,
        tables
      });
    } catch (error) {
      logger.error('Get tables from config error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get tables'
      });
    }
  }

  /**
   * Get table schema from existing config
   * GET /api/database-tools/config/:configId/tables/:tableName/schema
   */
  async getTableSchemaFromConfig(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const configId = Array.isArray(req.params.configId) ? req.params.configId[0] : req.params.configId;
      const tableName = Array.isArray(req.params.tableName) ? req.params.tableName[0] : req.params.tableName;
      const companyId = parseInt(req.profile?.companyId || '0');

      if (!companyId) {
        res.status(401).json({
          success: false,
          error: 'Company ID not found'
        });
        return;
      }

      // Get decrypted credentials
      const credentials = await this.service.getDecryptedCredentialsByConfigId(configId);
      
      if (!credentials) {
        res.status(404).json({
          success: false,
          error: 'Configuration not found'
        });
        return;
      }

      const schema = await this.service.introspectTableColumns(credentials.url, credentials.key, tableName);

      res.json({
        success: true,
        schema
      });
    } catch (error) {
      logger.error('Get table schema from config error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get table schema'
      });
    }
  }

  /**
   * Get table schema (columns)
   * POST /api/database-tools/tables/:tableName/schema
   */
  async getTableSchema(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const tableName = Array.isArray(req.params.tableName) ? req.params.tableName[0] : req.params.tableName;
      const { db_url, db_key } = req.body;

      if (!db_url || !db_key) {
        res.status(400).json({
          success: false,
          error: 'db_url and db_key are required'
        });
        return;
      }

      const schema = await this.service.introspectTableColumns(db_url, db_key, tableName);

      res.json({
        success: true,
        schema
      });
    } catch (error) {
      logger.error('Get table schema error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get table schema'
      });
    }
  }

  /**
   * Create a tool for a table
   * POST /api/database-tools/tools
   */
  async createTool(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { 
        config_id, 
        table_name, 
        tool_name, 
        tool_description, 
        columns, 
        id_column, 
        id_column_type,
        requires_user_context,
        user_filter_column,
        user_filter_type,
        user_context_key
      } = req.body;
      const companyId = parseInt(req.profile?.companyId || '0');

      if (!config_id || !table_name || !tool_name || !columns || !id_column) {
        res.status(400).json({
          success: false,
          error: 'config_id, table_name, tool_name, columns, and id_column are required'
        });
        return;
      }

      if (!companyId) {
        res.status(401).json({
          success: false,
          error: 'Company ID not found'
        });
        return;
      }

      // Verify ownership of config (config_id from API is UUID)
      const config = await this.service.getConfigByCompany(companyId);
      if (!config || config.uuid !== config_id) {
        res.status(403).json({
          success: false,
          error: 'Configuration not found or access denied'
        });
        return;
      }

      const tool = await this.service.createTool(
        config_id, // This is UUID from API
        table_name,
        tool_name,
        tool_description || `Get data from ${table_name}`,
        columns,
        id_column,
        id_column_type || 'integer',
        requires_user_context,
        user_filter_column,
        user_filter_type,
        user_context_key
      );

      // Return only public fields (UUID, not internal ID)
      res.status(201).json({
        success: true,
        tool: {
          uuid: tool.uuid,
          table_name: tool.table_name,
          tool_name: tool.tool_name,
          tool_description: tool.tool_description,
          columns: tool.columns,
          id_column: tool.id_column,
          id_column_type: tool.id_column_type,
          enabled: tool.enabled,
          requires_user_context: tool.requires_user_context,
          user_filter_column: tool.user_filter_column,
          user_filter_type: tool.user_filter_type,
          user_context_key: tool.user_context_key,
          created_at: tool.created_at
        }
      });
    } catch (error) {
      logger.error('Create tool error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create tool'
      });
    }
  }

  /**
   * Get all tools for current company
   * GET /api/database-tools/tools
   */
  async getTools(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const companyId = parseInt(req.profile?.companyId || '0');

      if (!companyId) {
        res.status(401).json({
          success: false,
          error: 'Company ID not found'
        });
        return;
      }

      const tools = await this.service.getEnabledToolsByCompany(companyId);

      // Map to expose only UUID, not internal ID
      const publicTools = tools.map(tool => ({
        uuid: tool.uuid,
        table_name: tool.table_name,
        tool_name: tool.tool_name,
        tool_description: tool.tool_description,
        columns: tool.columns,
        id_column: tool.id_column,
        id_column_type: tool.id_column_type,
        enabled: tool.enabled,
        requires_user_context: tool.requires_user_context,
        user_filter_column: tool.user_filter_column,
        user_filter_type: tool.user_filter_type,
        user_context_key: tool.user_context_key,
        created_at: tool.created_at,
        updated_at: tool.updated_at
      }));

      res.json({
        success: true,
        tools: publicTools
      });
    } catch (error) {
      logger.error('Get tools error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get tools'
      });
    }
  }

  /**
   * Update a tool
   * PUT /api/database-tools/tools/:toolId
   */
  async updateTool(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const toolId = Array.isArray(req.params.toolId) ? req.params.toolId[0] : req.params.toolId;
      const updates = req.body;
      const companyId = parseInt(req.profile?.companyId || '0');

      if (!companyId) {
        res.status(401).json({
          success: false,
          error: 'Company ID not found'
        });
        return;
      }

      // Verify ownership
      const config = await this.service.getConfigByCompany(companyId);
      if (!config) {
        res.status(403).json({
          success: false,
          error: 'Access denied'
        });
        return;
      }

      const tool = await this.service.updateTool(toolId, updates);

      // Return only public fields (UUID, not internal ID)
      res.json({
        success: true,
        tool: {
          uuid: tool.uuid,
          table_name: tool.table_name,
          tool_name: tool.tool_name,
          tool_description: tool.tool_description,
          columns: tool.columns,
          id_column: tool.id_column,
          id_column_type: tool.id_column_type,
          enabled: tool.enabled,
          requires_user_context: tool.requires_user_context,
          user_filter_column: tool.user_filter_column,
          user_filter_type: tool.user_filter_type,
          user_context_key: tool.user_context_key,
          created_at: tool.created_at,
          updated_at: tool.updated_at
        }
      });
    } catch (error) {
      logger.error('Update tool error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update tool'
      });
    }
  }

  /**
   * Delete a tool
   * DELETE /api/database-tools/tools/:toolId
   */
  async deleteTool(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const toolId = Array.isArray(req.params.toolId) ? req.params.toolId[0] : req.params.toolId;
      const companyId = parseInt(req.profile?.companyId || '0');

      if (!companyId) {
        res.status(401).json({
          success: false,
          error: 'Company ID not found'
        });
        return;
      }

      // Verify ownership
      const config = await this.service.getConfigByCompany(companyId);
      if (!config) {
        res.status(403).json({
          success: false,
          error: 'Access denied'
        });
        return;
      }

      await this.service.deleteTool(toolId);

      res.json({
        success: true,
        message: 'Tool deleted successfully'
      });
    } catch (error) {
      logger.error('Delete tool error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete tool'
      });
    }
  }
}



