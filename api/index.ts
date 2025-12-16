/**
 * Vercel Serverless Function Entry Point
 *
 * This file wraps the Express application for Vercel's serverless platform.
 * Vercel requires serverless functions in the /api directory.
 */

import { VercelRequest, VercelResponse } from '@vercel/node';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { config } from 'dotenv';
import path from 'path';

// Import configurations from compiled dist
import logger from '../dist/src/config/logger';
import { initializeSupabase, getSupabaseClient } from '../dist/src/config/database';
import { specs, swaggerUi, swaggerUiOptions } from '../dist/src/config/swagger';
import { config as globalConfig } from '../dist/src/config/global';
import { errorHandler, notFoundHandler } from '../dist/src/middleware/errorHandler';
import { authenticateUser, authenticateApiKey, authenticateUserOrApiKey } from '../dist/src/middleware/auth';

// Import services from compiled dist
import { initializeCoreServices } from '../dist/src/bootstrap/initializeServices';
import { ChatController } from '../dist/src/controllers/ChatController';
import { KnowledgeController } from '../dist/src/controllers/KnowledgeController';
import { AuthController } from '../dist/src/controllers/AuthController';
import { ApiKeyController } from '../dist/src/controllers/ApiKeyController';
import { CompanyController } from '../dist/src/controllers/CompanyController';
import { RealtimePublisher } from '../dist/src/services/RealtimePublisher';

// Load environment variables
config();

// Get the directory path (in Node.js CommonJS, __dirname is already available)
const publicPath = path.join(process.cwd(), 'public');

// Initialize Express app (shared across invocations)
// Note: Timeout is controlled by Vercel's maxDuration in vercel.json (60s for Pro plan)
// This matches globalConfig.api.timeout (60000ms)
const app = express();

