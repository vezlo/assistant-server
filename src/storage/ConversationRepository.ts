import { SupabaseClient } from '@supabase/supabase-js';
import { ChatConversation } from '../types';

export class ConversationRepository {
  private supabase: SupabaseClient;
  private tablePrefix: string;

  constructor(supabase: SupabaseClient, tablePrefix: string = '') {
    this.supabase = supabase;
    this.tablePrefix = tablePrefix;
  }

  private getTableName(table: string): string {
    return this.tablePrefix ? `${this.tablePrefix}_${table}` : table;
  }

  async saveConversation(conversation: ChatConversation): Promise<ChatConversation> {
    const tableName = this.getTableName('conversations');

    if (conversation.id) {
      // Update existing conversation
      const { data, error } = await this.supabase
        .from(tableName)
        .update({
          title: conversation.title,
          message_count: conversation.messageCount,
          updated_at: conversation.updatedAt || new Date().toISOString()
        })
        .eq('uuid', conversation.id)
        .select()
        .single();

      if (error) throw new Error(`Failed to update conversation: ${error.message}`);
      return await this.rowToConversation(data);
    } else {
      // Create new conversation
      // Convert string IDs to integers (dummy IDs for now)
      const companyId = conversation.organizationId ? parseInt(conversation.organizationId) || 1 : 1;
      const creatorId = parseInt(conversation.userId) || 1;
      
      const { data, error } = await this.supabase
        .from(tableName)
        .insert({
          company_id: companyId,
          title: conversation.title || 'New Conversation',
          creator_id: creatorId,
          message_count: conversation.messageCount || 0,
          created_at: conversation.createdAt?.toISOString() || new Date().toISOString(),
          updated_at: conversation.updatedAt?.toISOString() || new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw new Error(`Failed to create conversation: ${error.message}`);
      return await this.rowToConversation(data);
    }
  }

  async getConversation(conversationId: string): Promise<ChatConversation | null> {
    const tableName = this.getTableName('conversations');
    
    const { data, error } = await this.supabase
      .from(tableName)
      .select('*')
      .eq('uuid', conversationId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw new Error(`Failed to get conversation: ${error.message}`);
    }

    return this.rowToConversation(data, true);
  }

  async updateConversation(conversationId: string, updates: Partial<ChatConversation>): Promise<ChatConversation> {
    const tableName = this.getTableName('conversations');
    
    const updateData: any = {};
    if (updates.title !== undefined) updateData.title = updates.title;
    if (updates.messageCount !== undefined) updateData.message_count = updates.messageCount;
    updateData.updated_at = new Date().toISOString();

    const { data, error } = await this.supabase
      .from(tableName)
      .update(updateData)
      .eq('uuid', conversationId)
      .select()
      .single();

    if (error) throw new Error(`Failed to update conversation: ${error.message}`);
    return await this.rowToConversation(data);
  }

  async deleteConversation(conversationId: string): Promise<boolean> {
    const tableName = this.getTableName('conversations');
    
    const { error } = await this.supabase
      .from(tableName)
      .delete()
      .eq('uuid', conversationId);

    if (error) throw new Error(`Failed to delete conversation: ${error.message}`);
    return true;
  }

  async getUserConversations(userId: string, organizationId?: string): Promise<ChatConversation[]> {
    const tableName = this.getTableName('conversations');
    
    let query = this.supabase
      .from(tableName)
      .select('*')
      .eq('creator_id', parseInt(userId) || 1)
      .order('updated_at', { ascending: false });

    if (organizationId) {
      query = query.eq('company_id', parseInt(organizationId) || 1);
    }

    const { data, error } = await query;

    if (error) throw new Error(`Failed to get user conversations: ${error.message}`);
    
    // Note: getUserConversations doesn't need UUIDs since we're using the internal ID for filtering
    // The ChatController handles the response mapping
    return (data || []).map(row => ({
      id: row.uuid,
      threadId: row.uuid,
      title: row.title,
      userId: row.creator_id?.toString() || '1',
      organizationId: row.company_id?.toString(),
      messageCount: row.message_count || 0,
      createdAt: new Date(row.created_at),
      updatedAt: row.updated_at ? new Date(row.updated_at) : new Date(row.created_at)
    }));
  }

  private async rowToConversation(row: any, fetchUuids: boolean = false): Promise<ChatConversation> {
    let userId = row.creator_id?.toString() || '1';
    let organizationId = row.company_id?.toString();

    // Fetch actual UUIDs if needed
    if (fetchUuids && row.creator_id) {
      const { data: userData } = await this.supabase
        .from(this.getTableName('users'))
        .select('uuid')
        .eq('id', row.creator_id)
        .single();
      
      if (userData) {
        userId = userData.uuid;
      }
    }

    if (fetchUuids && row.company_id) {
      const { data: companyData } = await this.supabase
        .from(this.getTableName('companies'))
        .select('uuid')
        .eq('id', row.company_id)
        .single();
      
      if (companyData) {
        organizationId = companyData.uuid;
      }
    }

    return {
      id: row.uuid,
      threadId: row.uuid, // Use UUID as threadId for conversations
      title: row.title,
      userId,
      organizationId,
      messageCount: row.message_count || 0,
      createdAt: new Date(row.created_at),
      updatedAt: row.updated_at ? new Date(row.updated_at) : new Date(row.created_at)
    };
  }
}
