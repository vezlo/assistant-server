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
      password: { type: 'string', description: 'User password' },
      company_domain: { type: 'string', description: 'Optional company domain for multi-company users' }
    }
  },

  LogoutRequest: {
    type: 'object',
    properties: {}
  },

  RefreshTokenRequest: {
    type: 'object',
    required: ['refresh_token'],
    properties: {
      refresh_token: { type: 'string', description: 'Refresh token' }
    }
  },

  // ============================================================================
  // AUTHENTICATION RESPONSE SCHEMAS
  // ============================================================================
  LoginResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      access_token: { type: 'string', description: 'JWT access token' },
      refresh_token: { type: 'string', description: 'JWT refresh token' },
      user: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'User UUID' },
          email: { type: 'string', description: 'User email' },
          name: { type: 'string', description: 'User name' }
        }
      },
        profile: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Profile UUID' },
            company_id: { type: 'string', description: 'Company UUID' },
            company_name: { type: 'string', description: 'Company name' },
            role: { type: 'string', description: 'User role in company' }
          }
        },
      available_companies: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Company UUID' },
            name: { type: 'string', description: 'Company name' },
            domain: { type: 'string', description: 'Company domain' },
            role: { type: 'string', description: 'User role in company' }
          }
        }
      }
    }
  },

  LogoutResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      message: { type: 'string' }
    }
  },

  RefreshTokenResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      access_token: { type: 'string', description: 'New JWT access token' }
    }
  },

  MeResponse: {
    type: 'object',
    properties: {
      user: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'User UUID' },
          email: { type: 'string', description: 'User email' },
          name: { type: 'string', description: 'User name' }
        }
      },
      membership: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Profile UUID' },
          company_id: { type: 'string', description: 'Company UUID' },
          company_name: { type: 'string', description: 'Company name' },
          role: { type: 'string', description: 'User role in company' }
        }
      }
    }
  }
};