// Middleware
app.use(helmet({
  contentSecurityPolicy: false, // Vercel handles this
}));
// Compression middleware - disable for SSE streams
app.use(compression({
  filter: (req, res) => {
    // Don't compress Server-Sent Events
    if (res.getHeader('Content-Type') === 'text/event-stream') {
      return false;
    }
    // Use default compression filter for everything else
    return compression.filter(req, res);
  }
}));
app.use(cors({
  origin: globalConfig.cors.origins.length ? globalConfig.cors.origins : true,
  credentials: globalConfig.cors.credentials
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: globalConfig.api.rateLimiting.windowMs,
  max: globalConfig.api.rateLimiting.maxRequests,
  message: {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later.',
      timestamp: new Date().toISOString()
    },
    success: false
  },
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api/', limiter);

// Global services (initialized lazily)
let servicesInitialized = false;
let chatController: ChatController;
let knowledgeController: KnowledgeController;
let authController: AuthController;
let apiKeyController: ApiKeyController;
let companyController: CompanyController;
let supabase: any;
let realtimePublisher: RealtimePublisher | null = null;

async function initializeServices() {
  if (servicesInitialized) return;

  logger.info('Initializing Vezlo services...');

  try {
    // Initialize Supabase
    supabase = initializeSupabase();
    logger.info('Supabase client initialized');

    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY!;
    realtimePublisher = new RealtimePublisher(process.env.SUPABASE_URL!, supabaseKey);

    const { controllers, services } = initializeCoreServices({
      supabase,
      tablePrefix: 'vezlo',
      knowledgeTableName: 'vezlo_knowledge_items'
    });

    chatController = controllers.chatController;
    knowledgeController = controllers.knowledgeController;
    authController = controllers.authController;
    authController.setRealtimePublisher(realtimePublisher);
    apiKeyController = controllers.apiKeyController;
    companyController = controllers.companyController;

    servicesInitialized = true;
    logger.info('All services initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize services:', error);
    throw error;
  }
}

// Routes

// (No static public assets served)


// (Setup API removed)

// Redirect root to docs
app.get('/', (_req, res) => {
  res.redirect('/docs');
});

// API Documentation - custom HTML with CDN assets for serverless
app.get('/docs', (req, res) => {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Assistant API Docs</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css" />
  <style>
    .swagger-ui .topbar { display: none !important; }
    .swagger-ui .topbar-wrapper { display: none !important; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function() {
      const ui = SwaggerUIBundle({
        spec: ${JSON.stringify(specs)},
        dom_id: '#swagger-ui',
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        layout: "StandaloneLayout",
        deepLinking: true,
        docExpansion: 'list',
        filter: false,
        showRequestDuration: true,
        defaultModelsExpandDepth: 2,
        defaultModelExpandDepth: 2,
        displayOperationId: false,
        displayRequestDuration: true
      });
    }
  </script>
</body>
</html>`;
  res.send(html);
});

// Health check
app.get('/health', async (_req, res) => {
  try {
    const healthChecks: any = {
      server: 'healthy',
      timestamp: new Date().toISOString(),
      platform: 'vercel'
    };

    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.from('vezlo_conversations').select('count').limit(1);
      healthChecks.supabase = error ? 'error' : 'connected';
    } catch (error) {
      healthChecks.supabase = 'disconnected';
    }

    res.json({
      status: 'healthy',
      checks: healthChecks
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Middleware to ensure services are initialized for API routes
const requireServices = async (_req: any, res: any, next: any) => {
  try {
    await initializeServices();
    next();
  } catch (error) {
    logger.error('Failed to initialize services:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INITIALIZATION_FAILED',
        message: 'Failed to initialize server services. Verify environment variables are set in Vercel settings.',
        timestamp: new Date().toISOString()
      }
    });
  }
};

// Helper function for authenticated routes (JWT only)
const requireAuth = (req: any, res: any, next: any) => {
  const authMiddleware = authenticateUser(supabase);
  authMiddleware(req, res, next);
};

// Helper function for routes that accept both JWT and API key
const requireUserOrApiKey = (req: any, res: any, next: any) => {
  const authMiddleware = authenticateUserOrApiKey(supabase);
  authMiddleware(req, res, next);
};

// Authentication APIs
app.post('/api/auth/login', requireServices, (req, res) => authController.login(req, res));
app.post('/api/auth/logout', requireServices, requireAuth, (req, res) => authController.logout(req, res));
app.get('/api/auth/me', requireServices, requireAuth, (req, res) => authController.getMe(req, res));

// API Key Management APIs
app.post('/api/api-keys', requireServices, requireAuth, (req, res) => apiKeyController.generateApiKey(req, res));
app.get('/api/api-keys/status', requireServices, requireAuth, (req, res) => apiKeyController.getApiKeyStatus(req, res));

// Company APIs
/**
 * @swagger
 * /api/company/analytics:
 *   get:
 *     summary: Get company analytics
 *     description: Returns analytics data for the authenticated company including conversation stats, user counts, message volume, and feedback.
 *     tags: [Company]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Analytics data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 conversations:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     open:
 *                       type: integer
 *                     closed:
 *                       type: integer
 *                 users:
 *                   type: object
 *                   properties:
 *                     total_active_users:
 *                       type: integer
 *                 messages:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                       description: Total messages across all types
 *                     user_messages_total:
 *                       type: integer
 *                       description: Total user messages
 *                     assistant_messages_total:
 *                       type: integer
 *                       description: Total AI assistant messages
 *                     agent_messages_total:
 *                       type: integer
 *                       description: Total human agent messages
 *                 feedback:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     likes:
 *                       type: integer
 *                     dislikes:
 *                       type: integer
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Internal server error
 */
app.get('/api/company/analytics', requireServices, requireAuth, (req, res) => companyController.getAnalytics(req, res));

// Conversation APIs (Public - No Authentication Required for Widget)
app.post('/api/conversations', requireServices, (req, res) => chatController.createConversation(req, res));
app.get('/api/conversations/:uuid', requireServices, requireAuth, (req, res) =>
  chatController.getConversation(req, res)
);
app.get('/api/conversations/:uuid/messages', requireServices, requireAuth, (req, res) =>
  (chatController as any).getConversationMessages(req, res)
);
app.post('/api/conversations/:uuid/join', requireServices, requireAuth, (req, res) =>
  (chatController as any).joinConversation(req, res)
);
app.post('/api/conversations/:uuid/messages/agent', requireServices, requireAuth, (req, res) =>
  (chatController as any).sendAgentMessage(req, res)
);
app.post('/api/conversations/:uuid/close', requireServices, requireAuth, (req, res) =>
  (chatController as any).closeConversation(req, res)
);
app.post('/api/conversations/:uuid/archive', requireServices, requireAuth, (req, res) =>
  (chatController as any).archiveConversation(req, res)
);
app.delete('/api/conversations/:uuid', requireServices, requireAuth, (req, res) => chatController.deleteConversation(req, res));

// Message APIs (Public - No Authentication Required for Widget)
app.post('/api/conversations/:uuid/messages', requireServices, (req, res) => chatController.createUserMessage(req, res));
app.post('/api/messages/:uuid/generate', requireServices, (req, res) => chatController.generateResponse(req, res));

// Conversation list (moved to match server.ts order)
app.get('/api/conversations', requireServices, requireAuth, (req, res) => chatController.getUserConversations(req, res));

// Feedback API (Public - no auth required)
app.post('/api/feedback', requireServices, (req, res) => chatController.submitFeedback(req, res));
app.delete('/api/feedback/:uuid', requireServices, (req, res) => chatController.deleteFeedback(req, res));

// Knowledge Base APIs
app.post('/api/knowledge/items', requireServices, requireUserOrApiKey, (req, res) => knowledgeController.createItem(req, res));
app.get('/api/knowledge/items', requireServices, requireAuth, (req, res) => knowledgeController.listItems(req, res));
app.post('/api/knowledge/search', requireServices, requireUserOrApiKey, (req, res) => knowledgeController.search(req, res));
app.post('/api/search', requireServices, requireUserOrApiKey, (req, res) => knowledgeController.ragSearch(req, res));
app.get('/api/knowledge/items/:uuid', requireServices, requireAuth, (req, res) => knowledgeController.getItem(req, res));
app.put('/api/knowledge/items/:uuid', requireServices, requireAuth, (req, res) => knowledgeController.updateItem(req, res));
app.delete('/api/knowledge/items/:uuid', requireServices, requireAuth, (req, res) => knowledgeController.deleteItem(req, res));

// Citation API (Public - no auth required for widget access)
// Swagger docs are in server.ts - swagger-jsdoc picks them up from there
app.get('/api/knowledge/citations/:uuid/context', requireServices, (req, res) =>
  (knowledgeController as any).getCitationContext(req, res)
);

// Migration APIs (for development/setup)
app.get('/api/migrate', requireServices, async (req, res) => {
  try {
    const apiKey = (req.query.key || req.headers['x-migration-key']) as string;

    const { MigrationService } = await import('../dist/src/services/MigrationService');
    const result = await MigrationService.runMigrations(apiKey);

    const statusCode = result.success ? 200 :
      result.error === 'UNAUTHORIZED' ? 401 :
      result.error === 'MISSING_ENV_VARS' || result.error === 'DATABASE_CONNECTION_FAILED' ? 400 : 500;

    res.status(statusCode).json(result);
  } catch (error) {
    logger.error('Migration error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'MIGRATION_FAILED',
        message: error instanceof Error ? error.message : 'Migration failed',
        timestamp: new Date().toISOString()
      }
    });
  }
});

app.get('/api/migrate/status', requireServices, async (req, res) => {
  try {
    const apiKey = (req.query.key || req.headers['x-migration-key']) as string;

    const { MigrationService } = await import('../dist/src/services/MigrationService');
    const result = await MigrationService.getStatus(apiKey);

    const statusCode = result.success ? 200 :
      result.error === 'UNAUTHORIZED' ? 401 : 500;

    res.status(statusCode).json(result);
  } catch (error) {
    logger.error('Migration status error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'MIGRATION_STATUS_FAILED',
        message: error instanceof Error ? error.message : 'Failed to get migration status',
        timestamp: new Date().toISOString()
      }
    });
  }
});

// Seed Default Data API
app.post('/api/seed-default', requireServices, async (req, res) => {
  try {
    const apiKey = (req.query.key || req.headers['x-migration-key']) as string;

    // Validate API key
    const { MigrationService } = await import('../dist/src/services/MigrationService');
    const keyValid = MigrationService.validateApiKey(apiKey);
    
    if (!keyValid) {
      res.status(401).json({
        success: false,
        message: 'Invalid or missing migration API key',
        error: 'UNAUTHORIZED'
      });
      return;
    }

    // Execute seed using SetupService
    const { SetupService } = await import('../dist/src/services/SetupService');
    const setupService = new SetupService(supabase);
    const response = await setupService.executeSeedDefault();

    res.status(200).json(response);

  } catch (error) {
    logger.error('Seed default failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to seed default data',
      error: error instanceof Error ? error.message : 'SEED_DEFAULT_FAILED',
      details: {
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    });
  }
});

// Generate API Key
app.post('/api/generate-key', requireServices, async (req, res) => {
  try {
    const apiKey = (req.query.key || req.headers['x-migration-key']) as string;

    // Validate API key
    const { MigrationService } = await import('../dist/src/services/MigrationService');
    const keyValid = MigrationService.validateApiKey(apiKey);
    
    if (!keyValid) {
      res.status(401).json({
        success: false,
        message: 'Invalid or missing migration API key',
        error: 'UNAUTHORIZED'
      });
      return;
    }

    // Execute generate key using SetupService
    const { SetupService } = await import('../dist/src/services/SetupService');
    const setupService = new SetupService(supabase);
    const response = await setupService.executeGenerateKey();

    res.status(200).json({
      success: true,
      message: 'API key generated successfully',
      api_key_details: response
    });

  } catch (error) {
    logger.error('Generate API key failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate API key',
      error: error instanceof Error ? error.message : 'GENERATE_KEY_FAILED',
      details: {
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    });
  }
});

// Error handlers
app.use(notFoundHandler);
app.use(errorHandler);

// Vercel serverless function export
export default async (req: VercelRequest, res: VercelResponse) => {
  try {
    // Don't initialize services here - let routes handle it conditionally
    // This allows /setup and /health to work without configuration
    return app(req as any, res as any);
  } catch (error) {
    logger.error('Function invocation error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.stack : undefined) : undefined
    });
  }
};
