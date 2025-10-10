import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { config } from 'dotenv';

// Import configurations
import logger from './config/logger';
import { initializeSupabase, getSupabaseClient } from './config/database';
import { specs, swaggerUi, swaggerUiOptions } from './config/swagger';
import { config as globalConfig, validateConfig } from './config/global';
import { errorHandler, notFoundHandler, asyncHandler } from './middleware/errorHandler';

// Import services
import { AIService } from './services/AIService';
import { ChatManager } from './services/ChatManager';
import { KnowledgeBaseService } from './services/KnowledgeBaseService';
import { UnifiedStorage } from './storage/UnifiedStorage';

// Import controllers
import { ChatController } from './controllers/ChatController';
import { KnowledgeController } from './controllers/KnowledgeController';

// Load environment variables
config();

// Initialize Express app
const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGINS?.split(',') || '*',
    credentials: true
  }
});

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.CORS_ORIGINS?.split(',') || '*',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting with global config
const limiter = rateLimit({
  windowMs: globalConfig.api.rateLimiting.windowMs,
  max: globalConfig.api.rateLimiting.maxRequests,
  message: {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests from this IP, please try again later.',
      timestamp: new Date().toISOString()
    },
    success: false
  },
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api/', limiter);

// Global services
let aiService: AIService;
let chatManager: ChatManager;
let knowledgeBase: KnowledgeBaseService;
let storage: UnifiedStorage;
let chatController: ChatController;
let knowledgeController: KnowledgeController;

async function initializeServices() {
  logger.info('Initializing Vezlo services...');

  try {
    // Initialize Supabase
    const supabase = initializeSupabase();
    logger.info('Supabase client initialized');

    // Initialize storage with new repository pattern
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
      enableFeedbackDetection: process.env.ENABLE_FEEDBACK_DETECTION === 'true',
      knowledgeBaseService: knowledgeBase
    });

    // Initialize chat manager
    chatManager = new ChatManager({
      aiService,
      storage,
      enableConversationManagement: true,
      conversationTimeout: 3600000 // 1 hour
    });

    // Initialize controllers
    chatController = new ChatController(chatManager, storage);
    knowledgeController = new KnowledgeController(knowledgeBase, aiService);

    logger.info('All services initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize services:', error);
    throw error;
  }
}

// Redirect root to docs
app.get('/', (req, res) => {
  res.redirect('/docs');
});

