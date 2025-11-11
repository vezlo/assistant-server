import { SupabaseClient } from '@supabase/supabase-js';
import logger from '../config/logger';
import { UnifiedStorage } from '../storage/UnifiedStorage';
import { KnowledgeBaseService } from '../services/KnowledgeBaseService';
import { AIService } from '../services/AIService';
import { ChatManager } from '../services/ChatManager';
import { ChatController } from '../controllers/ChatController';
import { KnowledgeController } from '../controllers/KnowledgeController';
import { AuthController } from '../controllers/AuthController';
import { ApiKeyService } from '../services/ApiKeyService';
import { ApiKeyController } from '../controllers/ApiKeyController';
import { IntentService } from '../services/IntentService';

export interface ServiceInitOptions {
  supabase: SupabaseClient;
  tablePrefix?: string;
  knowledgeTableName?: string;
  chatHistoryLength?: number;
  conversationTimeout?: number;
}

export interface InitializedCoreServices {
  services: {
    storage: UnifiedStorage;
    knowledgeBase: KnowledgeBaseService;
    aiService: AIService;
    chatManager: ChatManager;
    apiKeyService: ApiKeyService;
  };
  controllers: {
    chatController: ChatController;
    knowledgeController: KnowledgeController;
    authController: AuthController;
    apiKeyController: ApiKeyController;
  };
  config: {
    chatHistoryLength: number;
  };
}

const DEFAULT_CHAT_HISTORY_LENGTH = 2;
const DEFAULT_CONVERSATION_TIMEOUT = 3600000; // 1 hour

export function getChatHistoryLength(): number {
  const rawValue = process.env.CHAT_HISTORY_LENGTH;
  if (!rawValue) {
    return DEFAULT_CHAT_HISTORY_LENGTH;
  }

  const parsed = parseInt(rawValue, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    logger.warn(`Invalid CHAT_HISTORY_LENGTH value "${rawValue}", falling back to ${DEFAULT_CHAT_HISTORY_LENGTH}`);
    return DEFAULT_CHAT_HISTORY_LENGTH;
  }

  return parsed;
}

export function initializeCoreServices(options: ServiceInitOptions): InitializedCoreServices {
  const {
    supabase,
    tablePrefix = 'vezlo',
    knowledgeTableName = 'vezlo_knowledge_items',
    chatHistoryLength,
    conversationTimeout = DEFAULT_CONVERSATION_TIMEOUT
  } = options;

  const resolvedHistoryLength = chatHistoryLength ?? getChatHistoryLength();

  // Log chat history configuration
  logger.info('💬 Chat History Configuration:');
  logger.info(`   History Length: ${resolvedHistoryLength} messages (from ${process.env.CHAT_HISTORY_LENGTH ? 'env' : 'default'})`);

  const storage = new UnifiedStorage(supabase, tablePrefix);

  const knowledgeBase = new KnowledgeBaseService({
    supabase,
    tableName: knowledgeTableName
  });

  // Read AI configuration from environment
  // Use AI_MODEL for all OpenAI calls (intent classification + response generation)
  const aiModel = process.env.AI_MODEL || 'gpt-4o-mini';
  const aiTemperature = parseFloat(process.env.AI_TEMPERATURE || '0.7');
  const aiMaxTokens = parseInt(process.env.AI_MAX_TOKENS || '1000', 10);

  // Log AI configuration for verification
  logger.info('🤖 AI Service Configuration:');
  logger.info(`   Model: ${aiModel} (from ${process.env.AI_MODEL ? 'AI_MODEL env' : 'default'})`);
  logger.info(`   Temperature: ${aiTemperature} (from ${process.env.AI_TEMPERATURE ? 'env' : 'default'})`);
  logger.info(`   Max Tokens: ${aiMaxTokens} (from ${process.env.AI_MAX_TOKENS ? 'env' : 'default'})`);

  const aiService = new AIService({
    openaiApiKey: process.env.OPENAI_API_KEY!,
    organizationName: process.env.ORGANIZATION_NAME,
    assistantName: process.env.ASSISTANT_NAME,
    platformDescription: process.env.PLATFORM_DESCRIPTION,
    model: aiModel,
    temperature: aiTemperature,
    maxTokens: aiMaxTokens,
    knowledgeBaseService: knowledgeBase
  });

  const chatManager = new ChatManager({
    aiService,
    storage,
    enableConversationManagement: true,
    conversationTimeout,
    historyLength: resolvedHistoryLength
  });

  // Use same AI_MODEL for intent classification
  const intentService = new IntentService({
    openaiApiKey: process.env.OPENAI_API_KEY!,
    model: aiModel,
    assistantName: process.env.ASSISTANT_NAME,
    organizationName: process.env.ORGANIZATION_NAME
  });

  const chatController = new ChatController(chatManager, storage, supabase, {
    historyLength: resolvedHistoryLength,
    intentService
  });

  const knowledgeController = new KnowledgeController(knowledgeBase, aiService);
  const authController = new AuthController(supabase);
  const apiKeyService = new ApiKeyService(supabase);
  const apiKeyController = new ApiKeyController(apiKeyService);

  return {
    services: {
      storage,
      knowledgeBase,
      aiService,
      chatManager,
      apiKeyService
    },
    controllers: {
      chatController,
      knowledgeController,
      authController,
      apiKeyController
    },
    config: {
      chatHistoryLength: resolvedHistoryLength
    }
  };
}


