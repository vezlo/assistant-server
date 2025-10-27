/**
 * Schema Exports
 * Central export point for all API schemas
 */

import { ConversationSchemas } from './ConversationSchemas';
import { MessageSchemas } from './MessageSchemas';
import { KnowledgeSchemas } from './KnowledgeSchemas';
import { FeedbackSchemas } from './FeedbackSchemas';
import { AuthSchemas } from './AuthSchemas';
import { CommonSchemas } from './CommonSchemas';

// Combine all schemas for Swagger
export const AllSchemas = {
  ...CommonSchemas,
  ...ConversationSchemas,
  ...MessageSchemas,
  ...KnowledgeSchemas,
  ...FeedbackSchemas,
  ...AuthSchemas
};

// Individual exports for specific use
export {
  CommonSchemas,
  ConversationSchemas,
  MessageSchemas,
  KnowledgeSchemas,
  FeedbackSchemas,
  AuthSchemas
};

// Schema validation helpers (can be extended)
export const SchemaValidators = {
  // Add custom validation functions here if needed
  validateConversationRequest: (data: any) => {
    // Custom validation logic
    return true;
  }
};
