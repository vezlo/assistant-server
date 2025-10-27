import { config as dotenvConfig } from 'dotenv';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { config } from './global';
import { AllSchemas } from '../schemas';

// Load environment variables
dotenvConfig();

const getServerUrl = () => {
  // Always use BASE_URL if set, otherwise fallback to appropriate default
  if (process.env.BASE_URL) {
    return process.env.BASE_URL;
  }
  
  // Fallback to Vercel URL or localhost
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  
  return 'http://localhost:3000';
};

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: config.swagger.title,
      version: config.swagger.version,
      description: config.swagger.description
    },
    servers: [
      {
        url: getServerUrl(),
        description: process.env.VERCEL_URL ? 'Current deployment' : 'Development server'
      }
    ],
    security: [
      {
        bearerAuth: []
      }
    ],
    components: {
      schemas: {
        // ============================================================================
        // IMPORTED CONTROLLER-SPECIFIC SCHEMAS
        // ============================================================================
        ...AllSchemas,

        // ============================================================================
        // COMMON/GLOBAL SCHEMAS (Keep these here)
        // ============================================================================
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', description: 'Error code' },
                message: { type: 'string', description: 'Error message' },
                details: { type: 'object', description: 'Additional error details' },
                timestamp: { type: 'string', format: 'date-time', description: 'Error timestamp' },
                path: { type: 'string', description: 'Request path' },
                method: { type: 'string', description: 'HTTP method' }
              }
            },
            success: { type: 'boolean', example: false }
          }
        },

        SuccessResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', description: 'Success message' },
            data: { type: 'object', description: 'Response data' }
          }
        },

        HealthCheck: {
          type: 'object',
          properties: {
            status: { type: 'string', example: 'healthy' },
            checks: {
              type: 'object',
              properties: {
                server: { type: 'string', example: 'healthy' },
                supabase: { type: 'string', example: 'connected' },
                openai: { type: 'string', example: 'connected' },
                timestamp: { type: 'string', format: 'date-time' }
              }
            },
            uptime: { type: 'number', description: 'Server uptime in seconds' },
            version: { type: 'string', description: 'API version' }
          }
        },

        PaginationMeta: {
          type: 'object',
          properties: {
            total: { type: 'integer', description: 'Total number of items' },
            limit: { type: 'integer', description: 'Items per page' },
            offset: { type: 'integer', description: 'Items skipped' },
            page: { type: 'integer', description: 'Current page number' },
            pages: { type: 'integer', description: 'Total number of pages' }
          }
        }
      },

      // ============================================================================
      // SECURITY SCHEMES
      // ============================================================================
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token for user authentication'
        },
        apiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'API key for service-to-service authentication'
        }
      },

      // ============================================================================
      // COMMON PARAMETERS
      // ============================================================================
      parameters: {
        LimitParam: {
          name: 'limit',
          in: 'query',
          description: 'Number of items to return',
          schema: {
            type: 'integer',
            minimum: 1,
            maximum: 100,
            default: 20
          }
        },
        OffsetParam: {
          name: 'offset',
          in: 'query',
          description: 'Number of items to skip',
          schema: {
            type: 'integer',
            minimum: 0,
            default: 0
          }
        },
      },

      // ============================================================================
      // COMMON RESPONSES
      // ============================================================================
      responses: {
        BadRequest: {
          description: 'Bad request - Invalid input data',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' }
            }
          }
        },
        Unauthorized: {
          description: 'Unauthorized - Authentication required',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' }
            }
          }
        },
        Forbidden: {
          description: 'Forbidden - Insufficient permissions',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' }
            }
          }
        },
        NotFound: {
          description: 'Not found - Resource does not exist',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' }
            }
          }
        },
        Conflict: {
          description: 'Conflict - Resource already exists',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' }
            }
          }
        },
        RateLimitExceeded: {
          description: 'Rate limit exceeded',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' }
            }
          }
        },
        InternalServerError: {
          description: 'Internal server error',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' }
            }
          }
        }
      }
    }
  },
  apis: [
    __dirname + '/../server.js',
    __dirname + '/../controllers/*.js'
  ]
};

export const specs = swaggerJsdoc(options);
export { swaggerUi };
export const swaggerUiOptions = {
  explorer: false,
  customSiteTitle: 'AI Assistant API Docs',
  customCss: `
    .swagger-ui .topbar { display: none !important; }
    .swagger-ui .topbar-wrapper { display: none !important; }
    .swagger-ui .topbar-wrapper .topbar { display: none !important; }
    .swagger-ui .topbar-wrapper .topbar .download-url-wrapper { display: none !important; }
    .swagger-ui .topbar-wrapper .topbar .download-url-button { display: none !important; }
    .swagger-ui .topbar-wrapper .topbar .topbar-wrapper { display: none !important; }
  `,
  swaggerOptions: {
    docExpansion: 'list',
    filter: false,
    showRequestDuration: true,
    defaultModelsExpandDepth: 2,
    defaultModelExpandDepth: 2,
    displayOperationId: false,
    displayRequestDuration: true
  }
};