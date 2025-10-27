/**
 * Feedback API Schemas
 * All request/response schemas for feedback-related endpoints
 */

export const FeedbackSchemas = {
  // ============================================================================
  // FEEDBACK REQUEST SCHEMAS
  // ============================================================================
  FeedbackRequest: {
    type: 'object',
    required: ['message_uuid', 'rating'],
    properties: {
      message_uuid: { type: 'string', description: 'Message UUID' },
      rating: { type: 'string', enum: ['positive', 'negative'], description: 'Feedback rating' },
      category: { 
        type: 'string', 
        enum: ['accuracy', 'helpfulness', 'clarity', 'relevance', 'completeness', 'other'],
        description: 'Feedback category' 
      },
      comment: { type: 'string', description: 'Feedback comment' },
      suggested_improvement: { type: 'string', description: 'Suggested improvement' }
    }
  },

  UpdateFeedbackRequest: {
    type: 'object',
    properties: {
      rating: { type: 'string', enum: ['positive', 'negative'], description: 'Updated feedback rating' },
      category: { 
        type: 'string', 
        enum: ['accuracy', 'helpfulness', 'clarity', 'relevance', 'completeness', 'other'],
        description: 'Updated feedback category' 
      },
      comment: { type: 'string', description: 'Updated feedback comment' },
      suggested_improvement: { type: 'string', description: 'Updated suggested improvement' }
    }
  },

  // ============================================================================
  // FEEDBACK RESPONSE SCHEMAS
  // ============================================================================
  FeedbackResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      feedback: {
        type: 'object',
        properties: {
          uuid: { type: 'string', description: 'Feedback UUID' },
          message_uuid: { type: 'string', description: 'Message UUID' },
          user_uuid: { type: 'string', description: 'User UUID' },
          rating: { type: 'string', description: 'Rating' },
          category: { type: 'string', description: 'Category' },
          comment: { type: 'string', description: 'Comment' },
          suggested_improvement: { type: 'string', description: 'Suggested improvement' },
          created_at: { type: 'string', format: 'date-time' },
          updated_at: { type: 'string', format: 'date-time' }
        }
      }
    }
  },

  FeedbackListResponse: {
    type: 'object',
    properties: {
      feedback: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            uuid: { type: 'string', description: 'Feedback UUID' },
            message_uuid: { type: 'string', description: 'Message UUID' },
            user_uuid: { type: 'string', description: 'User UUID' },
            rating: { type: 'string', description: 'Rating' },
            category: { type: 'string', description: 'Category' },
            comment: { type: 'string', description: 'Comment' },
            suggested_improvement: { type: 'string', description: 'Suggested improvement' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' }
          }
        }
      },
      total: { type: 'integer', description: 'Total number of feedback items' },
      limit: { type: 'integer', description: 'Feedback items per page' },
      offset: { type: 'integer', description: 'Feedback items skipped' }
    }
  },

  FeedbackStatsResponse: {
    type: 'object',
    properties: {
      total_feedback: { type: 'integer', description: 'Total feedback count' },
      positive_count: { type: 'integer', description: 'Positive feedback count' },
      negative_count: { type: 'integer', description: 'Negative feedback count' },
      positive_percentage: { type: 'number', description: 'Positive feedback percentage' },
      categories: {
        type: 'object',
        description: 'Feedback count by category',
        additionalProperties: { type: 'integer' }
      },
      recent_feedback: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            uuid: { type: 'string' },
            rating: { type: 'string' },
            category: { type: 'string' },
            created_at: { type: 'string', format: 'date-time' }
          }
        }
      }
    }
  },

  SubmitFeedbackResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      feedback: {
        type: 'object',
        properties: {
          uuid: { type: 'string', description: 'Feedback UUID' },
          message_uuid: { type: 'string', description: 'Message UUID' },
          rating: { type: 'string', description: 'Rating (positive/negative)' },
          category: { type: 'string', description: 'Category' },
          comment: { type: 'string', description: 'Comment' },
          suggested_improvement: { type: 'string', description: 'Suggested improvement' },
          created_at: { type: 'string', format: 'date-time' }
        },
        required: ['uuid', 'message_uuid', 'rating', 'created_at']
      }
    }
  }
};
