/**
 * Message API Schemas
 * All request/response schemas for message-related endpoints
 */

export const MessageSchemas = {
  // ============================================================================
  // MESSAGE REQUEST SCHEMAS
  // ============================================================================
  CreateMessageRequest: {
    type: 'object',
    required: ['content'],
    properties: {
      content: { type: 'string', description: 'Message content' }
    }
  },

  GenerateMessageRequest: {
    type: 'object',
    properties: {
      regenerate: { type: 'boolean', description: 'Whether to regenerate the response', default: false },
      context: { type: 'object', description: 'Additional context for generation' },
      technical_depth: { type: 'integer', minimum: 1, maximum: 5, description: 'Technical depth level (1=Executive, 2=Support, 3=General, 4=Technical, 5=Developer). Overrides conversation and company defaults.' }
    }
  },

  // ============================================================================
  // MESSAGE RESPONSE SCHEMAS
  // ============================================================================
  MessageResponse: {
    type: 'object',
    properties: {
      uuid: { type: 'string', description: 'Message UUID' },
      conversation_uuid: { type: 'string', description: 'Conversation UUID' },
      parent_message_uuid: { type: 'string', description: 'Parent message UUID (for regeneration)' },
      type: { type: 'string', enum: ['user', 'assistant', 'system', 'agent'], description: 'Message type' },
      content: { type: 'string', description: 'Message content' },
      status: { type: 'string', enum: ['generating', 'completed', 'stopped', 'failed'], description: 'Message status' },
      author_id: { type: 'string', nullable: true, description: 'Human agent user ID (if applicable)' },
      metadata: { type: 'object', additionalProperties: true },
      created_at: { type: 'string', format: 'date-time' }
    }
  },

  MessageListResponse: {
    type: 'object',
    properties: {
      messages: {
        type: 'array',
        items: { $ref: '#/components/schemas/MessageResponse' }
      },
      total: { type: 'integer', description: 'Total number of messages' },
      limit: { type: 'integer', description: 'Messages per page' },
      offset: { type: 'integer', description: 'Messages skipped' }
    }
  },

  GenerateMessageResponse: {
    type: 'object',
    properties: {
      uuid: { type: 'string', description: 'Generated message UUID' },
      parent_message_uuid: { type: 'string', description: 'Parent message UUID' },
      type: { type: 'string', enum: ['assistant'], description: 'Message type' },
      content: { type: 'string', description: 'Generated content' },
      status: { type: 'string', enum: ['completed', 'failed'], description: 'Generation status' },
      metadata: { 
        type: 'object', 
        description: 'Generation metadata',
        properties: {
          knowledge_sources: {
            type: 'array',
            items: { type: 'string' },
            description: 'Knowledge base sources used'
          },
          generation_time: { type: 'number', description: 'Generation time in milliseconds' }
        }
      },
      created_at: { type: 'string', format: 'date-time' }
    }
  },

  SendMessageResponse: {
    type: 'object',
    properties: {
      uuid: { type: 'string', description: 'Message UUID' },
      conversation_uuid: { type: 'string', description: 'Conversation UUID' },
      type: { type: 'string', enum: ['user', 'assistant', 'system'], description: 'Message type' },
      content: { type: 'string', description: 'Message content' },
      created_at: { type: 'string', format: 'date-time' }
    }
  },

  GenerateResponseResponse: {
    type: 'object',
    properties: {
      uuid: { type: 'string', description: 'Generated message UUID' },
      parent_message_uuid: { type: 'string', description: 'Parent message UUID' },
      type: { type: 'string', enum: ['assistant'], description: 'Message type' },
      content: { type: 'string', description: 'Generated content' },
      status: { type: 'string', enum: ['completed', 'failed'], description: 'Generation status' },
      created_at: { type: 'string', format: 'date-time' }
    }
  }
};
