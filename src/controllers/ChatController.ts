import { Request, Response } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';
import { ChatManager } from '../services/ChatManager';
import { UnifiedStorage } from '../storage/UnifiedStorage';
import { AuthenticatedRequest } from '../middleware/auth';
import logger from '../config/logger';
import { IntentService } from '../services/IntentService';
import { ChatConversation, ChatMessage, StoredChatMessage } from '../types';
import { RealtimePublisher } from '../services/RealtimePublisher';
import { ResponseGenerationService } from '../services/ResponseGenerationService';
import { ResponseStreamingService } from '../services/ResponseStreamingService';
import { ValidationService } from '../services/ValidationService';
import { DatabaseToolService } from '../services/DatabaseToolService';
import { AISettingsService } from '../services/AISettingsService';
import { DepthResolverService } from '../services/depth-resolver.service';

export class ChatController {
  private chatManager: ChatManager;
  private storage: UnifiedStorage;
  private supabase: SupabaseClient;
  private chatHistoryLength: number;
  private intentService?: IntentService;
  private realtimePublisher?: RealtimePublisher;
  private responseGenerationService: ResponseGenerationService;
  private responseStreamingService: ResponseStreamingService;
  private validationService?: ValidationService;
  private databaseToolService?: DatabaseToolService;
  private aiSettingsService?: AISettingsService;
  private depthResolverService: DepthResolverService;

  constructor(
    chatManager: ChatManager,
    storage: UnifiedStorage,
    supabase: SupabaseClient,
    options: { historyLength?: number; intentService?: IntentService; realtimePublisher?: RealtimePublisher; validationService?: ValidationService; databaseToolService?: DatabaseToolService; aiSettingsService?: AISettingsService } = {}
  ) {
    this.chatManager = chatManager;
    this.storage = storage;
    this.supabase = supabase;
    const { historyLength } = options;
    this.chatHistoryLength = typeof historyLength === 'number' && historyLength > 0 ? historyLength : 2;
    this.intentService = options.intentService;
    this.realtimePublisher = options.realtimePublisher;
    this.validationService = options.validationService;
    this.databaseToolService = options.databaseToolService;
    this.aiSettingsService = options.aiSettingsService;
    this.depthResolverService = new DepthResolverService(supabase);
    
    // Initialize services
    const aiService = (chatManager as any).aiService;
    this.responseGenerationService = new ResponseGenerationService(
      this.intentService,
      aiService,
      this.chatHistoryLength,
      this.databaseToolService
    );
    this.responseStreamingService = new ResponseStreamingService();
  }

