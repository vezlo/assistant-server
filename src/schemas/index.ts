/**
 * Schema Exports
 * Central export point for all API schemas
 */

import { ConversationSchemas } from './ConversationSchemas';
import { MessageSchemas } from './MessageSchemas';
import { KnowledgeSchemas } from './KnowledgeSchemas';
import { FeedbackSchemas } from './FeedbackSchemas';
import { AuthSchemas } from './AuthSchemas';

// Combine all schemas for Swagger
export const AllSchemas = {
  ...ConversationSchemas,
  ...MessageSchemas,
  ...KnowledgeSchemas,
  ...FeedbackSchemas,
  ...AuthSchemas
};

// Individual exports for specific use
export {
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
