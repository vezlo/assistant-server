import { SupabaseClient } from '@supabase/supabase-js';
import {
  ChatStorage,
  ChatConversation,
  StoredChatMessage,
  Feedback,
  ConversationListOptions,
  ConversationListResult
} from '../types';
import { ConversationRepository } from './ConversationRepository';
import { MessageRepository } from './MessageRepository';
import { FeedbackRepository } from './FeedbackRepository';

/**
 * Unified Storage Class
 * Combines all repositories and implements the ChatStorage interface
 * This maintains backward compatibility while providing better organization
 */
export class UnifiedStorage implements ChatStorage {
  public conversations: ConversationRepository;
  public messages: MessageRepository;
  public feedback: FeedbackRepository;

  constructor(
    supabase: SupabaseClient,
    tablePrefix: string = ''
  ) {
    this.conversations = new ConversationRepository(supabase, tablePrefix);
    this.messages = new MessageRepository(supabase, tablePrefix);
    this.feedback = new FeedbackRepository(supabase, tablePrefix);
  }

  // ============================================================================
  // CONVERSATION METHODS (Delegate to ConversationRepository)
  // ============================================================================
  
  async saveConversation(conversation: ChatConversation): Promise<ChatConversation> {
    return this.conversations.saveConversation(conversation);
  }

  async getConversation(conversationId: string): Promise<ChatConversation | null> {
    return this.conversations.getConversation(conversationId);
  }

  async updateConversation(conversationId: string, updates: Partial<ChatConversation>): Promise<ChatConversation> {
    return this.conversations.updateConversation(conversationId, updates);
  }

  async deleteConversation(conversationId: string): Promise<boolean> {
    return this.conversations.deleteConversation(conversationId);
  }

  async getUserConversations(
    userId: string,
    organizationId?: string,
    options?: ConversationListOptions
  ): Promise<ConversationListResult> {
    return this.conversations.getUserConversations(userId, organizationId, options);
  }

  // ============================================================================
  // MESSAGE METHODS (Delegate to MessageRepository)
  // ============================================================================
  
  async saveMessage(message: StoredChatMessage): Promise<StoredChatMessage> {
    return this.messages.saveMessage(message);
  }

  async getMessages(
    conversationId: string,
    limit = 50,
    offset = 0,
    options?: { order?: 'asc' | 'desc' }
  ): Promise<StoredChatMessage[]> {
    return this.messages.getMessages(conversationId, limit, offset, options);
  }

  async deleteMessage(messageId: string): Promise<boolean> {
    return this.messages.deleteMessage(messageId);
  }

  async getMessageById(messageId: string): Promise<StoredChatMessage | null> {
    return this.messages.getMessageById(messageId);
  }

  // ============================================================================
  // FEEDBACK METHODS (Delegate to FeedbackRepository)
  // ============================================================================
  
  async saveFeedback(feedback: Feedback): Promise<Feedback> {
    return this.feedback.saveFeedback(feedback);
  }

  async getFeedback(messageId: string): Promise<Feedback[]> {
    return this.feedback.getFeedback(messageId);
  }

  async getFeedbackById(feedbackId: string): Promise<Feedback | null> {
    return this.feedback.getFeedbackById(feedbackId);
  }

  async getUserFeedback(userId: string, limit = 50, offset = 0): Promise<Feedback[]> {
    return this.feedback.getUserFeedback(userId, limit, offset);
  }

  async getFeedbackByMessageAndUser(messageId: string, userId: string): Promise<Feedback | null> {
    return this.feedback.getFeedbackByMessageAndUser(messageId, userId);
  }

  async deleteFeedback(feedbackId: string): Promise<boolean> {
    return this.feedback.deleteFeedback(feedbackId);
  }

  // ============================================================================
  // ADDITIONAL CONVENIENCE METHODS
  // ============================================================================

  /**
   * Get conversation with all messages
   */
  async getConversationWithMessages(conversationId: string): Promise<{
    conversation: ChatConversation | null;
    messages: StoredChatMessage[];
  }> {
    const [conversation, messages] = await Promise.all([
      this.getConversation(conversationId),
      this.getMessages(conversationId)
    ]);

    return { conversation, messages };
  }

  /**
   * Get message with its feedback
   */
  async getMessageWithFeedback(messageId: string): Promise<{
    message: StoredChatMessage | null;
    feedback: Feedback[];
  }> {
    const [message, feedbackList] = await Promise.all([
      this.getMessageById(messageId),
      this.getFeedback(messageId)
    ]);

    return { message, feedback: feedbackList };
  }
}
