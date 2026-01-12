import { Request, Response } from 'express';
import { KnowledgeBaseService } from '../services/KnowledgeBaseService';
import { AIService } from '../services/AIService';
import { CitationService } from '../services/CitationService';
import { AuthenticatedRequest } from '../middleware/auth';
import logger from '../config/logger';

export class KnowledgeController {
  private knowledgeBase: KnowledgeBaseService;
  private aiService?: AIService;
  private citationService?: CitationService;

  constructor(knowledgeBase: KnowledgeBaseService, aiService?: AIService, citationService?: CitationService) {
    this.knowledgeBase = knowledgeBase;
    this.aiService = aiService;
    this.citationService = citationService;
  }

  async createItem(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { 
        parent_uuid,
        title, 
        description, 
        type, 
        content, 
        chunks,
        hasEmbeddings,
        file_url, 
        file_size, 
        file_type, 
        metadata
      } = req.body;

      if (!title || !type) {
        res.status(400).json({ error: 'title and type are required' });
        return;
      }

      // Get company ID from either profile (JWT) or company (API key)
      const companyId = req.profile?.companyId ? parseInt(req.profile.companyId) : 
                       req.company?.id ? parseInt(req.company.id) : undefined;

      if (!companyId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      // Validate type
      const validTypes = ['folder', 'document', 'file', 'url', 'url_directory'];
      if (!validTypes.includes(type)) {
        res.status(400).json({ error: `type must be one of: ${validTypes.join(', ')}` });
        return;
      }

      // Validate required fields based on type
      // For document type: either content OR chunks must be provided
      if (type === 'document') {
        if (!content && (!chunks || !Array.isArray(chunks) || chunks.length === 0)) {
          res.status(400).json({ error: 'content or chunks array is required for document type' });
          return;
        }
      }

      if ((type === 'file' || type === 'url') && !file_url) {
        res.status(400).json({ error: 'file_url is required for file and url types' });
        return;
      }

      // Get created_by from user (JWT auth) or admin user (API key auth)
      // API key middleware already fetches the admin user, so we just use it
      const createdBy = req.user?.id ? parseInt(req.user.id) : 
                       req.company?.adminUserId ? req.company.adminUserId : 
                       undefined;

      const itemId = await this.knowledgeBase.createItem({
        parent_id: parent_uuid,
        company_id: companyId,
        title,
        description,
        type,
        content,
        chunks,
        hasEmbeddings: hasEmbeddings === true,
        file_url,
        file_size,
        file_type,
        metadata,
        created_by: createdBy
      });

      res.json({
        success: true,
        uuid: itemId
      });

    } catch (error) {
      logger.error('Create knowledge item error:', error);
      res.status(500).json({
        error: 'Failed to create knowledge item',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async getItem(req: Request, res: Response): Promise<void> {
    try {
      const uuid = Array.isArray(req.params.uuid) ? req.params.uuid[0] : req.params.uuid;
      const item = await this.knowledgeBase.getItem(uuid);

      if (!item) {
        res.status(404).json({ error: 'Knowledge item not found' });
        return;
      }

      res.json({
        uuid: item.id,
        parent_uuid: item.parent_id,
        company_uuid: item.company_id,
        title: item.title,
        description: item.description,
        type: item.type,
        content: item.content,
        file_url: item.file_url,
        file_size: item.file_size,
        file_type: item.file_type,
        metadata: item.metadata,
        created_by: item.created_by
      });

    } catch (error) {
      logger.error('Get knowledge item error:', error);
      res.status(500).json({
        error: 'Failed to get knowledge item',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async listItems(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { 
        parent_uuid, 
        type, 
        limit = '50', 
        offset = '0' 
      } = req.query;

      if (!req.profile) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const options = {
        parent_id: parent_uuid as string,
        company_id: req.profile?.companyId ? parseInt(req.profile.companyId) : undefined,
        type: type as string,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string)
      };

      const result = await this.knowledgeBase.listItems(options);

      res.json({
        items: result.items.map(item => ({
          uuid: item.id,
          parent_uuid: item.parent_id,
          title: item.title,
          description: item.description,
          type: item.type,
          file_url: item.file_url,
          file_size: item.file_size,
          file_type: item.file_type,
          metadata: item.metadata
        })),
        total: result.total,
        limit: options.limit,
        offset: options.offset
      });

    } catch (error) {
      logger.error('List knowledge items error:', error);
      res.status(500).json({
        error: 'Failed to list knowledge items',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async updateItem(req: Request, res: Response): Promise<void> {
    try {
      const uuid = Array.isArray(req.params.uuid) ? req.params.uuid[0] : req.params.uuid;
      const { 
        title, 
        description, 
        content, 
        file_url, 
        file_size, 
        file_type, 
        metadata 
      } = req.body;

      const success = await this.knowledgeBase.updateItem(uuid, {
        title,
        description,
        content,
        file_url,
        file_size,
        file_type,
        metadata
      });

      if (!success) {
        res.status(404).json({ error: 'Knowledge item not found or could not be updated' });
        return;
      }

      res.json({ success: true });

    } catch (error) {
      logger.error('Update knowledge item error:', error);
      res.status(500).json({
        error: 'Failed to update knowledge item',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async deleteItem(req: Request, res: Response): Promise<void> {
    try {
      const uuid = Array.isArray(req.params.uuid) ? req.params.uuid[0] : req.params.uuid;
      const success = await this.knowledgeBase.deleteItem(uuid);

      if (!success) {
        res.status(404).json({ error: 'Knowledge item not found or could not be deleted' });
        return;
      }

      res.json({ success: true });

    } catch (error) {
      logger.error('Delete knowledge item error:', error);
      res.status(500).json({
        error: 'Failed to delete knowledge item',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async search(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { query, limit = '5', threshold = '0.5', type = 'semantic' } = req.body;

      if (!query) {
        res.status(400).json({ error: 'query is required' });
        return;
      }

      // Get company ID from either profile (JWT) or company (API key)
      const companyId = req.profile?.companyId ? parseInt(req.profile.companyId) : 
                       req.company?.id ? parseInt(req.company.id) : undefined;

      if (!companyId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const results = await this.knowledgeBase.search(query, {
        limit: parseInt(limit as string),
        company_id: companyId
      });

      res.json({
        query,
        results: results.map(result => ({
          uuid: result.id,
          title: result.title,
          description: result.description,
          content: result.content,
          type: result.type,
          score: result.score,
          metadata: result.metadata
        }))
      });

    } catch (error) {
      logger.error('Search knowledge items error:', error);
      res.status(500).json({
        error: 'Failed to search knowledge items',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async ragSearch(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { query } = req.body;

      if (!query) {
        res.status(400).json({ error: 'query is required' });
        return;
      }

      // Get company ID from either profile (JWT) or company (API key)
      const companyId = req.profile?.companyId ? parseInt(req.profile.companyId) : 
                       req.company?.id ? parseInt(req.company.id) : undefined;

      if (!companyId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      if (!this.aiService) {
        res.status(500).json({ error: 'AI service not available' });
        return;
      }

      // Perform knowledge base search
      const searchResults = await this.knowledgeBase.search(query, {
        limit: 5,
        company_id: companyId
      });

      // Format search results for AI context
      let knowledgeContext = '';
      if (searchResults.length > 0) {
        knowledgeContext = '\n\nRelevant information from knowledge base:\n';
        searchResults.forEach(result => {
          knowledgeContext += `- ${result.title}: ${result.content}\n`;
        });
      }

      // Generate AI response with knowledge context
      const aiResponse = await (this.aiService as any).generateResponse(query, {
        knowledgeResults: knowledgeContext
      });

      res.json({
        response: aiResponse.content
      });

    } catch (error) {
      logger.error('RAG search error:', error);
      res.status(500).json({
        error: 'Failed to perform RAG search',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get citation context for a knowledge item
   * Public API - no authentication required for widget access
   */
  async getCitationContext(req: Request, res: Response): Promise<void> {
    try {
      const uuid = Array.isArray(req.params.uuid) ? req.params.uuid[0] : req.params.uuid;
      const chunkIndicesParam = req.query.chunk_indices as string;

      if (!chunkIndicesParam) {
        res.status(400).json({ error: 'chunk_indices query parameter required' });
        return;
      }

      const chunkIndices = chunkIndicesParam.split(',').map(i => parseInt(i.trim(), 10)).filter(i => !isNaN(i));

      if (chunkIndices.length === 0) {
        res.status(400).json({ error: 'Invalid chunk_indices format' });
        return;
      }

      if (!this.citationService) {
        res.status(500).json({ error: 'Citation service not available' });
        return;
      }

      const context = await this.citationService.getContext(uuid, chunkIndices);

      if (!context) {
        res.status(404).json({ error: 'Document not found or no chunks available' });
        return;
      }

      res.json(context);
    } catch (error) {
      logger.error('Get citation context error:', error);
      res.status(500).json({
        error: 'Failed to get citation context',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}