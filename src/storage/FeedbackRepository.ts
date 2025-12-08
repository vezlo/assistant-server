import { SupabaseClient } from '@supabase/supabase-js';
import { Feedback } from '../types';

export class FeedbackRepository {
  private supabase: SupabaseClient;
  private tablePrefix: string;

  constructor(supabase: SupabaseClient, tablePrefix: string = '') {
    this.supabase = supabase;
    this.tablePrefix = tablePrefix;
  }

  private getTableName(table: string): string {
    return this.tablePrefix ? `${this.tablePrefix}_${table}` : table;
  }

  async saveFeedback(feedback: Feedback): Promise<Feedback> {
    const tableName = this.getTableName('message_feedback');

    if (feedback.id) {
      // Update existing feedback
      const { data, error } = await this.supabase
        .from(tableName)
        .update({
          rating: feedback.rating,
          category: feedback.category,
          comment: feedback.comment,
          suggested_improvement: feedback.suggestedImprovement,
          updated_at: new Date().toISOString()
        })
        .eq('uuid', feedback.id)
        .select()
        .single();

      if (error) throw new Error(`Failed to update feedback: ${error.message}`);
      return this.rowToFeedback(data);
    } else {
      // Get message internal ID from UUID
      const messageQuery = await this.supabase
        .from(this.getTableName('messages'))
        .select('id')
        .eq('uuid', feedback.messageId)
        .single();
        
      if (messageQuery.error) throw new Error(`Failed to find message: ${messageQuery.error.message}`);

      const { data, error } = await this.supabase
        .from(tableName)
        .insert({
          message_id: messageQuery.data.id,
          user_id: parseInt(feedback.userId) || 1,
          rating: feedback.rating,
          category: feedback.category,
          comment: feedback.comment,
          suggested_improvement: feedback.suggestedImprovement,
          created_at: feedback.createdAt?.toISOString() || new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw new Error(`Failed to create feedback: ${error.message}`);
      
      // Return feedback with original IDs from the input
      return {
        id: data.uuid,
        messageId: feedback.messageId,
        conversationId: feedback.conversationId,
        userId: feedback.userId,
        rating: feedback.rating,
        category: feedback.category,
        comment: feedback.comment,
        suggestedImprovement: feedback.suggestedImprovement,
        createdAt: new Date(data.created_at)
      };
    }
  }

  async getFeedback(messageId: string): Promise<Feedback[]> {
    const tableName = this.getTableName('message_feedback');
    
    // Get message internal ID from UUID
    const messageQuery = await this.supabase
      .from(this.getTableName('messages'))
      .select('id')
      .eq('uuid', messageId)
      .single();
      
    if (messageQuery.error) {
      throw new Error(`Failed to find message: ${messageQuery.error.message}`);
    }

    const { data, error } = await this.supabase
      .from(tableName)
      .select('*')
      .eq('message_id', messageQuery.data.id)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to get feedback: ${error.message}`);

    return (data || []).map(row => this.rowToFeedback(row));
  }

  async getFeedbackById(feedbackId: string): Promise<Feedback | null> {
    const tableName = this.getTableName('message_feedback');
    
    const { data, error } = await this.supabase
      .from(tableName)
      .select('*, ' + this.getTableName('messages') + '!inner(uuid)')
      .eq('uuid', feedbackId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw new Error(`Failed to get feedback: ${error.message}`);
    }

    return this.rowToFeedback(data);
  }

  async getUserFeedback(userId: string, limit = 50, offset = 0): Promise<Feedback[]> {
    const tableName = this.getTableName('message_feedback');
    
    const { data, error } = await this.supabase
      .from(tableName)
      .select('*, ' + this.getTableName('messages') + '!inner(uuid)')
      .eq('user_id', parseInt(userId) || 1)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(`Failed to get user feedback: ${error.message}`);

    return (data || []).map(row => this.rowToFeedback(row));
  }

  async getFeedbackByMessageAndUser(messageId: string, userId: string): Promise<Feedback | null> {
    const tableName = this.getTableName('message_feedback');
    
    // Get message internal ID from UUID
    const messageQuery = await this.supabase
      .from(this.getTableName('messages'))
      .select('id')
      .eq('uuid', messageId)
      .single();
      
    if (messageQuery.error) {
      throw new Error(`Failed to find message: ${messageQuery.error.message}`);
    }

    const { data, error } = await this.supabase
      .from(tableName)
      .select('*, ' + this.getTableName('messages') + '!inner(uuid)')
      .eq('message_id', messageQuery.data.id)
      .eq('user_id', parseInt(userId) || 1)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw new Error(`Failed to get feedback: ${error.message}`);
    }

    return this.rowToFeedback(data);
  }

  async deleteFeedback(feedbackId: string): Promise<boolean> {
    const tableName = this.getTableName('message_feedback');
    
    const { error } = await this.supabase
      .from(tableName)
      .delete()
      .eq('uuid', feedbackId);

    if (error) throw new Error(`Failed to delete feedback: ${error.message}`);
    return true;
  }

  private rowToFeedback(row: any): Feedback {
    return {
      id: row.uuid,
      messageId: row.messages?.uuid || row.message_uuid || 'unknown',
      conversationId: row.messages?.conversation_uuid || row.session_uuid || 'unknown',
      userId: row.user_id?.toString() || '1',
      rating: row.rating,
      category: row.category,
      comment: row.comment,
      suggestedImprovement: row.suggested_improvement,
      createdAt: new Date(row.created_at)
    };
  }
}
