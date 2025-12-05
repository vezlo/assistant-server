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
import { authenticateUser, authenticateApiKey, authenticateUserOrApiKey, AuthenticatedRequest } from './middleware/auth';
import { ChatController } from './controllers/ChatController';
import { KnowledgeController } from './controllers/KnowledgeController';
import { AuthController } from './controllers/AuthController';
import { ApiKeyController } from './controllers/ApiKeyController';
import { runMigrations, getMigrationStatus } from './config/knex';
import { createClient } from '@supabase/supabase-js';
import { initializeCoreServices } from './bootstrap/initializeServices';
import { RealtimePublisher } from './services/RealtimePublisher';

// Initialize Supabase client - use SERVICE_KEY for server-side operations
// Service key bypasses RLS and is required for API key authentication
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY!;
const supabaseUrl = process.env.SUPABASE_URL!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);
const realtimePublisher = new RealtimePublisher(supabaseUrl, supabaseServiceKey);

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
  origin: globalConfig.cors.origins.length ? globalConfig.cors.origins : true,
  credentials: globalConfig.cors.credentials
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
let apiKeyController: ApiKeyController;

async function initializeServices() {
  try {
    logger.info('Initializing Vezlo services...');

    const { controllers } = initializeCoreServices({
      supabase,
      tablePrefix: 'vezlo',
      knowledgeTableName: 'vezlo_knowledge_items'
    });

    chatController = controllers.chatController;
    knowledgeController = controllers.knowledgeController;
    authController = controllers.authController;
    authController.setRealtimePublisher(realtimePublisher);
    apiKeyController = controllers.apiKeyController;

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

// API Key Management Routes
/**
 * @swagger
 * /api/api-keys:
 *   post:
 *     summary: Generate or update API key
 *     description: Generate or update API key for the authenticated user's company. Only admins can generate API keys.
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: API key generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 uuid:
 *                   type: string
 *                 api_key:
 *                   type: string
 *                 message:
 *                   type: string
 *       403:
 *         description: Only admins can generate API keys
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Internal server error
 */
app.post('/api/api-keys', authenticateUser(supabase), (req, res) => apiKeyController.generateApiKey(req, res));

/**
 * @swagger
 * /api/api-keys/status:
 *   get:
 *     summary: Get API key status
 *     description: Check if API key exists for the authenticated user's company
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: API key status retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 exists:
 *                   type: boolean
 *                 uuid:
 *                   type: string
 *                 message:
 *                   type: string
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Internal server error
 */
app.get('/api/api-keys/status', authenticateUser(supabase), (req, res) => apiKeyController.getApiKeyStatus(req, res));

// Chat API Routes
/**
 * @swagger
 * /api/conversations:
 *   get:
 *     summary: List conversations
 *     description: Returns paginated conversations for the authenticated workspace.
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number (1-indexed)
 *       - in: query
 *         name: page_size
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of conversations per page (max 100)
 *       - in: query
 *         name: order_by
 *         schema:
 *           type: string
 *           enum: [last_message_at, created_at]
 *           default: last_message_at
 *         description: Sort conversations by latest activity or creation time (always descending)
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
app.get('/api/conversations', authenticateUser(supabase), (req, res) =>
  chatController.getUserConversations(req as AuthenticatedRequest, res)
);

/**
 * @swagger
 * /api/conversations:
 *   post:
 *     summary: Create a new conversation
 *     description: Create a new conversation (Public API - No authentication required)
 *     tags: [Chat]
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
 *       500:
 *         description: Internal server error
 */
app.post('/api/conversations', (req, res) => chatController.createConversation(req, res));

/**
 * @swagger
 * /api/conversations/{uuid}:
 *   get:
 *     summary: Get conversation by UUID
 *     description: Retrieve a specific conversation (requires authentication and workspace membership).
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
app.get('/api/conversations/:uuid', authenticateUser(supabase), (req, res) =>
  chatController.getConversation(req as AuthenticatedRequest, res)
);

/**
 * @swagger
 * /api/conversations/{uuid}/messages:
 *   get:
 *     summary: List conversation messages
 *     description: Retrieve paginated messages for a conversation.
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
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Message page number (1-indexed)
 *       - in: query
 *         name: page_size
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Messages per page (max 200)
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order by creation time (descending shows newest first)
 *     responses:
 *       200:
 *         description: Messages retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ConversationMessagesResponse'
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Conversation not found
 *       500:
 *         description: Internal server error
 */
app.get('/api/conversations/:uuid/messages', authenticateUser(supabase), (req, res) =>
  chatController.getConversationMessages(req as AuthenticatedRequest, res)
);

/**
 * @swagger
 * /api/conversations/{uuid}/join:
 *   post:
 *     summary: Join conversation
 *     description: Agent joins a conversation, sets joined_at timestamp, creates a system message, and publishes realtime update
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
 *         description: Successfully joined conversation
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: object
 *                   properties:
 *                     uuid:
 *                       type: string
 *                     content:
 *                       type: string
 *                     type:
 *                       type: string
 *                     author_id:
 *                       type: integer
 *                     created_at:
 *                       type: string
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Conversation not found
 *       500:
 *         description: Internal server error
 */
app.post('/api/conversations/:uuid/join', authenticateUser(supabase), (req, res) =>
  chatController.joinConversation(req as AuthenticatedRequest, res)
);

/**
 * @swagger
 * /api/conversations/{uuid}/messages/agent:
 *   post:
 *     summary: Send agent message
 *     description: Agent sends a message in a conversation and publishes realtime update
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
 *             type: object
 *             required:
 *               - content
 *             properties:
 *               content:
 *                 type: string
 *     responses:
 *       200:
 *         description: Agent message sent successfully
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Conversation not found
 *       500:
 *         description: Internal server error
 */
app.post('/api/conversations/:uuid/messages/agent', authenticateUser(supabase), (req, res) =>
  (chatController as any).sendAgentMessage(req as AuthenticatedRequest, res)
);

/**
 * @swagger
 * /api/conversations/{uuid}/close:
 *   post:
 *     summary: Close conversation
 *     description: Close a conversation, record a system message, and publish realtime update
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
 *         description: Conversation closed successfully
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Conversation not found
 *       500:
 *         description: Internal server error
 */
app.post('/api/conversations/:uuid/close', authenticateUser(supabase), (req, res) =>
  (chatController as any).closeConversation(req as AuthenticatedRequest, res)
);

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
 *     description: Send a user message to a conversation (Public API - No authentication required)
 *     tags: [Chat]
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
 *     summary: Generate AI response
 *     description: Generate an AI response for a specific message (Public API - No authentication required)
 *     tags: [Chat]
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
 *       404:
 *         description: Message not found
 *       500:
 *         description: Internal server error
 */
app.post('/api/messages/:uuid/generate', (req, res) => chatController.generateResponse(req, res));

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
 *     description: Create a new knowledge base item. Can be authenticated with Bearer token or X-API-Key header.
 *     tags: [Knowledge Base]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
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
app.post('/api/knowledge/items', authenticateUserOrApiKey(supabase), (req, res) => knowledgeController.createItem(req, res));

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
 *     description: Search the knowledge base for relevant items. Can be authenticated with Bearer token or X-API-Key header.
 *     tags: [Search]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
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
app.post('/api/knowledge/search', authenticateUserOrApiKey(supabase), (req, res) => knowledgeController.search(req, res));

/**
 * @swagger
 * /api/search:
 *   post:
 *     summary: RAG search
 *     description: Perform Retrieval-Augmented Generation search. Can be authenticated with Bearer token or X-API-Key header.
 *     tags: [Search]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
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
app.post('/api/search', authenticateUserOrApiKey(supabase), (req, res) => knowledgeController.ragSearch(req, res));

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
   *     description: Run pending database migrations. Requires migration secret key.
   *     tags: [System]
   *     parameters:
   *       - in: query
   *         name: key
   *         required: true
   *         schema:
   *           type: string
   *         description: Migration secret key from MIGRATION_SECRET_KEY environment variable
   *     security:
   *       - migrationKey: []
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
   *                   example: true
   *                 message:
   *                   type: string
   *                   example: "Migrations completed successfully"
   *                 currentVersion:
   *                   type: string
   *                   example: "002_multitenancy_schema.ts"
   *                 previousVersion:
   *                   type: string
   *                   example: "001_initial_schema.ts"
   *                 details:
   *                   type: object
   *                   properties:
   *                     timestamp:
   *                       type: string
   *                       format: date-time
   *       400:
   *         description: Missing API key or invalid configuration
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: false
   *                 message:
   *                   type: string
   *                   example: "Migration API key is required"
   *                 error:
   *                   type: string
   *                   example: "MISSING_API_KEY"
   *       401:
   *         description: Unauthorized - Invalid migration key
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: false
   *                 message:
   *                   type: string
   *                   example: "Invalid or missing migration API key"
   *                 error:
   *                   type: string
   *                   example: "UNAUTHORIZED"
   *       500:
   *         description: Migration failed
   */
  app.get('/api/migrate', asyncHandler(async (req: any, res: any) => {
    const apiKey = req.query.key || req.headers['x-migration-key'];

    // Import MigrationService to use the proper validation
    const { MigrationService } = await import('./services/MigrationService');
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
   *     description: Get the current status of database migrations. Requires migration secret key.
   *     tags: [System]
   *     parameters:
   *       - in: query
   *         name: key
   *         required: true
   *         schema:
   *           type: string
   *         description: Migration secret key from MIGRATION_SECRET_KEY environment variable
   *     security:
   *       - migrationKey: []
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
   *                   example: true
   *                 status:
   *                   type: string
   *                   example: "completed"
   *                 data:
   *                   type: object
   *                   properties:
   *                     currentVersion:
   *                       type: string
   *                       example: "002_multitenancy_schema.ts"
   *                     timestamp:
   *                       type: string
   *                       format: date-time
   *       400:
   *         description: Missing API key
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: false
   *                 message:
   *                   type: string
   *                   example: "Migration API key is required"
   *                 error:
   *                   type: string
   *                   example: "MISSING_API_KEY"
   *       401:
   *         description: Unauthorized - Invalid migration key
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: false
   *                 message:
   *                   type: string
   *                   example: "Invalid or missing migration API key"
   *                 error:
   *                   type: string
   *                   example: "UNAUTHORIZED"
   *       500:
   *         description: Failed to get migration status
   */
  app.get('/api/migrate/status', asyncHandler(async (req: any, res: any) => {
    const apiKey = req.query.key || req.headers['x-migration-key'];

    // Import MigrationService to use the proper validation
    const { MigrationService } = await import('./services/MigrationService');
    const result = await MigrationService.getStatus(apiKey);

    const statusCode = result.success ? 200 :
      result.error === 'UNAUTHORIZED' ? 401 : 500;

    res.status(statusCode).json(result);
  }));

  /**
   * @swagger
   * /api/seed-default:
   *   post:
   *     summary: Seed default data
   *     description: Creates default company and admin user for initial setup. Uses environment variables for configuration. Returns existing data if already created.
   *     tags: [System]
   *     parameters:
   *       - in: query
   *         name: key
   *         required: true
   *         schema:
   *           type: string
   *         description: Migration secret key from MIGRATION_SECRET_KEY environment variable
   *     security:
   *       - migrationKey: []
   *     responses:
   *       200:
   *         description: Default data seeded successfully or already exists
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 company_name:
   *                   type: string
   *                   example: "Vezlo"
   *                 email:
   *                   type: string
   *                   example: "admin@vezlo.org"
   *                 password:
   *                   type: string
   *                   example: "admin123"
   *                 admin_name:
   *                   type: string
   *                   example: "Default Admin"
   *       400:
   *         description: Missing API key or invalid request
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: false
   *                 message:
   *                   type: string
   *                 error:
   *                   type: string
   *       401:
   *         description: Unauthorized - Invalid migration key
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: false
   *                 message:
   *                   type: string
   *                   example: "Invalid or missing migration API key"
   *                 error:
   *                   type: string
   *                   example: "UNAUTHORIZED"
   *       500:
   *         description: Failed to seed default data
   */
  app.post('/api/seed-default', asyncHandler(async (req: any, res: any) => {
    // Extract API key from query or header
    const apiKey = req.query.key || req.headers['x-migration-key'];

    try {
      // Validate API key
      const { MigrationService } = await import('./services/MigrationService');
      const keyValid = MigrationService.validateApiKey(apiKey);
      
      if (!keyValid) {
        res.status(401).json({
          success: false,
          message: 'Invalid or missing migration API key',
          error: 'UNAUTHORIZED'
        });
        return;
      }

      // Initialize Supabase
      const supabase = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!
      );

      // Execute seed using SetupService
      const { SetupService } = await import('./services/SetupService');
      const setupService = new SetupService(supabase);
      const response = await setupService.executeSeedDefault();

      res.status(200).json(response);

    } catch (error: any) {
      logger.error('Seed default failed:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to seed default data',
        error: error.message || 'SEED_DEFAULT_FAILED',
        details: {
          error: error.message
        }
      });
    }
  }));

  /**
   * @swagger
   * /api/generate-key:
   *   post:
   *     summary: Generate API key for the default admin
   *     description: Generates an API key for the default admin user's company
   *     tags: [System]
   *     security:
   *       - migrationKey: []
   *     parameters:
   *       - in: query
   *         name: key
   *         description: Migration secret key
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: API key generated successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 message:
   *                   type: string
   *                   example: "API key generated successfully"
   *                 api_key_details:
   *                   type: object
   *                   properties:
   *                     company_name:
   *                       type: string
   *                       example: "Vezlo"
   *                     user_name:
   *                       type: string
   *                       example: "Admin User"
   *                     api_key:
   *                       type: string
   *                       example: "v.bzkO2h7Ga.c5MGe0zX-2CU-IeZPqreT6xSRCgq3Tw"
   *       401:
   *         description: Unauthorized
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: false
   *                 message:
   *                   type: string
   *                   example: "Invalid or missing migration API key"
   *                 error:
   *                   type: string
   *                   example: "UNAUTHORIZED"
   *       500:
   *         description: Failed to generate API key
   */
  app.post('/api/generate-key', asyncHandler(async (req: any, res: any) => {
    // Extract API key from query or header
    const apiKey = req.query.key || req.headers['x-migration-key'];

    try {
      // Validate API key
      const { MigrationService } = await import('./services/MigrationService');
      const keyValid = MigrationService.validateApiKey(apiKey);
      
      if (!keyValid) {
        res.status(401).json({
          success: false,
          message: 'Invalid or missing migration API key',
          error: 'UNAUTHORIZED'
        });
        return;
      }

      // Initialize Supabase
      const supabase = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!
      );

      // Execute generate-key using SetupService
      const { SetupService } = await import('./services/SetupService');
      const setupService = new SetupService(supabase);
      const response = await setupService.executeGenerateKey();

      res.status(200).json({
        success: true,
        message: 'API key generated successfully',
        api_key_details: response
      });

    } catch (error: any) {
      logger.error('Generate key failed:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate API key',
        error: error.message || 'GENERATE_KEY_FAILED',
        details: {
          error: error.message
        }
      });
    }
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

    // Set server timeout from global config (60 seconds)
    server.timeout = globalConfig.api.timeout;
    logger.info(`⏱️  Server timeout set to ${globalConfig.api.timeout / 1000}s`);

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
    'SUPABASE_SERVICE_KEY',
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