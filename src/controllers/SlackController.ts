import { Request, Response } from 'express';
import { SlackService } from '../services/SlackService';
import { ChatManager } from '../services/ChatManager';
import { UnifiedStorage } from '../storage/UnifiedStorage';
import logger from '../config/logger';
import { SupabaseClient } from '@supabase/supabase-js';

export class SlackController {
  private slackService: SlackService;
  private chatManager: ChatManager;
  private storage: UnifiedStorage;
  private historyLength: number;

  constructor(
    slackService: SlackService, 
    chatManager: ChatManager, 
    storage: UnifiedStorage,
    historyLength: number
  ) {
    this.slackService = slackService;
    this.chatManager = chatManager;
    this.storage = storage;
    this.historyLength = historyLength;
  }

  /**
   * Handle Slack events (app mentions, DMs)
   */
  async handleEvents(req: Request, res: Response): Promise<void> {
    try {
      // Slack URL verification challenge
      if (req.body.type === 'url_verification') {
        res.json({ challenge: req.body.challenge });
        return;
      }

      // Acknowledge immediately (Slack requires response within 3 seconds)
      res.status(200).send('');

      // Process event asynchronously
      const event = req.body.event;

      if (!event) {
        logger.warn('Slack event missing event data');
        return;
      }

      // Handle app mentions and direct messages
      if (event.type === 'app_mention' || event.type === 'message') {
        await this.handleMessage(event);
      }
    } catch (error) {
      logger.error('Slack events error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  }

  /**
   * Handle Slack slash commands
   */
  async handleCommands(req: Request, res: Response): Promise<void> {
    try {
      const { text, channel_id, thread_ts, user_id } = req.body;

      // Acknowledge immediately
      res.status(200).json({ 
        response_type: 'in_channel',
        text: '🔍 Searching knowledge base...' 
      });

      // Process command asynchronously
      await this.processQuery(text, channel_id, thread_ts, user_id);
    } catch (error) {
      logger.error('Slack commands error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  }

  /**
   * Handle incoming Slack message
   */
  private async handleMessage(event: any): Promise<void> {
    try {
      // Extract query from message (remove bot mention)
      let query = event.text || '';
      
      // Remove bot mention for app_mention events
      if (event.type === 'app_mention') {
        query = query.replace(/<@[A-Z0-9]+>/g, '').trim();
      }

      if (!query) {
        await this.slackService.sendMessage(
          event.channel,
          '❓ Please provide a query. Example: `@VezloBot search authentication`',
          event.thread_ts || event.ts
        );
        return;
      }

      // Add "thinking" reaction
      await this.slackService.addReaction(event.channel, event.ts, 'hourglass_flowing_sand');

      // Process the query
      await this.processQuery(query, event.channel, event.thread_ts || event.ts, event.user, event.ts);
    } catch (error) {
      logger.error('Failed to handle Slack message:', error);
    }
  }

  /**
   * Get or create conversation for Slack thread
   */
  private async getOrCreateSlackConversation(channel: string, threadTs: string, userId: string): Promise<any> {
    // Check database for existing conversation by Slack thread
    const existingConv = await this.storage.conversations.getConversationBySlackThread(channel, threadTs);
    
    if (existingConv) {
      logger.info(`Reusing existing conversation ${existingConv.id} for Slack thread ${channel}:${threadTs}`);
      return existingConv;
    }
    
    // Create new conversation for this Slack thread
    const conversationData: any = {
      userId: userId || '1',
      organizationId: '1',
      title: `Slack: ${channel}`,
      messageCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      slack_channel_id: channel,
      slack_thread_ts: threadTs
    };
    
    const newConversation = await this.storage.conversations.saveConversation(conversationData);
    logger.info(`Created new conversation ${newConversation.id} for Slack thread ${channel}:${threadTs}`);
    
    return newConversation;
  }

  /**
   * Process query using full chat flow (reuse widget logic)
   */
  private async processQuery(query: string, channel: string, threadTs: string, userId: string, originalMessageTs?: string): Promise<void> {
    try {
      logger.info(`Processing Slack query from user ${userId}: ${query}`);

      // 1. Get or create conversation for this Slack thread
      const conversation = await this.getOrCreateSlackConversation(channel, threadTs, userId);
      const convId = conversation.id!; // Use UUID as conversation ID

      // 2. Create user message (same as widget)
      const userMessage = await this.storage.saveMessage({
        conversationId: convId,
        threadId: conversation.threadId,
        content: query,
        role: 'user',
        createdAt: new Date()
      });

      logger.info(`Created user message ${userMessage.id} in conversation ${convId}`);

      // 3. Generate AI response (buffer instead of stream)
      const aiResponse = await this.generateBufferedResponse(userMessage.id!, convId);

      // Remove "thinking" reaction and add "done" reaction
      if (originalMessageTs) {
        await this.slackService.removeReaction(channel, originalMessageTs, 'hourglass_flowing_sand');
        await this.slackService.addReaction(channel, originalMessageTs, 'white_check_mark');
      }

      if (!aiResponse || aiResponse.trim().length === 0) {
        await this.slackService.sendMessage(
          channel,
          '❌ No response generated. Please try rephrasing your question.',
          threadTs
        );
        return;
      }

      // 4. Send complete response to Slack
      await this.slackService.sendMessageInChunks(channel, aiResponse, threadTs);

      logger.info(`Slack query processed successfully for user ${userId}`);
    } catch (error) {
      logger.error('Failed to process Slack query:', error);
      
      // Remove "thinking" reaction on error
      if (originalMessageTs) {
        await this.slackService.removeReaction(channel, originalMessageTs, 'hourglass_flowing_sand');
        await this.slackService.addReaction(channel, originalMessageTs, 'x');
      }
      
      await this.slackService.sendMessage(
        channel,
        '❌ An error occurred while processing your request. Please try again.',
        threadTs
      );
    }
  }

  /**
   * Generate buffered AI response (reuse ChatManager logic)
   */
  private async generateBufferedResponse(messageId: string, conversationId: string): Promise<string> {
    try {
      // Get user message
      const userMessage = await this.storage.getMessageById(messageId);
      if (!userMessage) {
        throw new Error('User message not found');
      }

      // Get conversation history (uses same config as widget)
      const messages = await this.chatManager.getRecentMessages(conversationId, this.historyLength);
      
      // Generate AI response using ChatManager's internal logic
      const conversation = await this.storage.getConversation(conversationId);
      if (!conversation) {
        throw new Error('Conversation not found');
      }

      // Build chat context
      const chatContext = {
        conversationHistory: messages.map(msg => ({ role: msg.role, content: msg.content }))
      };

      // Generate response using AIService
      const aiResponseObj = await this.chatManager['aiService'].generateResponse(userMessage.content, chatContext);
      const responseContent = typeof aiResponseObj === 'string' ? aiResponseObj : aiResponseObj.content;

      // Save assistant message
      const assistantMessage = await this.storage.saveMessage({
        conversationId,
        threadId: conversation.threadId,
        content: responseContent,
        role: 'assistant',
        parentMessageId: messageId,
        createdAt: new Date()
      });

      return responseContent;
    } catch (error) {
      logger.error('Failed to generate buffered response:', error);
      throw error;
    }
  }
}

