/**
 * Common API Schemas
 * Shared schemas for common responses across all endpoints
 */

export const CommonSchemas = {
  HealthCheck: {
    type: 'object',
    properties: {
      server: {
        type: 'string',
        description: 'Server health status',
        example: 'healthy'
      },
      timestamp: {
        type: 'string',
        format: 'date-time',
        description: 'Current server timestamp',
        example: '2025-10-27T06:52:40.215Z'
      },
      database: {
        type: 'string',
        description: 'Database connection status',
        example: 'connected'
      }
    },
    required: ['server', 'timestamp', 'database']
  },

  Error: {
    type: 'object',
    properties: {
      error: {
        type: 'string',
        description: 'Error message',
        example: 'No token provided'
      }
    },
    required: ['error']
  },

  Success: {
    type: 'object',
    properties: {
      success: {
        type: 'boolean',
        description: 'Indicates if the request was successful',
        example: true
      },
      message: {
        type: 'string',
        description: 'Success message',
        example: 'Operation completed successfully'
      },
      timestamp: {
        type: 'string',
        format: 'date-time',
        description: 'Success timestamp',
        example: '2025-10-27T06:52:40.215Z'
      }
    },
    required: ['success']
  }
};


