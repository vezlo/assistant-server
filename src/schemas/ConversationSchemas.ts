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
      title: { type: 'string', description: 'Conversation title', default: 'New Conversation' }
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
      created_at: { type: 'string', format: 'date-time' },
      updated_at: { type: 'string', format: 'date-time' }
    }
  },

  ConversationWithMessages: {
    type: 'object',
    properties: {
      uuid: { type: 'string', description: 'Conversation UUID' },
      title: { type: 'string', description: 'Conversation title' },
      message_count: { type: 'integer', description: 'Number of messages' },
      created_at: { type: 'string', format: 'date-time' },
      updated_at: { type: 'string', format: 'date-time' },
      messages: {
        type: 'array',
        items: { $ref: '#/components/schemas/MessageResponse' }
      }
    }
  },

  ConversationListResponse: {
    type: 'object',
    properties: {
      conversations: {
        type: 'array',
        items: { $ref: '#/components/schemas/ConversationResponse' }
      },
      total: { type: 'integer', description: 'Total number of conversations' },
      limit: { type: 'integer', description: 'Conversations per page' },
      offset: { type: 'integer', description: 'Conversations skipped' }
    }
  },

  CreateConversationResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      data: { $ref: '#/components/schemas/ConversationResponse' }
    }
  },

  GetConversationResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      data: { $ref: '#/components/schemas/ConversationWithMessages' }
    }
  }
};
