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
import { Server } from 'socket.io';
import { config } from 'dotenv';
import path from 'path';

// Import configurations from compiled dist
import logger from '../dist/src/config/logger';
import { initializeSupabase, getSupabaseClient } from '../dist/src/config/database';
import { specs, swaggerUi, swaggerUiOptions } from '../dist/src/config/swagger';
import { config as globalConfig } from '../dist/src/config/global';
import { errorHandler, notFoundHandler } from '../dist/src/middleware/errorHandler';
import { authenticateUser, authenticateApiKey } from '../dist/src/middleware/auth';

// Import services from compiled dist
import { AIService } from '../dist/src/services/AIService';
import { ChatManager } from '../dist/src/services/ChatManager';
import { KnowledgeBaseService } from '../dist/src/services/KnowledgeBaseService';
import { UnifiedStorage } from '../dist/src/storage/UnifiedStorage';

// Import controllers from compiled dist
import { ChatController } from '../dist/src/controllers/ChatController';
import { KnowledgeController } from '../dist/src/controllers/KnowledgeController';
import { AuthController } from '../dist/src/controllers/AuthController';

// Load environment variables
config();

// Get the directory path (in Node.js CommonJS, __dirname is already available)
const publicPath = path.join(process.cwd(), 'public');

// Initialize Express app (shared across invocations)
const app = express();

// Middleware
app.use(helmet({
  contentSecurityPolicy: false, // Vercel handles this
}));
app.use(compression());
app.use(cors({
  origin: process.env.CORS_ORIGINS?.split(',') || '*',
  credentials: true
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
let aiService: AIService;
let chatManager: ChatManager;
let knowledgeBase: KnowledgeBaseService;
let storage: UnifiedStorage;
let chatController: ChatController;
let knowledgeController: KnowledgeController;
let authController: AuthController;
let supabase: any;

async function initializeServices() {
  if (servicesInitialized) return;

  logger.info('Initializing Vezlo services...');

  try {
    // Initialize Supabase
    supabase = initializeSupabase();
    logger.info('Supabase client initialized');

    // Initialize storage
    storage = new UnifiedStorage(supabase, 'vezlo');

    // Initialize knowledge base
    knowledgeBase = new KnowledgeBaseService({
      supabase,
      tableName: 'vezlo_knowledge_items'
    });

    // Initialize AI service
    aiService = new AIService({
      openaiApiKey: process.env.OPENAI_API_KEY!,
      organizationName: process.env.ORGANIZATION_NAME || 'Vezlo',
      assistantName: process.env.ASSISTANT_NAME || 'Vezlo Assistant',
      model: process.env.AI_MODEL || 'gpt-4',
      temperature: parseFloat(process.env.AI_TEMPERATURE || '0.7'),
      maxTokens: parseInt(process.env.AI_MAX_TOKENS || '1000'),
      knowledgeBaseService: knowledgeBase
    });

    // Initialize chat manager
    chatManager = new ChatManager({
      aiService,
      storage,
      enableConversationManagement: true,
      conversationTimeout: 3600000
    });

    // Initialize controllers
    chatController = new ChatController(chatManager, storage);
    knowledgeController = new KnowledgeController(knowledgeBase, aiService);
    authController = new AuthController(supabase);

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

// Helper function for authenticated routes
const requireAuth = (req: any, res: any, next: any) => {
  const authMiddleware = authenticateUser(supabase);
  authMiddleware(req, res, next);
};

// Authentication APIs
app.post('/api/auth/login', requireServices, (req, res) => authController.login(req, res));
app.post('/api/auth/logout', requireServices, requireAuth, (req, res) => authController.logout(req, res));
app.get('/api/auth/me', requireServices, requireAuth, (req, res) => authController.getMe(req, res));
app.post('/api/auth/refresh', requireServices, (req, res) => authController.refreshToken(req, res));

// Conversation APIs
app.post('/api/conversations', requireServices, requireAuth, (req, res) => chatController.createConversation(req, res));
app.get('/api/conversations/:uuid', requireServices, requireAuth, (req, res) => chatController.getConversation(req, res));
app.delete('/api/conversations/:uuid', requireServices, requireAuth, (req, res) => chatController.deleteConversation(req, res));

// Message APIs
app.post('/api/conversations/:uuid/messages', requireServices, requireAuth, (req, res) => chatController.createUserMessage(req, res));
app.post('/api/messages/:uuid/generate', requireServices, requireAuth, (req, res) => chatController.generateResponse(req, res));

// Conversation list (moved to match server.ts order)
app.get('/api/conversations', requireServices, requireAuth, (req, res) => chatController.getUserConversations(req, res));

// Feedback API
app.post('/api/feedback', requireServices, requireAuth, (req, res) => chatController.submitFeedback(req, res));

// Knowledge Base APIs
app.post('/api/knowledge/items', requireServices, requireAuth, (req, res) => knowledgeController.createItem(req, res));
app.get('/api/knowledge/items', requireServices, requireAuth, (req, res) => knowledgeController.listItems(req, res));
app.post('/api/knowledge/search', requireServices, requireAuth, (req, res) => knowledgeController.search(req, res));
app.post('/api/search', requireServices, requireAuth, (req, res) => knowledgeController.ragSearch(req, res));
app.get('/api/knowledge/items/:uuid', requireServices, requireAuth, (req, res) => knowledgeController.getItem(req, res));
app.put('/api/knowledge/items/:uuid', requireServices, requireAuth, (req, res) => knowledgeController.updateItem(req, res));
app.delete('/api/knowledge/items/:uuid', requireServices, requireAuth, (req, res) => knowledgeController.deleteItem(req, res));

// Migration APIs (for development/setup)
app.get('/api/migrate', requireServices, async (req, res) => {
  try {
    const { runMigrations } = await import('../dist/src/services/MigrationService');
    const result = await runMigrations();
    res.json({
      success: true,
      message: 'Migrations completed successfully',
      data: result
    });
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
    const { getMigrationStatus } = await import('../dist/src/config/knex');
    const lastMigration = await getMigrationStatus();
    res.json({
      success: true,
      data: {
        lastMigration,
        timestamp: new Date().toISOString()
      }
    });
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