  // Create a new conversation
  async createConversation(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { title, technical_depth } = req.body;

      // Validate technical_depth if provided
      if (technical_depth !== undefined) {
        if (typeof technical_depth !== 'number' || !Number.isInteger(technical_depth) || technical_depth < 1 || technical_depth > 5) {
          res.status(400).json({ error: 'technical_depth must be an integer between 1 and 5' });
          return;
        }
      }

      let userId: string;
      let companyId: string;
      let userUuid: string;
      let companyUuid: string;

      // If authenticated, use authenticated user's info
      if (req.user && req.profile) {
        userId = req.user.id.toString();
        companyId = req.profile.companyId;
        userUuid = req.user.uuid;
        companyUuid = req.profile.companyUuid;
      } else {
        // For unauthenticated requests, get default company and admin user
        try {
          // Get default company (by domain 'default' or first company)
          const { data: company, error: companyError } = await this.supabase
            .from('vezlo_companies')
            .select('id, uuid')
            .eq('domain', 'default')
            .single();

          if (companyError || !company) {
            // Try to get first company if no default company exists
            const { data: firstCompany } = await this.supabase
              .from('vezlo_companies')
              .select('id, uuid')
              .limit(1)
              .single();

            if (!firstCompany) {
              res.status(400).json({
                error: 'Cannot create conversation',
                message: 'No company found. Please run the setup command to create a default company first.'
              });
              return;
            }

            companyId = firstCompany.id.toString();
            companyUuid = firstCompany.uuid;
          } else {
            companyId = company.id.toString();
            companyUuid = company.uuid;
          }

          // Get admin user for the company
          const { data: profile, error: profileError } = await this.supabase
            .from('vezlo_user_company_profiles')
            .select(`
              user_id,
              vezlo_users!inner (
                id,
                uuid
              )
            `)
            .eq('company_id', parseInt(companyId))
            .eq('role', 'admin')
            .eq('status', 'active')
            .limit(1)
            .single();

          if (profileError || !profile || !profile.vezlo_users) {
            res.status(400).json({
              error: 'Cannot create conversation',
              message: 'No admin user found for the company. Please run the setup command to create a default admin user first.'
            });
            return;
          }

          const user = Array.isArray(profile.vezlo_users) ? profile.vezlo_users[0] : profile.vezlo_users;
          userId = user.id.toString();
          userUuid = user.uuid;
        } catch (error) {
          logger.error('Error fetching default company/user:', error);
          res.status(500).json({
            error: 'Failed to create conversation',
            message: 'Error fetching default company and user'
          });
          return;
        }
      }

      // Generate a unique thread ID for the conversation
      const threadId = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const now = new Date();
      const conversation = await this.storage.saveConversation({
        threadId,
        userId,
        organizationId: companyId,
        title: title || 'New Conversation',
        messageCount: 0,
        createdAt: now,
        updatedAt: now,
        lastMessageAt: now,
        technical_depth: technical_depth ?? null
      });

      // Publish realtime update for new conversation
      if (this.realtimePublisher && companyUuid) {
        try {
          await this.realtimePublisher.publish(
            `company:${companyUuid}:conversations`,
            'conversation:created',
            {
              conversation: {
                uuid: conversation.id,
                status: 'open',
                message_count: conversation.messageCount,
                last_message_at: conversation.lastMessageAt?.toISOString() || now.toISOString(),
                created_at: conversation.createdAt.toISOString()
              }
            }
          );
        } catch (error) {
          logger.error('[ChatController] Failed to publish conversation:created event:', error);
        }
      }

      res.json({
        uuid: conversation.id,
        title: conversation.title,
        user_uuid: userUuid,
        company_uuid: companyUuid,
        message_count: conversation.messageCount,
        created_at: conversation.createdAt
      });

    } catch (error) {
      logger.error('Create conversation error:', error);
      res.status(500).json({
        error: 'Failed to create conversation',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Create a user message in a conversation
  async createUserMessage(req: Request, res: Response): Promise<void> {
    try {
      const uuid = Array.isArray(req.params.uuid) ? req.params.uuid[0] : req.params.uuid;
      const { content } = req.body;

      if (!content) {
        res.status(400).json({ error: 'content is required' });
        return;
      }

      // Check if conversation exists
      const conversation = await this.storage.getConversation(uuid);
      if (!conversation) {
        res.status(404).json({ error: 'Conversation not found' });
        return;
      }

      // Create user message
      const userMessage = await this.storage.saveMessage({
        conversationId: uuid,
        threadId: conversation.threadId,
        role: 'user',
        content,
        createdAt: new Date()
      });

      // Update conversation message count
      const timestamp = new Date();
      const newMessageCount = conversation.messageCount + 1;
      await this.storage.updateConversation(uuid, {
        messageCount: newMessageCount,
        lastMessageAt: timestamp
      });

      // Publish realtime update
      if (this.realtimePublisher && conversation.organizationId) {
        try {
          logger.info(`[ChatController] Fetching company UUID for organizationId: ${conversation.organizationId}`);
          const { data: company } = await this.supabase
            .from('vezlo_companies')
            .select('uuid')
            .eq('id', conversation.organizationId)
            .single();

          if (company?.uuid) {
            logger.info(`[ChatController] Publishing user message update for company: ${company.uuid}`);
            await this.realtimePublisher.publish(
              `company:${company.uuid}:conversations`,
              'message:created',
              {
                conversation_uuid: uuid,
                message: {
                  uuid: userMessage.id,
                  content: userMessage.content,
                  type: userMessage.role,
                  author_id: null,
                  created_at: userMessage.createdAt.toISOString()
                },
                conversation_update: {
                  message_count: newMessageCount,
                  last_message_at: timestamp.toISOString(),
                  status: conversation.joinedAt ? 'in_progress' : 'open'
                }
              }
            );
          }
        } catch (error) {
          logger.error('[ChatController] Failed to publish realtime update:', error);
        }
      }

      res.json({
        uuid: userMessage.id,
        conversation_uuid: uuid,
        type: userMessage.role,
        content: userMessage.content,
        created_at: userMessage.createdAt
      });

    } catch (error) {
      logger.error('Create user message error:', error);
      res.status(500).json({
        error: 'Failed to create user message',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Generate AI response for a user message
  async generateResponse(req: AuthenticatedRequest, res: Response): Promise<void> {
    const uuid = Array.isArray(req.params.uuid) ? req.params.uuid[0] : req.params.uuid;
    if (!uuid) {
      res.status(400).json({ error: 'Message UUID is required' });
      return;
    }

    // After validation, uuid is guaranteed to be a string - use type assertion
    const messageUuid = uuid as string;

    try {

      // Get the user message by ID using the repository
      const userMessage = await this.storage.getMessageById(messageUuid);
      
      if (!userMessage) {
        res.status(404).json({ error: 'Message not found' });
        return;
      }

      const conversationId = userMessage.conversationId;
      const userMessageContent = userMessage.content;
      
      // Extract user_context from request body (optional)
      const userContext = req.body?.user_context || {};

      // Get conversation context (recent messages)
      // Exclude the current user message to avoid duplication (it's added separately as the query)
      const allMessages = await this.chatManager.getRecentMessages(conversationId, this.chatHistoryLength + 1);
      const messages = allMessages.filter(msg => msg.id !== messageUuid).slice(-this.chatHistoryLength);
      logger.info(`📜 Retrieved ${messages.length} message(s) from conversation history (limit: ${this.chatHistoryLength})`);
      
      const conversation = await this.storage.getConversation(conversationId);

      // Check if conversation has been joined by an agent
      if (conversation?.joinedAt) {
        res.status(400).json({ 
          error: 'Conversation is being handled by an agent',
          message: 'AI responses are disabled when an agent has joined the conversation'
        });
        return;
      }

      // Set up Server-Sent Events (SSE) headers for streaming
      this.responseStreamingService.setupSSEHeaders(res);

      // Load and apply AI settings for this company before generating response
      const companyId = conversation?.organizationId ? parseInt(String(conversation.organizationId), 10) : undefined;
      
      // Try to get company UUID from profile or fetch from database using companyId
      let companyUuid = req.profile?.companyUuid;
      
      if (!companyUuid && companyId && this.aiSettingsService) {
        // Fallback: fetch company UUID from database using companyId
        try {
          const { data: company } = await this.supabase
            .from('vezlo_companies')
            .select('uuid')
            .eq('id', companyId)
            .single();
          
          if (company) {
            companyUuid = company.uuid;
            logger.info(`🔍 Fetched company UUID from database: ${companyUuid}`);
          }
        } catch (error) {
          logger.warn('⚠️ Failed to fetch company UUID from database:', error);
        }
      }
      
      if (this.aiSettingsService && companyUuid) {
        try {
          logger.info(`🔍 Loading AI settings for company: ${companyUuid}`);
          const aiSettings = await this.aiSettingsService.getSettingsByCompanyUuid(companyUuid);
          logger.info(`📦 AI Settings loaded:`, {
            model: aiSettings.model,
            temperature: aiSettings.temperature,
            max_tokens: aiSettings.max_tokens,
            hasPrompts: !!aiSettings.prompts,
            promptKeys: aiSettings.prompts ? Object.keys(aiSettings.prompts) : []
          });
          const aiService = this.responseGenerationService.getAIService();
          if (aiService) {
            (aiService as any).setAISettings(aiSettings);
            logger.info(`✅ AI settings applied to AIService for company: ${companyUuid}`);
          } else {
            logger.warn('⚠️ AIService not available in ResponseGenerationService');
          }
          
          // Also set ALL AI settings prompts in ResponseGenerationService for intent classification
          if (aiSettings.prompts) {
            this.responseGenerationService.setAISettingsPrompts(aiSettings.prompts);
          }
        } catch (error) {
          logger.warn('⚠️ Failed to load AI settings, using defaults:', error);
        }
      } else {
        logger.warn(`⚠️ Cannot load AI settings: aiSettingsService=${!!this.aiSettingsService}, companyUuid=${companyUuid}, companyId=${companyId}`);
      }

      // Resolve and apply technical depth
      if (companyUuid) {
        try {
          const requestDepth = typeof req.body?.technical_depth === 'number' ? req.body.technical_depth : undefined;

          // Validate request depth if provided
          if (requestDepth !== undefined && (!Number.isInteger(requestDepth) || requestDepth < 1 || requestDepth > 5)) {
            res.status(400).json({ error: 'technical_depth must be an integer between 1 and 5' });
            return;
          }

          const resolvedDepth = await this.depthResolverService.resolveDepth({
            requestDepth,
            conversationUuid: conversationId,
            companyUuid
          });

          const aiService = this.responseGenerationService.getAIService();
          if (aiService) {
            (aiService as any).setTechnicalDepth(resolvedDepth);
          }
        } catch (error) {
          logger.warn('⚠️ Failed to resolve technical depth, using defaults:', error);
        }
      }

      // Run intent classification to decide handling strategy (with dynamic tools)
      const intentResult = await this.responseGenerationService.classifyIntent(userMessageContent, messages, companyId);
      const intentResponse = this.responseGenerationService.handleIntentResult(intentResult, userMessageContent);

      let accumulatedContent = '';
      let assistantMessageId: string | undefined;
      let sources: Array<{ document_uuid: string; document_title: string; chunk_indices: number[] }> = [];

      try {
        // Handle database_tool intent separately
        if (intentResult.intent === 'database_tool' && intentResult.toolCall) {
          logger.info(`🔧 Database tool call detected: ${intentResult.toolCall.toolName}`);
          
          if (!this.databaseToolService || !companyId) {
            logger.warn('⚠️ Database tool requested but service not available or no company ID');
            await this.responseStreamingService.streamTextContent(
              'I apologize, but I cannot access your data at the moment. Please contact support.',
              res
            );
            accumulatedContent = 'I apologize, but I cannot access your data at the moment. Please contact support.';
          } else {
            // Execute tool with dynamic parameters and user context
            logger.info(`🔧 Executing tool: ${intentResult.toolCall.toolName} for company: ${companyId}`);
            const toolResult = await this.databaseToolService.executeTool(
              intentResult.toolCall.toolName,
              intentResult.toolCall.parameters,
              companyId,
              userContext // Pass user context for filtering
            );
            
            // Check if tool execution was successful
            if (!toolResult.success) {
              logger.error(`❌ Tool execution failed: ${toolResult.error}`);
              await this.responseStreamingService.streamTextContent(
                'I apologize, but I encountered an error accessing your data. Please try again or contact support.',
                res
              );
              accumulatedContent = 'I apologize, but I encountered an error accessing your data. Please try again or contact support.';
            } else {
              // Format result with LLM - use direct OpenAI call to bypass system prompt restrictions
              logger.info('🔧 Formatting tool result with LLM');
              
              const aiService = this.responseGenerationService.getAIService();
              if (!aiService) {
                throw new Error('AI service not available');
              }
              
              // Get AI settings from the AI service (model, temperature)
              const aiSettings = (aiService as any).aiSettings;
              const modelToUse = aiSettings?.model || process.env.AI_MODEL || 'gpt-4o-mini';
              const temperature = aiSettings?.temperature ?? parseFloat(process.env.AI_TEMPERATURE || '0.7');
              const maxTokens = parseInt(process.env.AI_MAX_TOKENS || '500', 10);
              
              // Direct OpenAI call bypassing the restrictive system prompt
              const openai = (aiService as any).openai;
              
              const completion = await openai.chat.completions.create({
                model: modelToUse,
                messages: [
                  {
                    role: 'system',
                    content: 'You are a helpful assistant. Format database query results naturally and conversationally for the user.'
                  },
                  {
                    role: 'user',
                    content: `User asked: "${userMessageContent}"

Database returned:
${JSON.stringify(toolResult.data || toolResult, null, 2)}

Provide a natural, friendly response to the user's question using this data.`
                  }
                ],
                temperature,
                max_tokens: maxTokens
              });
              
              const formattedContent = completion.choices[0]?.message?.content || 'Here is your information.';
              
              logger.info('📤 Streaming database tool response');
              await this.responseStreamingService.streamTextContent(formattedContent, res);
              accumulatedContent = formattedContent;
            }
          }
        }
        // If intent returned a response (non-knowledge/non-tool intent), stream it
        else if (intentResponse) {
          logger.info(`📤 Streaming intent response for: ${intentResult.intent}`);
          await this.responseStreamingService.streamTextContent(intentResponse, res);
          accumulatedContent = intentResponse;
        } else {
          // Knowledge intent - proceed with RAG flow and stream AI response
          logger.info('📚 Streaming knowledge-based response');
          
          // Get conversation to extract company_id for knowledge base search
          const companyIdRaw = req.profile?.companyId || conversation?.organizationId;
          const companyId = companyIdRaw ? (typeof companyIdRaw === 'string' ? parseInt(companyIdRaw, 10) : companyIdRaw) : undefined;
          
          // Search knowledge base and extract sources
          const { knowledgeResults, sources: extractedSources, chunks: knowledgeChunks } = await this.responseGenerationService.searchKnowledgeBase(
            userMessageContent,
            companyId
          );
          sources = extractedSources;
          
          // Build context for AI
          const chatContext = this.responseGenerationService.buildChatContext(messages, knowledgeResults);
          const aiService = this.responseGenerationService.getAIService();

          if (!aiService) {
            throw new Error('AI service not available');
          }

          // Stream response from OpenAI
          const stream = aiService.generateResponseStream(userMessageContent, chatContext);
          
          // Create validation callback if service is available
          const validationCallback = this.validationService && knowledgeChunks.length > 0 
            ? async (response: string, query: string) => {
                try {
                  // Use individual chunks for accurate validation
                  return await this.validationService!.validateResponse(query, response, knowledgeChunks);
                } catch (error) {
                  logger.error('Validation error:', error);
                  return null;
                }
              }
            : null;
          
          accumulatedContent = await this.responseStreamingService.streamAIResponse(
            stream,
            res,
            sources,
            knowledgeResults,
            validationCallback,
            userMessageContent
          );
        }

        // Save the message after streaming completes
        try {
          const assistantMessage = await this.saveAssistantMessage({
            conversation,
            conversationId,
            parentMessageId: messageUuid,
            content: accumulatedContent,
            toolResults: []
          });

          assistantMessageId = assistantMessage.id;

          // Send completion event with final message metadata
          // Use non-null assertion since both are guaranteed to exist at this point
          this.responseStreamingService.sendCompletionEvent(res, assistantMessage.id!, messageUuid, assistantMessage.createdAt);
        } catch (saveError) {
          logger.error('Failed to save assistant message:', saveError);
          this.responseStreamingService.sendErrorEvent(
            res,
            'Failed to save message',
            saveError instanceof Error ? saveError.message : 'Unknown error'
          );
        }

        // Close the stream
        res.end();

      } catch (streamError) {
        logger.error('Streaming error:', streamError);
        
        // Try to send error to client if connection is still open
        try {
          this.responseStreamingService.sendErrorEvent(
            res,
            'Failed to generate response',
            streamError instanceof Error ? streamError.message : 'Unknown error'
          );
          res.end();
        } catch (writeError) {
          logger.error('Failed to send error to client:', writeError);
          res.end();
        }

        // If we have accumulated content but failed to save, try to save it
        if (accumulatedContent && !assistantMessageId) {
          try {
            await this.saveAssistantMessage({
              conversation,
              conversationId,
              parentMessageId: messageUuid,
              content: accumulatedContent,
              toolResults: []
            });
          } catch (saveError) {
            logger.error('Failed to save partial message after stream error:', saveError);
          }
        }
      }

    } catch (error) {
      logger.error('Generate response error:', error);
      
      // If headers haven't been sent yet, send JSON error
      if (!res.headersSent) {
        res.status(500).json({
          error: 'Failed to generate response',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      } else {
        // Headers already sent, try to send SSE error
        try {
          this.responseStreamingService.sendErrorEvent(
            res,
            'Failed to generate response',
            error instanceof Error ? error.message : 'Unknown error'
          );
          res.end();
        } catch (writeError) {
          logger.error('Failed to send error to client:', writeError);
          res.end();
        }
      }
    }
  }

  // Get conversation details
  async getConversation(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.profile) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const uuid = Array.isArray(req.params.uuid) ? req.params.uuid[0] : req.params.uuid;
      const conversation = await this.storage.getConversation(uuid);

      if (!conversation) {
        res.status(404).json({ error: 'Conversation not found' });
        return;
      }

      if (conversation.organizationId && conversation.organizationId !== req.profile.companyId) {
        res.status(404).json({ error: 'Conversation not found' });
        return;
      }

      const toIso = (date?: Date) => (date ? date.toISOString() : null);
      const status = conversation.archivedAt
        ? 'archived'
        : conversation.closedAt
        ? 'closed'
        : conversation.joinedAt
        ? 'in_progress'
        : 'open';

      res.json({
        uuid: conversation.id,
        title: conversation.title,
        user_uuid: conversation.userId,
        company_uuid: conversation.organizationId,
        message_count: conversation.messageCount,
        created_at: toIso(conversation.createdAt),
        updated_at: toIso(conversation.updatedAt),
        joined_at: toIso(conversation.joinedAt),
        responded_at: toIso(conversation.respondedAt),
        closed_at: toIso(conversation.closedAt),
        archived_at: toIso(conversation.archivedAt),
        last_message_at: toIso(conversation.lastMessageAt),
        status
      });

    } catch (error) {
      logger.error('Get conversation error:', error);
      res.status(500).json({
        error: 'Failed to get conversation',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Get conversation messages
  async getConversationMessages(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.profile) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const uuid = Array.isArray(req.params.uuid) ? req.params.uuid[0] : req.params.uuid;
      const page = Math.max(1, parseInt((req.query.page as string) || '1', 10) || 1);
      const pageSizeRaw = parseInt((req.query.page_size as string) || '50', 10);
      const pageSize = Math.min(200, Math.max(1, isNaN(pageSizeRaw) ? 50 : pageSizeRaw));
      const offset = (page - 1) * pageSize;
      const orderParam = ((req.query.order as string) || 'desc').toLowerCase();
      const order: 'asc' | 'desc' = orderParam === 'asc' ? 'asc' : 'desc';

      const conversation = await this.storage.getConversation(uuid);

      if (!conversation) {
        res.status(404).json({ error: 'Conversation not found' });
        return;
      }

      if (conversation.organizationId && conversation.organizationId !== req.profile.companyId) {
        res.status(404).json({ error: 'Conversation not found' });
        return;
      }

      const messages = await this.storage.getMessages(uuid, pageSize, offset, { order });
      const hasMore = messages.length === pageSize;
      const toIso = (date?: Date) => (date ? date.toISOString() : null);

      res.json({
        conversation_uuid: conversation.id,
        order,
        messages: messages.map(msg => ({
          uuid: msg.id,
          parent_message_uuid: msg.parentMessageId,
          type: msg.role,
          content: msg.content,
          status: 'completed',
          created_at: toIso(msg.createdAt),
          author_id: msg.authorId ?? null,
          author_name: msg.authorName ?? null
        })),
        pagination: {
          page,
          page_size: pageSize,
          has_more: hasMore,
          next_offset: hasMore ? offset + pageSize : null
        }
      });
    } catch (error) {
      logger.error('Get conversation messages error:', error);
      res.status(500).json({
        error: 'Failed to get conversation messages',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Join conversation
  async joinConversation(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user || !req.profile) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const uuid = Array.isArray(req.params.uuid) ? req.params.uuid[0] : req.params.uuid;
      const conversation = await this.storage.getConversation(uuid);

      if (!conversation) {
        res.status(404).json({ error: 'Conversation not found' });
        return;
      }

      if (conversation.organizationId !== req.profile.companyId) {
        res.status(404).json({ error: 'Conversation not found' });
        return;
      }

      if (conversation.closedAt) {
        res.status(400).json({ error: 'Conversation is closed' });
        return;
      }

      const joinedAt = new Date();
      
      await this.storage.updateConversation(uuid, {
        joinedAt,
        status: 'in_progress'
      });

      const systemMessage = await this.storage.saveMessage({
        conversationId: uuid,
        threadId: conversation.threadId,
        role: 'system',
        content: `${req.user.name} has joined the conversation.`,
        createdAt: joinedAt,
        authorId: parseInt(req.user.id)
      });

      const newMessageCount = conversation.messageCount + 1;
      await this.storage.updateConversation(uuid, {
        messageCount: newMessageCount,
        lastMessageAt: joinedAt
      });

      if (this.realtimePublisher) {
        try {
          const { data: company } = await this.supabase
            .from('vezlo_companies')
            .select('uuid')
            .eq('id', conversation.organizationId)
            .single();

          if (company?.uuid) {
            await this.realtimePublisher.publish(
              `company:${company.uuid}:conversations`,
              'message:created',
              {
                conversation_uuid: uuid,
                message: {
                  uuid: systemMessage.id,
                  content: systemMessage.content,
                  type: systemMessage.role,
                  author_id: systemMessage.authorId,
                  author_name: req.user.name || null,
                  created_at: systemMessage.createdAt.toISOString()
                },
                conversation_update: {
                  message_count: newMessageCount,
                  last_message_at: joinedAt.toISOString(),
                  joined_at: joinedAt.toISOString(),
                  status: 'in_progress'
                }
              }
            );
          }
        } catch (error) {
          logger.error('[ChatController] Failed to publish join conversation update:', error);
        }
      }

      res.json({
        success: true,
        message: {
          uuid: systemMessage.id,
          content: systemMessage.content,
          type: systemMessage.role,
          author_id: systemMessage.authorId,
          created_at: systemMessage.createdAt.toISOString()
        }
      });

    } catch (error) {
      logger.error('Join conversation error:', error);
      res.status(500).json({
        error: 'Failed to join conversation',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Close conversation
  async closeConversation(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user || !req.profile) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const uuid = Array.isArray(req.params.uuid) ? req.params.uuid[0] : req.params.uuid;
      const conversation = await this.storage.getConversation(uuid);

      if (!conversation) {
        res.status(404).json({ error: 'Conversation not found' });
        return;
      }

      if (conversation.organizationId !== req.profile.companyId) {
        res.status(404).json({ error: 'Conversation not found' });
        return;
      }

      if (conversation.closedAt) {
        res.status(400).json({ error: 'Conversation is already closed' });
        return;
      }

      const closedAt = new Date();

      const systemMessage = await this.storage.saveMessage({
        conversationId: uuid,
        threadId: conversation.threadId,
        role: 'system',
        content: `${req.user.name} has closed the conversation.`,
        createdAt: closedAt,
        authorId: parseInt(req.user.id, 10)
      });

      const newMessageCount = conversation.messageCount + 1;
      await this.storage.updateConversation(uuid, {
        messageCount: newMessageCount,
        lastMessageAt: closedAt,
        closedAt
      });

      if (this.realtimePublisher) {
        try {
          const { data: company } = await this.supabase
            .from('vezlo_companies')
            .select('uuid')
            .eq('id', conversation.organizationId)
            .single();

          if (company?.uuid) {
            await this.realtimePublisher.publish(
              `company:${company.uuid}:conversations`,
              'message:created',
              {
                conversation_uuid: uuid,
                message: {
                  uuid: systemMessage.id,
                  content: systemMessage.content,
                  type: systemMessage.role,
                  author_id: systemMessage.authorId,
                  author_name: req.user.name || null,
                  created_at: systemMessage.createdAt.toISOString()
                },
                conversation_update: {
                  message_count: newMessageCount,
                  last_message_at: closedAt.toISOString(),
                  joined_at: conversation.joinedAt?.toISOString() || null,
                  closed_at: closedAt.toISOString(),
                  status: 'closed'
                }
              }
            );
          }
        } catch (error) {
          logger.error('[ChatController] Failed to publish close conversation update:', error);
        }
      }

      res.json({
        success: true,
        message: {
          uuid: systemMessage.id,
          content: systemMessage.content,
          type: systemMessage.role,
          author_id: systemMessage.authorId,
          author_name: req.user.name || null,
          created_at: systemMessage.createdAt.toISOString()
        }
      });

    } catch (error) {
      logger.error('Close conversation error:', error);
      res.status(500).json({
        error: 'Failed to close conversation',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Archive conversation
  async archiveConversation(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user || !req.profile) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const uuid = Array.isArray(req.params.uuid) ? req.params.uuid[0] : req.params.uuid;
      const conversation = await this.storage.getConversation(uuid);

      if (!conversation) {
        res.status(404).json({ error: 'Conversation not found' });
        return;
      }

      if (conversation.organizationId !== req.profile.companyId) {
        res.status(404).json({ error: 'Conversation not found' });
        return;
      }

      if (!conversation.closedAt) {
        res.status(400).json({ error: 'Conversation must be closed before archiving' });
        return;
      }

      if (conversation.archivedAt) {
        res.status(400).json({ error: 'Conversation is already archived' });
        return;
      }

      const archivedAt = new Date();

      await this.storage.updateConversation(uuid, {
        archivedAt
      });

      if (this.realtimePublisher) {
        try {
          const { data: company } = await this.supabase
            .from('vezlo_companies')
            .select('uuid')
            .eq('id', conversation.organizationId)
            .single();

          if (company?.uuid) {
            await this.realtimePublisher.publish(
              `company:${company.uuid}:conversations`,
              'conversation:archived',
              {
                conversation_uuid: uuid,
                conversation_update: {
                  archived_at: archivedAt.toISOString(),
                  status: 'archived'
                }
              }
            );
          }
        } catch (error) {
          logger.error('[ChatController] Failed to publish archive conversation update:', error);
        }
      }

      res.json({
        success: true,
        archived_at: archivedAt.toISOString()
      });

    } catch (error) {
      logger.error('Archive conversation error:', error);
      res.status(500).json({
        error: 'Failed to archive conversation',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Send agent message
  async sendAgentMessage(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user || !req.profile) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const uuid = Array.isArray(req.params.uuid) ? req.params.uuid[0] : req.params.uuid;
      const { content } = req.body;

      if (!content) {
        res.status(400).json({ error: 'content is required' });
        return;
      }

      const conversation = await this.storage.getConversation(uuid);

      if (!conversation) {
        res.status(404).json({ error: 'Conversation not found' });
        return;
      }

      if (conversation.organizationId !== req.profile.companyId) {
        res.status(404).json({ error: 'Conversation not found' });
        return;
      }

      if (conversation.closedAt) {
        res.status(400).json({ error: 'Conversation is closed' });
        return;
      }

      const agentMessage = await this.storage.saveMessage({
        conversationId: uuid,
        threadId: conversation.threadId,
        role: 'agent',
        content,
        createdAt: new Date(),
        authorId: parseInt(req.user.id)
      });

      const newMessageCount = conversation.messageCount + 1;
      const timestamp = new Date();
      await this.storage.updateConversation(uuid, {
        messageCount: newMessageCount,
        lastMessageAt: timestamp
      });

      if (this.realtimePublisher) {
        try {
          const { data: company } = await this.supabase
            .from('vezlo_companies')
            .select('uuid')
            .eq('id', conversation.organizationId)
            .single();

          if (company?.uuid) {
            await this.realtimePublisher.publish(
              `company:${company.uuid}:conversations`,
              'message:created',
              {
                conversation_uuid: uuid,
                message: {
                  uuid: agentMessage.id,
                  content: agentMessage.content,
                  type: agentMessage.role,
                  author_id: agentMessage.authorId,
                  author_name: req.user.name || null,
                  created_at: agentMessage.createdAt.toISOString()
                },
                conversation_update: {
                  message_count: newMessageCount,
                  last_message_at: timestamp.toISOString()
                }
              }
            );
          }
        } catch (error) {
          logger.error('[ChatController] Failed to publish agent message update:', error);
        }
      }

      res.json({
        uuid: agentMessage.id,
        content: agentMessage.content,
        type: agentMessage.role,
        author_id: agentMessage.authorId,
        author_name: req.user.name || null,
        created_at: agentMessage.createdAt.toISOString()
      });

    } catch (error) {
      logger.error('Send agent message error:', error);
      res.status(500).json({
        error: 'Failed to send agent message',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Get user conversations (renamed from getUserConversations)
  async getUserConversations(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.profile) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const page = Math.max(1, parseInt((req.query.page as string) || '1', 10) || 1);
      const pageSizeRaw = parseInt((req.query.page_size as string) || '20', 10);
      const pageSize = Math.min(100, Math.max(1, isNaN(pageSizeRaw) ? 20 : pageSizeRaw));
      const offset = (page - 1) * pageSize;
      const orderParam = (req.query.order_by as string) || 'last_message_at';
      const orderBy = orderParam === 'created_at' ? 'updated_at' : 'last_message_at';
      const statusParam = req.query.status as string;
      const status = statusParam === 'archived' ? 'archived' : statusParam === 'active' ? 'active' : undefined;

      const { conversations, total } = await this.storage.getUserConversations(
        req.user!.id,
        req.profile.companyId,
        {
          limit: pageSize,
          offset,
          orderBy: orderBy as 'last_message_at' | 'updated_at',
          status
        }
      );

      const toIso = (date?: Date) => (date ? date.toISOString() : null);

      res.json({
        conversations: conversations.map(conversation => ({
          uuid: conversation.id,
          title: conversation.title,
          message_count: conversation.messageCount,
          created_at: toIso(conversation.createdAt),
          updated_at: toIso(conversation.updatedAt),
          joined_at: toIso(conversation.joinedAt),
          responded_at: toIso(conversation.respondedAt),
          closed_at: toIso(conversation.closedAt),
          archived_at: toIso(conversation.archivedAt),
          last_message_at: toIso(conversation.lastMessageAt),
          status: conversation.archivedAt
            ? 'archived'
            : conversation.closedAt
            ? 'closed'
            : conversation.joinedAt
            ? 'in_progress'
            : 'open'
        })),
        pagination: {
          page,
          page_size: pageSize,
          total,
          total_pages: Math.max(1, Math.ceil(total / pageSize)),
          has_more: offset + conversations.length < total
        }
      });

    } catch (error) {
      logger.error('Get user conversations error:', error);
      res.status(500).json({
        error: 'Failed to get user conversations',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Delete conversation
  async deleteConversation(req: Request, res: Response): Promise<void> {
    try {
      const uuid = Array.isArray(req.params.uuid) ? req.params.uuid[0] : req.params.uuid;
      const success = await this.storage.deleteConversation(uuid);

      if (!success) {
        res.status(404).json({ error: 'Conversation not found or could not be deleted' });
        return;
      }

      res.json({ success: true });

    } catch (error) {
      logger.error('Delete conversation error:', error);
      res.status(500).json({
        error: 'Failed to delete conversation',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Submit message feedback (create or update) - Public API
  async submitFeedback(req: Request | AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { message_uuid, rating, category, comment, suggested_improvement } = req.body;

      if (!message_uuid || !rating) {
        res.status(400).json({ error: 'message_uuid and rating are required' });
        return;
      }

      // Get the message to find its conversationId
      const message = await this.storage.getMessageById(message_uuid);
      if (!message) {
        res.status(404).json({ error: 'Message not found' });
        return;
      }

      const conversation = await this.storage.getConversation(message.conversationId);
      if (!conversation) {
        res.status(404).json({ error: 'Conversation not found for message' });
        return;
      }

      // Use authenticated user ID if available, otherwise use default anonymous user (1)
      const userId = (req as AuthenticatedRequest).user?.id?.toString() || '1';

      // Check if feedback already exists for this message and user
      const existingFeedback = await this.storage.getFeedbackByMessageAndUser(message_uuid, userId);

      const feedback = await this.storage.saveFeedback({
        id: existingFeedback?.id, // Include ID if exists (will update instead of create)
        messageId: message_uuid,
        conversationId: message.conversationId,
        userId,
        rating,
        category,
        comment,
        suggestedImprovement: suggested_improvement,
        createdAt: existingFeedback?.createdAt || new Date(),
        companyId: conversation.organizationId
      });

      res.json({
        success: true,
        feedback: {
          uuid: feedback.id,
          message_uuid: feedback.messageId,
          rating: feedback.rating,
          category: feedback.category,
          comment: feedback.comment,
          suggested_improvement: feedback.suggestedImprovement,
          created_at: feedback.createdAt
        }
      });

    } catch (error) {
      logger.error('Submit feedback error:', error);
      res.status(500).json({
        error: 'Failed to submit feedback',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Delete/undo message feedback - Public API
  async deleteFeedback(req: Request | AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const uuid = Array.isArray(req.params.uuid) ? req.params.uuid[0] : req.params.uuid;

      if (!uuid) {
        res.status(400).json({ error: 'Feedback UUID is required' });
        return;
      }

      // Verify feedback exists
      const feedback = await this.storage.getFeedbackById(uuid);
      if (!feedback) {
        res.status(404).json({ error: 'Feedback not found' });
        return;
      }

      // For public API, allow deletion by UUID only (no user verification)
      // This is acceptable since feedback UUIDs are unique and not easily guessable
      await this.storage.deleteFeedback(uuid);

      res.json({
        success: true,
        message: 'Feedback deleted successfully'
      });

    } catch (error) {
      logger.error('Delete feedback error:', error);
      res.status(500).json({
        error: 'Failed to delete feedback',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }


  private async respondWithAssistantMessage(
    payload: {
      conversation: ChatConversation | null;
      conversationId: string;
      parentMessageId?: string;
      content: string;
      toolResults?: any;
    },
    res: Response
  ): Promise<void> {
    const assistantMessage = await this.saveAssistantMessage({
      conversation: payload.conversation,
      conversationId: payload.conversationId,
      parentMessageId: payload.parentMessageId,
      content: payload.content,
      toolResults: payload.toolResults
    });

    res.json({
      uuid: assistantMessage.id,
      parent_message_uuid: payload.parentMessageId,
      type: 'assistant',
      content: assistantMessage.content,
      status: 'completed',
      created_at: assistantMessage.createdAt.toISOString()
    });
  }

  private async saveAssistantMessage(options: {
    conversation: ChatConversation | null;
    conversationId: string;
    parentMessageId?: string;
    content: string;
    toolResults?: any;
  }): Promise<StoredChatMessage> {
    const assistantMessage = await this.storage.saveMessage({
      conversationId: options.conversationId,
      threadId: options.conversationId,
      role: 'assistant',
      content: options.content,
      parentMessageId: options.parentMessageId,
      toolResults: options.toolResults,
      createdAt: new Date()
    });

    if (options.conversation) {
      const nextCount = (options.conversation.messageCount || 0) + 1;
      const timestamp = new Date();
      await this.storage.updateConversation(options.conversationId, {
        messageCount: nextCount,
        lastMessageAt: timestamp
      });
      options.conversation.messageCount = nextCount;
      options.conversation.lastMessageAt = timestamp;

      // Publish realtime update
      if (this.realtimePublisher && options.conversation.organizationId) {
        try {
          logger.info(`[ChatController] Fetching company UUID for assistant message, organizationId: ${options.conversation.organizationId}`);
          const { data: company } = await this.supabase
            .from('vezlo_companies')
            .select('uuid')
            .eq('id', options.conversation.organizationId)
            .single();

          if (company?.uuid) {
            logger.info(`[ChatController] Publishing assistant message update for company: ${company.uuid}`);
            await this.realtimePublisher.publish(
              `company:${company.uuid}:conversations`,
              'message:created',
              {
                conversation_uuid: options.conversationId,
                message: {
                  uuid: assistantMessage.id,
                  content: assistantMessage.content,
                  type: assistantMessage.role,
                  author_id: null,
                  created_at: assistantMessage.createdAt.toISOString()
                },
                conversation_update: {
                  message_count: nextCount,
                  last_message_at: timestamp.toISOString()
                }
              }
            );
          } else {
            logger.warn(`[ChatController] No company UUID found for organizationId: ${options.conversation.organizationId}`);
          }
        } catch (error) {
          logger.error('[ChatController] Failed to publish realtime update:', error);
        }
      } else {
        if (!this.realtimePublisher) {
          logger.warn('[ChatController] Realtime publisher not available for assistant message');
        }
        if (!options.conversation.organizationId) {
          logger.warn('[ChatController] No organizationId in conversation for assistant message');
        }
      }
    }

    return assistantMessage;
  }

}