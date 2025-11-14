import { v4 as uuidv4 } from 'uuid';
import {
  ChatManagerConfig,
  ChatConversation,
  StoredChatMessage,
  ChatContext,
  AIResponse,
  ChatMessage
} from '../types';
import { AIService } from './AIService';

export class ChatManager {
  private aiService: AIService;
  private config: ChatManagerConfig;
  private activeConversations: Map<string, ChatConversation>;
  private historyLength: number;

  constructor(config: ChatManagerConfig) {
    this.config = config;
    this.aiService = config.aiService;
    this.activeConversations = new Map();
    this.historyLength = typeof config.historyLength === 'number' && config.historyLength > 0
      ? config.historyLength
      : 2;

    if (config.conversationTimeout) {
      setInterval(() => this.cleanupExpiredConversations(), 60000);
    }
  }

  async createConversation(
    userId: string,
    organizationId?: string,
    title?: string
  ): Promise<ChatConversation> {
    const threadId = uuidv4();
    const conversation: ChatConversation = {
      threadId,
      userId,
      organizationId,
      title: title || 'New Conversation',
      messageCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    if (this.config.storage && this.config.enableConversationManagement) {
      const savedConversation = await this.config.storage.saveConversation(conversation);
      conversation.id = savedConversation.id;
    }

    this.activeConversations.set(conversation.threadId, conversation);
    return conversation;
  }

  async getConversation(threadId: string): Promise<ChatConversation | null> {
    let conversation: ChatConversation | null | undefined = this.activeConversations.get(threadId);
    
    if (!conversation && this.config.storage && this.config.enableConversationManagement) {
      conversation = await this.config.storage.getConversation(threadId);
      if (conversation) {
        this.activeConversations.set(threadId, conversation);
      }
    }

    return conversation || null;
  }

  async sendMessage(
    message: string,
    threadId?: string,
    context?: ChatContext
  ): Promise<AIResponse & { conversationId?: string; messageId?: string }> {
    let conversation: ChatConversation | null = null;

    if (threadId) {
      conversation = await this.getConversation(threadId);
    }

    if (!conversation) {
      conversation = await this.createConversation(
        context?.userId || 'anonymous',
        context?.organizationId,
        'Chat Conversation'
      );
    }

    if (!conversation) {
      throw new Error('Failed to create or retrieve conversation');
    }

    const userMessage: StoredChatMessage = {
      conversationId: conversation.id || conversation.threadId,
      threadId: conversation.threadId,
      role: 'user',
      content: message,
      createdAt: new Date()
    };

    if (this.config.storage) {
      try {
        await this.config.storage.saveMessage(userMessage);
      } catch (error) {
        console.error('Failed to save user message:', error);
      }
    }

    const chatContext: ChatContext = {
      ...context,
      conversationId: conversation.id || conversation.threadId,
      threadId: conversation.threadId,
      conversationHistory: await this.getRecentMessages(
        conversation.threadId,
        this.historyLength,
        { includePendingMessage: true }
      )
    };

    const aiResponse = await this.aiService.generateResponse(message, chatContext);

    const assistantMessage: StoredChatMessage = {
      conversationId: conversation.id || conversation.threadId,
      threadId: conversation.threadId,
      role: 'assistant',
      content: aiResponse.content,
      toolResults: aiResponse.toolResults,
      createdAt: new Date()
    };

    let messageId: string | undefined;
    if (this.config.storage) {
      try {
        const savedMessage = await this.config.storage.saveMessage(assistantMessage);
        messageId = savedMessage.id;
      } catch (error) {
        console.error('Failed to save assistant message:', error);
      }
    }

    conversation.messageCount += 2;
    conversation.updatedAt = new Date();

    if (this.config.storage && this.config.enableConversationManagement) {
      try {
        await this.config.storage.updateConversation(conversation.id || conversation.threadId, {
          messageCount: conversation.messageCount,
          updatedAt: conversation.updatedAt
        });
      } catch (error) {
        console.error('Failed to update conversation:', error);
      }
    }

    this.activeConversations.set(conversation.threadId, conversation);

    return {
      ...aiResponse,
      conversationId: conversation.id || conversation.threadId,
      messageId
    };
  }

  async getRecentMessages(
    threadId: string,
    limit = this.historyLength,
    options: { includePendingMessage?: boolean } = {}
  ): Promise<ChatMessage[]> {
    if (!this.config.storage) {
      return [];
    }

    // limit represents number of PAIRS (user+assistant), not raw messages
    const pairLimit = typeof limit === 'number' && limit > 0 ? limit : this.historyLength;
    if (pairLimit <= 0) {
      return [];
    }

    const includePending = options.includePendingMessage ?? false;

    let conversation: ChatConversation | null = this.activeConversations.get(threadId) ?? null;
    
    if (!conversation && this.config.storage && this.config.enableConversationManagement) {
      try {
        conversation = await this.config.storage.getConversation(threadId);
        if (conversation) {
          this.activeConversations.set(threadId, conversation);
        }
      } catch (error) {
        console.error('Failed to fetch conversation for history:', error);
      }
    }

    // Fetch more messages than needed to ensure we can form pairs
    // Each pair = 2 messages, so fetch at least (pairLimit * 2) + buffer
    const fetchLimit = Math.max(pairLimit * 3, 50); // Fetch 3x to handle edge cases

    let messages: ChatMessage[] = [];

    try {
      // Fetch recent messages (ordered by created_at ascending - oldest first)
      const storedMessages = await this.config.storage.getMessages(threadId, fetchLimit, 0);
      
      if (storedMessages.length === 0) {
        return [];
      }

      // Group messages into pairs: user message + its latest assistant response
      // Map: userMessageId -> { user: message, assistant: latest assistant message }
      const pairMap = new Map<string, { user: StoredChatMessage; assistant?: StoredChatMessage }>();
      
      // First pass: collect all user messages
      for (const msg of storedMessages) {
        if (msg.role === 'user') {
          if (!pairMap.has(msg.id!)) {
            pairMap.set(msg.id!, { user: msg });
          }
        }
      }
      
      // Second pass: find latest assistant response for each user message
      // Process in reverse chronological order to get the latest assistant response first
      for (let i = storedMessages.length - 1; i >= 0; i--) {
        const msg = storedMessages[i];
        if (msg.role === 'assistant' && msg.parentMessageId) {
          const pair = pairMap.get(msg.parentMessageId);
          if (pair) {
            // Only set if not already set (processing in reverse ensures latest is set first)
            if (!pair.assistant) {
              pair.assistant = msg;
            } else {
              // If already set, compare timestamps to ensure we have the latest
              if (msg.createdAt > pair.assistant.createdAt) {
                pair.assistant = msg;
              }
            }
          }
        }
      }
      
      // Convert map to array of pairs, filter out incomplete pairs (unless includePending)
      const pairs: ChatMessage[] = [];
      const pairArray = Array.from(pairMap.values())
        .filter(pair => pair.assistant || includePending)
        .slice(-pairLimit); // Take last N pairs
      
      // Build message array in chronological order (user, then assistant)
      for (const pair of pairArray) {
        pairs.push({
          role: pair.user.role,
          content: pair.user.content,
          createdAt: pair.user.createdAt,
          toolResults: pair.user.toolResults
        });
        
        if (pair.assistant) {
          pairs.push({
            role: pair.assistant.role,
            content: pair.assistant.content,
            createdAt: pair.assistant.createdAt,
            toolResults: pair.assistant.toolResults
          });
        }
      }
      
      messages = pairs;
      
    } catch (error) {
      console.error('Failed to get recent messages:', error);
      return [];
    }

    return messages;
  }

  async getUserConversations(userId: string, organizationId?: string): Promise<ChatConversation[]> {
    if (!this.config.storage) {
      return [];
    }

    try {
      return await this.config.storage.getUserConversations(userId, organizationId);
    } catch (error) {
      console.error('Failed to get user conversations:', error);
      return [];
    }
  }

  async deleteConversation(conversationId: string): Promise<boolean> {
    if (!this.config.storage) {
      return false;
    }

    try {
      const result = await this.config.storage.deleteConversation(conversationId);
      
      // Remove from active conversations
      for (const [threadId, conversation] of this.activeConversations.entries()) {
        if (conversation.id === conversationId) {
          this.activeConversations.delete(threadId);
          break;
        }
      }

      return result;
    } catch (error) {
      console.error('Failed to delete conversation:', error);
      return false;
    }
  }

  private cleanupExpiredConversations(): void {
    const timeout = this.config.conversationTimeout || 3600000; // 1 hour default
    const cutoff = new Date(Date.now() - timeout);

    for (const [threadId, conversation] of this.activeConversations.entries()) {
      if (conversation.updatedAt < cutoff) {
        this.activeConversations.delete(threadId);
      }
    }
  }
}
