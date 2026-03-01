/**
 * Conversation API Schemas
 * All request/response schemas for conversation-related endpoints
 */

export const ConversationSchemas = {
  // ============================================================================
  // CONVERSATION REQUEST SCHEMAS
  // ============================================================================
  CreateConversationRequest: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Conversation title', default: 'New Conversation' },
      technical_depth: { type: 'integer', minimum: 1, maximum: 5, nullable: true, description: 'Technical depth level for this conversation (1-5). Null means inherit from company default.' }
    }
  },

  UpdateConversationRequest: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Updated conversation title' }
    }
  },

  // ============================================================================
  // CONVERSATION RESPONSE SCHEMAS
  // ============================================================================
  ConversationResponse: {
    type: 'object',
    properties: {
      uuid: { type: 'string', description: 'Conversation UUID' },
      title: { type: 'string', description: 'Conversation title' },
      message_count: { type: 'integer', description: 'Number of messages' },
      status: { type: 'string', description: 'Conversation status (open, in_progress, closed, archived)' },
      created_at: { type: 'string', format: 'date-time' },
      updated_at: { type: 'string', format: 'date-time' },
      joined_at: { type: 'string', format: 'date-time', nullable: true },
      responded_at: { type: 'string', format: 'date-time', nullable: true },
      closed_at: { type: 'string', format: 'date-time', nullable: true },
      archived_at: { type: 'string', format: 'date-time', nullable: true },
      last_message_at: { type: 'string', format: 'date-time', nullable: true }
    }
  },

  ConversationWithMessages: {
    deprecated: true
  },

  ConversationListResponse: {
    type: 'object',
    properties: {
      conversations: {
        type: 'array',
        items: { $ref: '#/components/schemas/ConversationResponse' }
      },
      pagination: {
        type: 'object',
        properties: {
          page: { type: 'integer' },
          page_size: { type: 'integer' },
          total: { type: 'integer' },
          total_pages: { type: 'integer' },
          has_more: { type: 'boolean' }
        }
      }
    }
  },

  CreateConversationResponse: {
    type: 'object',
    properties: {
      uuid: { type: 'string', description: 'Conversation UUID' },
      title: { type: 'string', description: 'Conversation title' },
      user_uuid: { type: 'string', description: 'User UUID' },
      company_uuid: { type: 'string', description: 'Company UUID' },
      message_count: { type: 'integer', description: 'Number of messages' },
      status: { type: 'string', description: 'Conversation status (open, in_progress, closed, archived)' },
      created_at: { type: 'string', format: 'date-time' },
      updated_at: { type: 'string', format: 'date-time' },
      joined_at: { type: 'string', format: 'date-time', nullable: true },
      responded_at: { type: 'string', format: 'date-time', nullable: true },
      closed_at: { type: 'string', format: 'date-time', nullable: true },
      archived_at: { type: 'string', format: 'date-time', nullable: true },
      last_message_at: { type: 'string', format: 'date-time', nullable: true }
    }
  },

  GetConversationResponse: {
    type: 'object',
    properties: {
      uuid: { type: 'string', description: 'Conversation UUID' },
      title: { type: 'string', description: 'Conversation title' },
      user_uuid: { type: 'string', description: 'User UUID' },
      company_uuid: { type: 'string', description: 'Company UUID' },
      message_count: { type: 'integer', description: 'Number of messages' },
      status: { type: 'string', description: 'Conversation status (open, in_progress, closed)' },
      created_at: { type: 'string', format: 'date-time' },
      updated_at: { type: 'string', format: 'date-time' },
      joined_at: { type: 'string', format: 'date-time', nullable: true },
      responded_at: { type: 'string', format: 'date-time', nullable: true },
      closed_at: { type: 'string', format: 'date-time', nullable: true },
      last_message_at: { type: 'string', format: 'date-time', nullable: true }
    }
  },

  ConversationMessagesResponse: {
    type: 'object',
    properties: {
      conversation_uuid: { type: 'string', description: 'Conversation UUID' },
      order: { type: 'string', enum: ['asc', 'desc'], description: 'Sort order applied' },
      messages: {
        type: 'array',
        items: { $ref: '#/components/schemas/MessageResponse' }
      },
      pagination: {
        type: 'object',
        properties: {
          page: { type: 'integer' },
          page_size: { type: 'integer' },
          has_more: { type: 'boolean' },
          next_offset: { type: 'integer', nullable: true }
        }
      }
    }
  }
};
