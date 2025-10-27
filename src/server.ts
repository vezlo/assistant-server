import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import swaggerUi from 'swagger-ui-express';
import { specs, swaggerUiOptions } from './config/swagger';
import { config as globalConfig } from './config/global';
import logger from './config/logger';
import { errorHandler, notFoundHandler, asyncHandler } from './middleware/errorHandler';
import { authenticateUser, authenticateApiKey } from './middleware/auth';
import { ChatController } from './controllers/ChatController';
import { KnowledgeController } from './controllers/KnowledgeController';
import { AuthController } from './controllers/AuthController';
import { ChatManager } from './services/ChatManager';
import { KnowledgeBaseService } from './services/KnowledgeBaseService';
import { AIService } from './services/AIService';
import { UnifiedStorage } from './storage/UnifiedStorage';
import { runMigrations, getMigrationStatus } from './config/knex';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

// Initialize Express app
const app = express();
const server = createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGINS?.split(',') || '*',
  credentials: true
}));
app.use(compression());
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

// Redirect root to docs
app.get('/', (req, res) => {
  res.redirect('/docs');
});

// API Documentation
app.use('/docs', swaggerUi.serve, swaggerUi.setup(specs, swaggerUiOptions));

// Initialize services
let chatController: ChatController;
let knowledgeController: KnowledgeController;
let authController: AuthController;

async function initializeServices() {
  try {
    logger.info('Initializing Vezlo services...');

    // Initialize storage
    const storage = new UnifiedStorage(supabase, 'vezlo');

    // Initialize services
    const aiService = new AIService({
      openaiApiKey: process.env.OPENAI_API_KEY!,
      organizationName: process.env.ORGANIZATION_NAME || 'Vezlo',
      assistantName: process.env.ASSISTANT_NAME || 'AI Assistant',
      platformDescription: process.env.PLATFORM_DESCRIPTION || 'AI-powered assistant platform',
      supportEmail: process.env.SUPPORT_EMAIL || 'support@vezlo.com'
    });
    const chatManager = new ChatManager({ aiService, storage });
    const knowledgeBase = new KnowledgeBaseService({ 
      supabase, 
      tableName: 'vezlo_knowledge_items' 
    });

    // Initialize controllers
    chatController = new ChatController(chatManager, storage);
    knowledgeController = new KnowledgeController(knowledgeBase, aiService);
    authController = new AuthController(supabase);

    logger.info('All services initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize services:', error);
    throw error;
  }
}

