import { SupabaseClient } from '@supabase/supabase-js';
import {
  ChatConversation,
  ConversationListOptions,
  ConversationListResult
} from '../types';

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
          updated_at: conversation.updatedAt?.toISOString() || new Date().toISOString(),
          last_message_at: conversation.lastMessageAt?.toISOString() || conversation.createdAt?.toISOString() || new Date().toISOString()
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
      .is('deleted_at', null)
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
    if (updates.lastMessageAt !== undefined) updateData.last_message_at = updates.lastMessageAt instanceof Date ? updates.lastMessageAt.toISOString() : updates.lastMessageAt;
    if (updates.joinedAt !== undefined) updateData.joined_at = updates.joinedAt instanceof Date ? updates.joinedAt.toISOString() : updates.joinedAt;
    if (updates.respondedAt !== undefined) updateData.responded_at = updates.respondedAt instanceof Date ? updates.respondedAt.toISOString() : updates.respondedAt;
    if (updates.closedAt !== undefined) updateData.closed_at = updates.closedAt instanceof Date ? updates.closedAt.toISOString() : updates.closedAt;
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

  async getUserConversations(
    userId: string,
    organizationId?: string,
    options: ConversationListOptions = {}
  ): Promise<ConversationListResult> {
    const tableName = this.getTableName('conversations');

    const { limit, offset, orderBy } = options;
    const orderColumn = orderBy === 'last_message_at' ? 'last_message_at' : 'updated_at';
    const from = typeof offset === 'number' && offset >= 0 ? offset : 0;
    const pageSize = typeof limit === 'number' && limit > 0 ? limit : undefined;

    let query = this.supabase
      .from(tableName)
      .select('*', { count: 'exact' })
      .is('deleted_at', null);

    if (organizationId) {
      query = query.eq('company_id', parseInt(organizationId) || 1);
    } else {
      query = query.eq('creator_id', parseInt(userId) || 1);
    }

    query = query.order(orderColumn, { ascending: false, nullsFirst: false });

    if (pageSize) {
      query = query.range(from, from + pageSize - 1);
    }

    const { data, error, count } = await query;

    if (error) throw new Error(`Failed to get user conversations: ${error.message}`);

    const conversations = await Promise.all(
      (data || []).map(row => this.rowToConversation(row))
    );

    return {
      conversations,
      total: typeof count === 'number' ? count : conversations.length
    };
  }

  private async rowToConversation(row: any, fetchUuids: boolean = false): Promise<ChatConversation> {
    let userId = row.creator_id?.toString() || '1';
    // IMPORTANT: organizationId should ALWAYS be the integer ID (as string), NOT the UUID
    // UUIDs are only for external API exposure, internal logic uses integer IDs
    const organizationId = row.company_id?.toString();

    // Fetch actual user UUID if needed (for external API responses)
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

    // NOTE: We do NOT fetch company UUID for organizationId
    // organizationId must remain as the integer ID for internal operations
    // (knowledge base search, filtering, etc.)

    return {
      id: row.uuid,
      threadId: row.uuid, // Use UUID as threadId for conversations
      title: row.title,
      userId,
      organizationId,
      messageCount: row.message_count || 0,
      createdAt: new Date(row.created_at),
      updatedAt: row.updated_at ? new Date(row.updated_at) : new Date(row.created_at),
      joinedAt: row.joined_at ? new Date(row.joined_at) : undefined,
      respondedAt: row.responded_at ? new Date(row.responded_at) : undefined,
      closedAt: row.closed_at ? new Date(row.closed_at) : undefined,
      lastMessageAt: row.last_message_at ? new Date(row.last_message_at) : undefined
    };
  }
}
