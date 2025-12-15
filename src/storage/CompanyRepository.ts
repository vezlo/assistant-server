import { SupabaseClient } from '@supabase/supabase-js';
import { CompanyAnalytics } from '../types';

export class CompanyRepository {
  private supabase: SupabaseClient;
  private tablePrefix: string;

  constructor(supabase: SupabaseClient, tablePrefix: string = '') {
    this.supabase = supabase;
    this.tablePrefix = tablePrefix;
  }

  private getTableName(table: string): string {
    return this.tablePrefix ? `${this.tablePrefix}_${table}` : table;
  }

  /**
   * Fetch all analytics data for a company in parallel
   */
  async getAnalytics(companyId: string | number): Promise<CompanyAnalytics> {
    const [conversationsResult, usersResult, messageStatsResult, feedbackResult] = await Promise.all([
      this.getConversationStats(companyId),
      this.getUserStats(companyId),
      this.getMessageStats(companyId),
      this.getFeedbackStats(companyId)
    ]);

    return {
      conversations: conversationsResult,
      users: usersResult,
      messages: messageStatsResult,
      feedback: feedbackResult
    };
  }

  private async getConversationStats(companyId: string | number) {
    // We use an RPC (Remote Procedure Call) here because the Supabase JS client (and PostgREST)
    // does not support conditional aggregation (e.g., COUNT(CASE WHEN ...)) in a single client-side query.
    // To efficiently get total, open, and closed counts in one round-trip without fetching all rows,
    // we must use a server-side SQL function.
    const { data, error } = await this.supabase
      .rpc('get_conversation_stats', { p_company_id: companyId });

    if (error) throw new Error(`Failed to fetch conversation stats: ${error.message}`);
    if (!data) throw new Error('Failed to fetch conversation stats: No data returned');

    return {
      total: Number(data.total) || 0,
      open: Number(data.open) || 0,
      closed: Number(data.closed) || 0
    };
  }

  private async getUserStats(companyId: string | number) {
    const tableName = this.getTableName('user_company_profiles');
    
    const { data, error } = await this.supabase
      .from(tableName)
      .select('role')
      .eq('company_id', companyId)
      .eq('status', 'active');

    if (error) throw new Error(`Failed to fetch user stats: ${error.message}`);

    const users = data || [];

    return {
      total_active_users: users.length
    };
  }

  /**
   * Get message statistics including total and breakdown by type
   */
  private async getMessageStats(companyId: string | number) {
    const messagesTable = this.getTableName('messages');
    const conversationsTable = this.getTableName('conversations');
    
    // Get all message counts by type in parallel
    const [userCount, assistantCount, agentCount, totalCount] = await Promise.all([
      this.getMessageCountByType(companyId, 'user', messagesTable, conversationsTable),
      this.getMessageCountByType(companyId, 'assistant', messagesTable, conversationsTable),
      this.getMessageCountByType(companyId, 'agent', messagesTable, conversationsTable),
      this.getTotalMessageCount(companyId, messagesTable, conversationsTable)
    ]);

    return {
      total: totalCount,
      user_messages_total: userCount,
      assistant_messages_total: assistantCount,
      agent_messages_total: agentCount
    };
  }

  private async getMessageCountByType(
    companyId: string | number,
    messageType: string,
    messagesTable: string,
    conversationsTable: string
  ): Promise<number> {
    const { count, error } = await this.supabase
      .from(messagesTable)
      .select(`${conversationsTable}!inner(company_id)`, { count: 'exact', head: true })
      .eq('type', messageType)
      .eq(`${conversationsTable}.company_id`, companyId);

    if (error) throw new Error(`Failed to fetch ${messageType} message count: ${error.message}`);
    
    return count || 0;
  }

  private async getTotalMessageCount(
    companyId: string | number,
    messagesTable: string,
    conversationsTable: string
  ): Promise<number> {
    // Exclude system messages from total count (system messages are like "user joined", "conversation closed", etc.)
    const { count, error } = await this.supabase
      .from(messagesTable)
      .select(`${conversationsTable}!inner(company_id)`, { count: 'exact', head: true })
      .eq(`${conversationsTable}.company_id`, companyId)
      .neq('type', 'system');

    if (error) throw new Error(`Failed to fetch total message count: ${error.message}`);
    
    return count || 0;
  }

  private async getFeedbackStats(companyId: string | number) {
    // Similarly to conversations, we use an RPC to get all feedback stats in a single query
    // avoiding multiple round-trips for total, likes, and dislikes.
    const { data, error } = await this.supabase
      .rpc('get_feedback_stats', { p_company_id: companyId });

    if (error) throw new Error(`Failed to fetch feedback stats: ${error.message}`);
    if (!data) throw new Error('Failed to fetch feedback stats: No data returned');

    return {
      total: Number(data.total) || 0,
      likes: Number(data.likes) || 0,
      dislikes: Number(data.dislikes) || 0
    };
  }
}