// Setup routes function
function setupRoutes() {
  logger.info('Setting up routes...');
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
        const { data, error } = await supabase.from('vezlo_conversations').select('count').limit(1);
        healthChecks.database = error ? 'disconnected' : 'connected';
      } catch (dbError) {
        healthChecks.database = 'error';
      }

      res.json(healthChecks);
    } catch (error) {
      res.status(503).json({
        server: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * @swagger
   * /api/auth/login:
 *   post:
 *     summary: User login
 *     description: Authenticate user and return access token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginResponse'
 *       401:
 *         description: Invalid credentials
 *       500:
 *         description: Internal server error
 */
app.post('/api/auth/login', (req, res) => authController.login(req, res));

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: User logout
 *     description: Logout user and invalidate tokens
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logout successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LogoutResponse'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Internal server error
 */
app.post('/api/auth/logout', authenticateUser(supabase), (req, res) => authController.logout(req, res));

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Get current user info
 *     description: Get current authenticated user information
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User information retrieved
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MeResponse'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Internal server error
 */
app.get('/api/auth/me', authenticateUser(supabase), (req, res) => authController.getMe(req, res));

// Chat API Routes
/**
 * @swagger
 * /api/conversations:
 *   post:
 *     summary: Create a new conversation
 *     description: Create a new conversation for the authenticated user
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateConversationRequest'
 *     responses:
 *       201:
 *         description: Conversation created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CreateConversationResponse'
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Internal server error
 */
app.post('/api/conversations', authenticateUser(supabase), (req, res) => chatController.createConversation(req, res));

/**
 * @swagger
 * /api/conversations/{uuid}:
 *   get:
 *     summary: Get conversation by UUID
 *     description: Retrieve a specific conversation by its UUID
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: uuid
 *         required: true
 *         schema:
 *           type: string
 *         description: Conversation UUID
 *     responses:
 *       200:
 *         description: Conversation retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GetConversationResponse'
 *       404:
 *         description: Conversation not found
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Internal server error
 */
app.get('/api/conversations/:uuid', authenticateUser(supabase), (req, res) => chatController.getConversation(req, res));

/**
 * @swagger
 * /api/conversations/{uuid}:
 *   delete:
 *     summary: Delete conversation
 *     description: Delete a specific conversation by its UUID
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
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
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Internal server error
 */
app.delete('/api/conversations/:uuid', authenticateUser(supabase), (req, res) => chatController.deleteConversation(req, res));

/**
 * @swagger
 * /api/conversations/{uuid}/messages:
 *   post:
 *     summary: Send a message
 *     description: Send a user message to a conversation
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
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
 *       201:
 *         description: Message sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SendMessageResponse'
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Conversation not found
 *       500:
 *         description: Internal server error
 */
app.post('/api/conversations/:uuid/messages', authenticateUser(supabase), (req, res) => chatController.createUserMessage(req, res));

/**
 * @swagger
 * /api/messages/{uuid}/generate:
 *   post:
 *     summary: Generate AI response
 *     description: Generate an AI response for a specific message
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: uuid
 *         required: true
 *         schema:
 *           type: string
 *         description: Message UUID
 *     responses:
 *       200:
 *         description: AI response generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GenerateResponseResponse'
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Message not found
 *       500:
 *         description: Internal server error
 */
app.post('/api/messages/:uuid/generate', authenticateUser(supabase), (req, res) => chatController.generateResponse(req, res));

/**
 * @swagger
 * /api/conversations:
 *   get:
 *     summary: Get user conversations
 *     description: Get all conversations for the authenticated user
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Conversations retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ConversationListResponse'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Internal server error
 */
app.get('/api/conversations', authenticateUser(supabase), (req, res) => chatController.getUserConversations(req, res));

/**
 * @swagger
 * /api/feedback:
 *   post:
 *     summary: Submit message feedback
 *     description: Submit feedback for a specific message
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
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
 *               $ref: '#/components/schemas/SubmitFeedbackResponse'
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Internal server error
 */
app.post('/api/feedback', authenticateUser(supabase), (req, res) => chatController.submitFeedback(req, res));

// Knowledge Base API Routes
/**
 * @swagger
 * /api/knowledge/items:
 *   post:
 *     summary: Create knowledge item
 *     description: Create a new knowledge base item
 *     tags: [Knowledge Base]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateKnowledgeItemRequest'
 *     responses:
 *       201:
 *         description: Knowledge item created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CreateKnowledgeItemResponse'
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Internal server error
 */
app.post('/api/knowledge/items', authenticateUser(supabase), (req, res) => knowledgeController.createItem(req, res));

/**
 * @swagger
 * /api/knowledge/items:
 *   get:
 *     summary: List knowledge items
 *     description: Get all knowledge base items for the authenticated user's company
 *     tags: [Knowledge Base]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Maximum number of items to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of items to skip
 *     responses:
 *       200:
 *         description: Knowledge items retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/KnowledgeItemListResponse'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Internal server error
 */
app.get('/api/knowledge/items', authenticateUser(supabase), (req, res) => knowledgeController.listItems(req, res));

/**
 * @swagger
 * /api/knowledge/search:
 *   post:
 *     summary: Search knowledge base
 *     description: Search the knowledge base for relevant items
 *     tags: [Search]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/KnowledgeSearchRequest'
 *     responses:
 *       200:
 *         description: Search completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SearchKnowledgeResponse'
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Internal server error
 */
app.post('/api/knowledge/search', authenticateUser(supabase), (req, res) => knowledgeController.search(req, res));

/**
 * @swagger
 * /api/search:
 *   post:
 *     summary: RAG search
 *     description: Perform Retrieval-Augmented Generation search
 *     tags: [Search]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RAGSearchRequest'
 *     responses:
 *       200:
 *         description: RAG search completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RAGSearchResponse'
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Internal server error
 */
app.post('/api/search', authenticateUser(supabase), (req, res) => knowledgeController.ragSearch(req, res));

/**
 * @swagger
 * /api/knowledge/items/{uuid}:
 *   get:
 *     summary: Get knowledge item
 *     description: Get a specific knowledge base item by UUID
 *     tags: [Knowledge Base]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: uuid
 *         required: true
 *         schema:
 *           type: string
 *         description: Knowledge item UUID
 *     responses:
 *       200:
 *         description: Knowledge item retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GetKnowledgeItemResponse'
 *       404:
 *         description: Knowledge item not found
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Internal server error
 */
app.get('/api/knowledge/items/:uuid', authenticateUser(supabase), (req, res) => knowledgeController.getItem(req, res));

/**
 * @swagger
 * /api/knowledge/items/{uuid}:
 *   put:
 *     summary: Update knowledge item
 *     description: Update a specific knowledge base item
 *     tags: [Knowledge Base]
 *     security:
 *       - bearerAuth: []
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
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UpdateKnowledgeItemResponse'
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Knowledge item not found
 *       500:
 *         description: Internal server error
 */
app.put('/api/knowledge/items/:uuid', authenticateUser(supabase), (req, res) => knowledgeController.updateItem(req, res));

/**
 * @swagger
 * /api/knowledge/items/{uuid}:
 *   delete:
 *     summary: Delete knowledge item
 *     description: Delete a specific knowledge base item
 *     tags: [Knowledge Base]
 *     security:
 *       - bearerAuth: []
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
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Internal server error
 */
  app.delete('/api/knowledge/items/:uuid', authenticateUser(supabase), (req, res) => knowledgeController.deleteItem(req, res));

  // ============================================================================
  // MIGRATION ENDPOINTS
  // ============================================================================

  /**
   * @swagger
   * /api/migrate:
   *   get:
   *     summary: Run database migrations
   *     description: Run pending database migrations
   *     tags: [System]
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
   *                 migrations:
   *                   type: array
   *                   items:
   *                     type: string
   *       500:
   *         description: Migration failed
   */
  app.get('/api/migrate', asyncHandler(async (req: any, res: any) => {
    const result = await runMigrations();
    
    res.json({
      success: true,
      message: 'Migrations completed successfully',
      migrations: result
    });
  }));

  /**
   * @swagger
   * /api/migrate/status:
   *   get:
   *     summary: Get migration status
   *     description: Get the current status of database migrations
   *     tags: [System]
   *     responses:
   *       200:
   *         description: Migration status retrieved
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 status:
   *                   type: string
   *                 lastMigration:
   *                   type: string
   *       500:
   *         description: Failed to get migration status
   */
  app.get('/api/migrate/status', asyncHandler(async (req: any, res: any) => {
    const lastMigration = await getMigrationStatus();
    
    res.json({
      success: true,
      status: 'completed',
      lastMigration: lastMigration.toString()
    });
  }));

  // Error handling middleware (must be after all routes)
  app.use(errorHandler);
  app.use(notFoundHandler);
  
  logger.info('Routes setup completed');
}

// WebSocket connection handling
io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`);

  socket.on('join_conversation', (conversationId) => {
    socket.join(`conversation_${conversationId}`);
    logger.info(`Client ${socket.id} joined conversation ${conversationId}`);
  });

  socket.on('leave_conversation', (conversationId) => {
    socket.leave(`conversation_${conversationId}`);
    logger.info(`Client ${socket.id} left conversation ${conversationId}`);
  });

  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`);
  });
});

// Start server
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3002;

async function start() {
  try {
    // Validate configuration
    validateConfig();

    await initializeServices();
    
    // Setup routes after services are initialized
    setupRoutes();

    server.listen(PORT, '0.0.0.0', () => {
      logger.info(`🚀 AI Assistant API v1.0.0 running on port ${PORT}`);
      logger.info(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`🌐 API available at http://localhost:${PORT}/api`);
      logger.info(`📚 API Documentation: http://localhost:${PORT}/docs`);
      logger.info(`🔌 WebSocket available at ws://localhost:${PORT}`);
      logger.info(`💓 Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

function validateConfig() {
  const requiredEnvVars = [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'OPENAI_API_KEY'
  ];

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

// Start the server
start();