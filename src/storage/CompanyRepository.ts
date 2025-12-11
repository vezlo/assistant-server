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
    const [conversationsResult, usersResult, userMessagesResult, feedbackResult] = await Promise.all([
      this.getConversationStats(companyId),
      this.getUserStats(companyId),
      this.getUserMessageCount(companyId),
      this.getFeedbackStats(companyId)
    ]);

    return {
      conversations: conversationsResult,
      users: usersResult,
      messages: {
        user_messages_total: userMessagesResult
      },
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


    return {
      total_active_users: data.length,
    };
  }

  private async getUserMessageCount(companyId: string | number) {
    const messagesTable = this.getTableName('messages');
    const conversationsTable = this.getTableName('conversations');
    
    const { count, error } = await this.supabase
      .from(messagesTable)
      .select(`${conversationsTable}!inner(company_id)`, { count: 'exact', head: true })
      .eq('type', 'user')
      .eq(`${conversationsTable}.company_id`, companyId);

    if (error) throw new Error(`Failed to fetch message count: ${error.message}`);
    
    return count || 0;
  }

  private async getFeedbackStats(companyId: string | number) {
    // Similarly to conversations, we use an RPC to get all feedback stats in a single query
    // avoiding multiple round-trips for total, likes, and dislikes.
    const { data, error } = await this.supabase
      .rpc('get_feedback_stats', { p_company_id: companyId });

    if (error) throw new Error(`Failed to fetch feedback stats: ${error.message}`);

    return {
      total: Number(data.total) || 0,
      likes: Number(data.likes) || 0,
      dislikes: Number(data.dislikes) || 0
    };
  }

  async getCompany(companyId: string | number) {
    const { data, error } = await this.supabase
      .from(this.getTableName('companies'))
      .select('*')
      .eq('id', companyId)
      .single();

    if (error) throw new Error(`Failed to fetch company: ${error.message}`);
    return data;
  }

  async updateCompany(companyId: string | number, company: { response_mode: string }) {
    const { error } = await this.supabase
      .from(this.getTableName('companies'))
      .update(company)
      .eq('id', companyId);

    if (error) throw new Error(`Failed to update company: ${error.message}`);
  }
}

