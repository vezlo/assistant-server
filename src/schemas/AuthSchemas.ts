/**
 * Authentication API Schemas
 * All request/response schemas for authentication-related endpoints
 */

export const AuthSchemas = {
  // ============================================================================
  // AUTHENTICATION REQUEST SCHEMAS
  // ============================================================================
  LoginRequest: {
    type: 'object',
    required: ['email', 'password'],
    properties: {
      email: { type: 'string', format: 'email', description: 'User email address' },
      password: { type: 'string', description: 'User password' }
    }
  },

  LogoutRequest: {
    type: 'object',
    properties: {}
  },

  // ============================================================================
  // AUTHENTICATION RESPONSE SCHEMAS
  // ============================================================================
  LoginResponse: {
    type: 'object',
    properties: {
      access_token: { type: 'string', description: 'JWT access token' }
    }
  },

  LogoutResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      message: { type: 'string' }
    }
  },

  MeResponse: {
    type: 'object',
    properties: {
      user: {
        type: 'object',
        properties: {
          uuid: { type: 'string', description: 'User UUID' },
          email: { type: 'string', description: 'User email' },
          name: { type: 'string', description: 'User name' }
        }
      },
      profile: {
        type: 'object',
        properties: {
          uuid: { type: 'string', description: 'Profile UUID' },
          company_uuid: { type: 'string', description: 'Company UUID' },
          company_name: { type: 'string', description: 'Company name' },
          role: { type: 'string', description: 'User role in company' }
        }
      }
    }
  }
};