// API Documentation
app.use('/docs', swaggerUi.serve, swaggerUi.setup(specs, swaggerUiOptions));

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check endpoint
 *     description: Check server and database connectivity status
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Server is healthy
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthCheck'
 *       503:
 *         description: Server is unhealthy
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
app.get('/health', async (req, res) => {
  try {
    const healthChecks: any = {
      server: 'healthy',
      timestamp: new Date().toISOString()
    };

    // Check Supabase connection
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.from('vezlo_conversations').select('count').limit(1);
      if (!error) {
        healthChecks.supabase = 'connected';
      } else {
        healthChecks.supabase = 'error';
      }
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

// ============================================================================
// CONVERSATION APIS (New 2-API Flow)
// ============================================================================

/**
 * @swagger
 * /api/conversations:
 *   post:
 *     summary: Create a new conversation
 *     description: Create a new conversation for chat
 *     tags: [Conversations]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateConversationRequest'
 *     responses:
 *       200:
 *         description: Conversation created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ConversationResponse'
 *       400:
 *         description: Bad request
 *       500:
 *         description: Internal server error
 */
app.post('/api/conversations', (req, res) => chatController.createConversation(req, res));

/**
 * @swagger
 * /api/conversations/{uuid}:
 *   get:
 *     summary: Get conversation details with messages
 *     description: Retrieve conversation information and message history
 *     tags: [Conversations]
 *     parameters:
 *       - in: path
 *         name: uuid
 *         required: true
 *         schema:
 *           type: string
 *         description: Conversation UUID
 *     responses:
 *       200:
 *         description: Conversation details with messages
 *       404:
 *         description: Conversation not found
 *       500:
 *         description: Internal server error
 */
app.get('/api/conversations/:uuid', (req, res) => chatController.getConversation(req, res));

/**
 * @swagger
 * /api/conversations/{uuid}:
 *   delete:
 *     summary: Delete conversation
 *     description: Soft delete a conversation and its messages
 *     tags: [Conversations]
 *     parameters:
 *       - in: path
 *         name: uuid
 *         required: true
 *         schema:
 *           type: string
 *         description: Conversation UUID
 *     responses:
 *       200:
 *         description: Conversation deleted successfully
 *       404:
 *         description: Conversation not found
 *       500:
 *         description: Internal server error
 */
app.delete('/api/conversations/:uuid', (req, res) => chatController.deleteConversation(req, res));

/**
 * @swagger
 * /api/conversations/{uuid}/messages:
 *   post:
 *     summary: Create user message in conversation
 *     description: Add a user message to the conversation
 *     tags: [Messages]
 *     parameters:
 *       - in: path
 *         name: uuid
 *         required: true
 *         schema:
 *           type: string
 *         description: Conversation UUID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateMessageRequest'
 *     responses:
 *       200:
 *         description: User message created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageResponse'
 *       400:
 *         description: Bad request
 *       404:
 *         description: Conversation not found
 *       500:
 *         description: Internal server error
 */
app.post('/api/conversations/:uuid/messages', (req, res) => chatController.createUserMessage(req, res));

/**
 * @swagger
 * /api/messages/{uuid}/generate:
 *   post:
 *     summary: Generate AI response for user message
 *     description: Generate AI assistant response to a user message
 *     tags: [Messages]
 *     parameters:
 *       - in: path
 *         name: uuid
 *         required: true
 *         schema:
 *           type: string
 *         description: User message UUID
 *     responses:
 *       200:
 *         description: AI response generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageResponse'
 *       404:
 *         description: Message not found
 *       500:
 *         description: Internal server error
 */
app.post('/api/messages/:uuid/generate', (req, res) => chatController.generateResponse(req, res));

/**
 * @swagger
 * /api/users/{uuid}/conversations:
 *   get:
 *     summary: Get user's conversations
 *     description: Retrieve all conversations for a specific user
 *     tags: [Conversations]
 *     parameters:
 *       - in: path
 *         name: uuid
 *         required: true
 *         schema:
 *           type: string
 *         description: User UUID
 *       - in: query
 *         name: company_uuid
 *         schema:
 *           type: string
 *         description: Optional company UUID filter
 *     responses:
 *       200:
 *         description: List of user conversations
 *       500:
 *         description: Internal server error
 */
app.get('/api/users/:uuid/conversations', (req, res) => chatController.getUserConversations(req, res));

/**
 * @swagger
 * /api/feedback:
 *   post:
 *     summary: Submit message feedback
 *     description: Submit rating and feedback for an AI response
 *     tags: [Messages]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/FeedbackRequest'
 *     responses:
 *       200:
 *         description: Feedback submitted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FeedbackResponse'
 *       400:
 *         description: Missing required fields
 *       500:
 *         description: Internal server error
 */
app.post('/api/feedback', (req, res) => chatController.submitFeedback(req, res));

// ============================================================================
// KNOWLEDGE BASE APIS (Unified Items)
// ============================================================================

/**
 * @swagger
 * /api/knowledge/items:
 *   post:
 *     summary: Create knowledge item
 *     description: Create a new knowledge item (folder, document, file, url, etc.)
 *     tags: [Knowledge]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateKnowledgeItemRequest'
 *     responses:
 *       200:
 *         description: Knowledge item created successfully
 *       400:
 *         description: Bad request
 *       500:
 *         description: Internal server error
 */
app.post('/api/knowledge/items', (req, res) => knowledgeController.createItem(req, res));

/**
 * @swagger
 * /api/knowledge/items:
 *   get:
 *     summary: List knowledge items
 *     description: Get list of knowledge items with optional filtering and pagination
 *     tags: [Knowledge]
 *     parameters:
 *       - in: query
 *         name: parent_uuid
 *         schema:
 *           type: string
 *         description: Filter by parent UUID
 *       - in: query
 *         name: company_uuid
 *         schema:
 *           type: integer
 *         description: Filter by company UUID
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *         description: Filter by item type
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Maximum number of items to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of items to skip
 *     responses:
 *       200:
 *         description: List of knowledge items
 *       500:
 *         description: Internal server error
 */
app.get('/api/knowledge/items', (req, res) => knowledgeController.listItems(req, res));

/**
 * @swagger
 * /api/knowledge/search:
 *   post:
 *     summary: Search knowledge items
 *     description: Search through knowledge items using semantic or keyword search
 *     tags: [Knowledge]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/KnowledgeSearchRequest'
 *     responses:
 *       200:
 *         description: Search results
 *       400:
 *         description: Bad request
 *       500:
 *         description: Internal server error
 */
app.post('/api/knowledge/search', (req, res) => knowledgeController.search(req, res));

/**
 * @swagger
 * /api/search:
 *   post:
 *     summary: RAG Search
 *     description: Perform RAG (Retrieval-Augmented Generation) search that combines knowledge base search with AI response generation
 *     tags: [Search]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RAGSearchRequest'
 *     responses:
 *       200:
 *         description: RAG search response
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RAGSearchResponse'
 *       400:
 *         description: Bad request
 *       500:
 *         description: Internal server error
 */
app.post('/api/search', (req, res) => knowledgeController.ragSearch(req, res));

/**
 * @swagger
 * /api/knowledge/items/{uuid}:
 *   get:
 *     summary: Get knowledge item
 *     description: Retrieve a specific knowledge item by UUID
 *     tags: [Knowledge]
 *     parameters:
 *       - in: path
 *         name: uuid
 *         required: true
 *         schema:
 *           type: string
 *         description: Knowledge item UUID
 *     responses:
 *       200:
 *         description: Knowledge item details
 *       404:
 *         description: Knowledge item not found
 *       500:
 *         description: Internal server error
 */
app.get('/api/knowledge/items/:uuid', (req, res) => knowledgeController.getItem(req, res));

/**
 * @swagger
 * /api/knowledge/items/{uuid}:
 *   put:
 *     summary: Update knowledge item
 *     description: Update an existing knowledge item
 *     tags: [Knowledge]
 *     parameters:
 *       - in: path
 *         name: uuid
 *         required: true
 *         schema:
 *           type: string
 *         description: Knowledge item UUID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateKnowledgeItemRequest'
 *     responses:
 *       200:
 *         description: Knowledge item updated successfully
 *       404:
 *         description: Knowledge item not found
 *       500:
 *         description: Internal server error
 */
app.put('/api/knowledge/items/:uuid', (req, res) => knowledgeController.updateItem(req, res));

/**
 * @swagger
 * /api/knowledge/items/{uuid}:
 *   delete:
 *     summary: Delete knowledge item
 *     description: Remove a knowledge item from the knowledge base
 *     tags: [Knowledge]
 *     parameters:
 *       - in: path
 *         name: uuid
 *         required: true
 *         schema:
 *           type: string
 *         description: Knowledge item UUID
 *     responses:
 *       200:
 *         description: Knowledge item deleted successfully
 *       404:
 *         description: Knowledge item not found
 *       500:
 *         description: Internal server error
 */
app.delete('/api/knowledge/items/:uuid', (req, res) => knowledgeController.deleteItem(req, res));

// ============================================================================
// MIGRATION ENDPOINTS
// ============================================================================

/**
 * @swagger
 * /api/migrate:
 *   get:
 *     summary: Run database migrations
 *     description: Executes pending database migrations with API key authentication
 *     tags: [System]
 *     parameters:
 *       - in: query
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *         description: Migration API key
 *     responses:
 *       200:
 *         description: Migrations completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 currentVersion:
 *                   type: string
 *                 details:
 *                   type: object
 *       400:
 *         description: Bad request (missing API key or environment variables)
 *       401:
 *         description: Unauthorized (invalid API key)
 *       500:
 *         description: Internal server error
 */
app.get('/api/migrate', asyncHandler(async (req: any, res: any) => {
  const { MigrationService } = await import('./services/MigrationService');
  
  const apiKey = req.query.key as string || req.headers['x-migration-key'] as string;
  
  if (!apiKey) {
    return res.status(400).json({
      success: false,
      message: 'Migration API key is required',
      error: 'MISSING_API_KEY',
      details: {
        usage: 'Add ?key=your-secret-key to the URL or x-migration-key header'
      }
    });
  }

  const result = await MigrationService.runMigrations(apiKey);
  
  const statusCode = result.success ? 200 : 
    result.error === 'UNAUTHORIZED' ? 401 :
    result.error === 'MISSING_ENV_VARS' || result.error === 'DATABASE_CONNECTION_FAILED' ? 400 : 500;
  
  res.status(statusCode).json(result);
}));

/**
 * @swagger
 * /api/migrate/status:
 *   get:
 *     summary: Get migration status
 *     description: Check current migration status without running migrations
 *     tags: [System]
 *     parameters:
 *       - in: query
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *         description: Migration API key
 *     responses:
 *       200:
 *         description: Migration status retrieved
 *       401:
 *         description: Unauthorized (invalid API key)
 *       500:
 *         description: Internal server error
 */
app.get('/api/migrate/status', asyncHandler(async (req: any, res: any) => {
  const { MigrationService } = await import('./services/MigrationService');
  
  const apiKey = req.query.key as string || req.headers['x-migration-key'] as string;
  
  if (!apiKey) {
    return res.status(400).json({
      success: false,
      message: 'Migration API key is required',
      error: 'MISSING_API_KEY'
    });
  }

  const result = await MigrationService.getStatus(apiKey);
  
  const statusCode = result.success ? 200 : 
    result.error === 'UNAUTHORIZED' ? 401 : 500;
  
  res.status(statusCode).json(result);
}));

// ============================================================================
// WEBSOCKET HANDLING
// ============================================================================

// WebSocket handling
io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`);

  socket.on('join-conversation', (conversationId) => {
    socket.join(`conversation:${conversationId}`);
    logger.info(`Socket ${socket.id} joined conversation ${conversationId}`);
  });

  socket.on('message', async (data) => {
    try {
      const { message, conversation_id, context } = data;
      const response = await chatManager.sendMessage(message, conversation_id, context);

      socket.emit('response', {
        message: response.content,
        conversation_id: response.conversationId,
        message_id: response.messageId,
        feedback_detection: response.feedbackDetection,
        suggested_links: response.suggestedLinks
      });

      // Broadcast to all clients in the conversation
      if (response.conversationId) {
        io.to(`conversation:${response.conversationId}`).emit('new-message', {
          role: 'assistant',
          content: response.content,
          timestamp: new Date()
        });
      }

    } catch (error) {
      socket.emit('error', { 
        message: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });

  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`);
  });
});

// Error handling middleware
// Global error handling middleware
app.use(errorHandler);

// 404 handler for undefined routes
app.use(notFoundHandler);

// Start server
const PORT = globalConfig.app.port;

async function start() {
  try {
    // Validate configuration
    validateConfig();

    await initializeServices();

    server.listen(PORT, '0.0.0.0', () => {
      logger.info(`🚀 ${globalConfig.app.name} v${globalConfig.app.version} running on port ${PORT}`);
      logger.info(`📊 Environment: ${globalConfig.app.environment}`);
      logger.info(`🌐 API available at http://localhost:${PORT}${globalConfig.api.prefix}`);
      if (globalConfig.swagger.enabled) {
        logger.info(`📚 API Documentation: http://localhost:${PORT}${globalConfig.swagger.path}`);
      }
      logger.info(`🔌 WebSocket available at ws://localhost:${PORT}`);
      logger.info(`💓 Health check: http://localhost:${PORT}/health`);
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');
  
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

// Start the server
start();
