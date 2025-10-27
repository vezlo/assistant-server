import { Request, Response } from 'express';
import { ChatManager } from '../services/ChatManager';
import { UnifiedStorage } from '../storage/UnifiedStorage';
import { AuthenticatedRequest } from '../middleware/auth';
import logger from '../config/logger';

export class ChatController {
  private chatManager: ChatManager;
  private storage: UnifiedStorage;

  constructor(chatManager: ChatManager, storage: UnifiedStorage) {
    this.chatManager = chatManager;
    this.storage = storage;
  }

  // Create a new conversation
  async createConversation(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { title } = req.body;

      if (!req.profile) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      // Generate a unique thread ID for the conversation
      const threadId = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const conversation = await this.storage.saveConversation({
        threadId,
        userId: req.user!.id,
        organizationId: req.profile?.companyId || undefined,
        title: title || 'New Conversation',
        messageCount: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      res.json({
        uuid: conversation.id,
        title: conversation.title,
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
      const { uuid } = req.params;
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
      await this.storage.updateConversation(uuid, {
        messageCount: conversation.messageCount + 1
      });

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
    try {
      const { uuid } = req.params;

      // Get the user message by ID using the repository
      const userMessage = await this.storage.getMessageById(uuid);
      
      if (!userMessage) {
        res.status(404).json({ error: 'Message not found' });
        return;
      }

      const conversationId = userMessage.conversationId;
      const userMessageContent = userMessage.content;

      // Get conversation context (recent messages)
      const messages = await this.storage.getMessages(conversationId, 10);
      
      // Get knowledge base search results if available
      const aiService = (this.chatManager as any).aiService;
      let knowledgeResults = '';
      
      if (aiService && aiService.knowledgeBaseService) {
        try {
          console.log('🔍 Searching knowledge base for:', userMessageContent);
          console.log('🔑 Company ID:', req.profile?.companyId);
          
          const searchResults = await aiService.knowledgeBaseService.search(userMessageContent, {
            limit: 3,
            threshold: 0.7,
            type: 'hybrid',
            company_id: req.profile?.companyId ? parseInt(req.profile.companyId) : undefined
          });

          console.log('📊 Found knowledge base results:', searchResults.length);

          if (searchResults.length > 0) {
            knowledgeResults = '\n\nRelevant information from knowledge base:\n';
            searchResults.forEach((result: any) => {
              knowledgeResults += `- ${result.title}: ${result.content}\n`;
            });
            console.log('✅ Knowledge context prepared:', knowledgeResults.substring(0, 200));
          } else {
            console.log('⚠️  No knowledge base results found');
          }
        } catch (error) {
          console.error('❌ Failed to search knowledge base:', error);
          logger.error('Failed to search knowledge base:', error);
        }
      } else {
        console.log('⚠️  AI service or knowledge base service not available');
      }
      
      // Build context for AI
      const chatContext = {
        conversationHistory: messages.map(msg => ({
          role: msg.role as 'user' | 'assistant' | 'system',
          content: msg.content
        })),
        knowledgeResults
      };

      // Generate AI response using the actual user message content
      const response = await aiService.generateResponse(userMessageContent, chatContext);

      // Save AI message to database
      // Note: The storage layer will handle UUID to internal ID conversion
      const assistantMessage = await this.storage.saveMessage({
        conversationId: conversationId, // This is the conversation UUID
        threadId: conversationId,
        role: 'assistant',
        content: response.content,
        parentMessageId: uuid, // This is the parent message UUID
        toolResults: response.toolResults,
        createdAt: new Date()
      });

      // Update conversation message count
      const conversation = await this.storage.getConversation(conversationId);
      if (conversation) {
        await this.storage.updateConversation(conversationId, {
          messageCount: conversation.messageCount + 1
        });
      }

      res.json({
        uuid: assistantMessage.id,
        parent_message_uuid: uuid,
        type: 'assistant',
        content: response.content,
        status: 'completed',
        created_at: assistantMessage.createdAt.toISOString()
      });

    } catch (error) {
      logger.error('Generate response error:', error);
      res.status(500).json({
        error: 'Failed to generate response',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Get conversation details with messages
  async getConversation(req: Request, res: Response): Promise<void> {
    try {
      const { uuid } = req.params;
      const conversation = await this.storage.getConversation(uuid);

      if (!conversation) {
        res.status(404).json({ error: 'Conversation not found' });
        return;
      }

      const messages = await this.storage.getMessages(uuid, 50);

      res.json({
        uuid: conversation.id,
        title: conversation.title,
        user_uuid: conversation.userId,
        company_uuid: conversation.organizationId,
        message_count: conversation.messageCount,
        created_at: conversation.createdAt,
        messages: messages.map(msg => ({
          uuid: msg.id,
          parent_message_uuid: msg.parentMessageId,
          type: msg.role,
          content: msg.content,
          status: 'completed',
          created_at: msg.createdAt
        }))
      });

    } catch (error) {
      logger.error('Get conversation error:', error);
      res.status(500).json({
        error: 'Failed to get conversation',
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

      const conversations = await this.storage.getUserConversations(
        req.user!.id,
        req.profile?.companyId || undefined
      );

      res.json({
        conversations: conversations.map(conversation => ({
          uuid: conversation.id,
          title: conversation.title,
          message_count: conversation.messageCount,
          created_at: conversation.createdAt
        }))
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
      const { uuid } = req.params;
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

  // Submit message feedback
  async submitFeedback(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { message_uuid, rating, category, comment, suggested_improvement } = req.body;

      if (!message_uuid || !rating) {
        res.status(400).json({ error: 'message_uuid and rating are required' });
        return;
      }

      if (!req.profile) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      // Get the message to find its conversationId
      const message = await this.storage.getMessageById(message_uuid);
      if (!message) {
        res.status(404).json({ error: 'Message not found' });
        return;
      }

      const feedback = await this.storage.saveFeedback({
        messageId: message_uuid,
        conversationId: message.conversationId,
        userId: req.user!.id,
        rating,
        category,
        comment,
        suggestedImprovement: suggested_improvement,
        createdAt: new Date()
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

}