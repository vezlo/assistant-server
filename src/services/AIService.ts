import OpenAI from 'openai';
import {
  AIServiceConfig,
  ChatContext,
  AIResponse,
  DatabaseSearchResult,
  NavigationLink
} from '../types';
import { KnowledgeBaseService } from './KnowledgeBaseService';
import { DatabaseToolService } from './DatabaseToolService';
import { PromptService, PromptContext } from './PromptService';
import { AISettings } from '../config/defaultAISettings';
import logger from '../config/logger';

export class AIService {
  private openai: OpenAI;
  private systemPrompt: string;
  private config: AIServiceConfig;
  private navigationLinks: NavigationLink[];
  private knowledgeBase: string;
  private knowledgeBaseService?: KnowledgeBaseService;
  private databaseToolService?: DatabaseToolService;
  private aiSettings?: AISettings; // User-defined AI settings

  constructor(config: AIServiceConfig) {
    this.config = config;
    this.openai = new OpenAI({
      apiKey: config.openaiApiKey,
    });
    this.navigationLinks = config.navigationLinks || [];
    this.knowledgeBase = config.knowledgeBase || '';

    if (config.knowledgeBaseService) {
      this.knowledgeBaseService = config.knowledgeBaseService;
    }

    this.systemPrompt = this.buildSystemPrompt();
  }

  setKnowledgeBaseService(service: KnowledgeBaseService): void {
    this.knowledgeBaseService = service;
    this.systemPrompt = this.buildSystemPrompt();
  }

  setDatabaseToolService(service: DatabaseToolService): void {
    this.databaseToolService = service;
    logger.info('🔌 Database tool service attached to AI Service');
  }

  /**
   * Set AI settings (temperature, max_tokens, prompts)
   * This rebuilds the system prompt with user-defined prompts
   */
  setAISettings(settings: AISettings): void {
    this.aiSettings = settings;
    this.systemPrompt = this.buildSystemPrompt();
    logger.info('🎨 AI settings updated and system prompt rebuilt');
  }

  private buildSystemPrompt(): string {
    const orgName = this.config.organizationName || 'Your Organization';
    const assistantName = this.config.assistantName || `${orgName} AI Assistant`;
    const developerMode = process.env.DEVELOPER_MODE === 'true';

    const promptContext: PromptContext = {
      organizationName: orgName,
      assistantName,
      platformDescription: this.config.platformDescription,
      developerMode,
      knowledgeBaseDescription: this.knowledgeBase,
      customInstructions: this.config.customInstructions
    };

    logger.info(`🔨 Building system prompt for ${assistantName}`);

    // Use PromptService to build system prompt with user-defined prompts
    return PromptService.buildSystemPrompt(
      promptContext,
      this.aiSettings?.prompts
    );
  }

  async generateResponse(message: string, context?: ChatContext | any): Promise<AIResponse> {
    try {
      let knowledgeResults: string = '';
      let hasKnowledgeContext = false;
      
      // Check if knowledge results are already provided in context
      // If knowledgeResults is explicitly provided (even if empty string), it means search was already done
      if (context?.knowledgeResults !== undefined) {
        knowledgeResults = context.knowledgeResults || '';
        hasKnowledgeContext = knowledgeResults.length > 0;
      } else if (this.knowledgeBaseService) {
        // Only search if knowledgeResults was not provided (undefined)
        // This means the caller hasn't done the search yet
        const searchResults = await this.knowledgeBaseService.search(message, {
          limit: 5
        });

        if (searchResults.length > 0) {
          knowledgeResults = '\n\nRelevant information from knowledge base:\n';
          searchResults.forEach(result => {
            knowledgeResults += `- ${result.title}: ${result.content}\n`;
          });
          hasKnowledgeContext = true;
        } else {
          // Explicitly mark that search was done but no results found
          knowledgeResults = '\n\n[No relevant information found in knowledge base for this query.]';
          hasKnowledgeContext = false;
        }
      } else {
        // No knowledge base service available
        knowledgeResults = '\n\n[No knowledge base available.]';
        hasKnowledgeContext = false;
      }

      // Build system message with clear indication of knowledge base status
      const systemContent = this.systemPrompt + 
        (hasKnowledgeContext 
          ? knowledgeResults 
          : '\n\n⚠️ IMPORTANT: No relevant information was found in the knowledge base for this query. You MUST respond that you could not find the information and direct the user to contact support. Do NOT attempt to answer using your general knowledge.');

      const messages: any[] = [
        {
          role: 'system',
          content: systemContent
        }
      ];

      if (context?.conversationHistory) {
        messages.push(...context.conversationHistory.map((msg: any) => ({
          role: msg.role,
          content: msg.content
        })));
      }

      messages.push({
        role: 'user',
        content: message
      });

      // Use AI settings if available, otherwise fallback to config/env
      const modelToUse = this.aiSettings?.model || this.config.model || process.env.AI_MODEL || 'gpt-4o-mini';
      const temperature = this.aiSettings?.temperature ?? this.config.temperature ?? parseFloat(process.env.AI_TEMPERATURE || '0.7');
      const maxTokens = this.aiSettings?.max_tokens ?? this.config.maxTokens ?? parseInt(process.env.AI_MAX_TOKENS || '1000', 10);

      logger.info(`🤖 Generating response using model: ${modelToUse} (temp: ${temperature}, max_tokens: ${maxTokens})`);
      logger.info(`📨 COMPLETE MESSAGES ARRAY SENT TO LLM:`);
      logger.info('='.repeat(80));
      messages.forEach((msg, idx) => {
        logger.info(`[${idx}] Role: ${msg.role}`);
        logger.info(`Content (${msg.content.length} chars): ${msg.content.substring(0, 500)}${msg.content.length > 500 ? '...' : ''}`);
        logger.info('-'.repeat(40));
      });
      logger.info('='.repeat(80));

      const completion = await this.openai.chat.completions.create({
        model: modelToUse,
        messages,
        temperature,
        max_tokens: maxTokens,
      });

      const response = completion.choices[0]?.message?.content || 'I apologize, but I was unable to generate a response.';

      const suggestedLinks = this.findRelevantLinks(message);

      return {
        content: response,
        toolResults: [],
        suggestedLinks
      };

    } catch (error) {
      console.error('AI Service Error:', error);
      throw new Error('Failed to generate AI response');
    }
  }

  /**
   * Generate streaming response from OpenAI
   * Returns an async generator that yields content chunks and final response
   * 
   * Note: Tool calling is not supported in streaming mode.
   * If tools are needed, the system will fall back to non-streaming mode.
   */
  async *generateResponseStream(message: string, context?: ChatContext | any): AsyncGenerator<{ chunk: string; done: boolean; fullContent?: string }, void, unknown> {
    try {
      // Note: Database tools are handled separately in ChatController before streaming
      let knowledgeResults: string = '';
      let hasKnowledgeContext = false;
      
      // Check if knowledge results are already provided in context
      // If knowledgeResults is explicitly provided (even if empty string), it means search was already done
      if (context?.knowledgeResults !== undefined) {
        knowledgeResults = context.knowledgeResults || '';
        // If knowledgeResults is non-empty, we have context; if empty string, search was done but no results
        hasKnowledgeContext = knowledgeResults.length > 0;
        logger.info(`📚 Using provided knowledge results: ${hasKnowledgeContext ? 'has context' : 'empty (search done, no results)'} - length: ${knowledgeResults.length} chars`);
      } else if (this.knowledgeBaseService) {
        // Only search if knowledgeResults was not provided (undefined)
        // This means the caller hasn't done the search yet
        const searchResults = await this.knowledgeBaseService.search(message, {
          limit: 5
        });

        logger.info(`🔍 Knowledge base search returned ${searchResults.length} results`);

        if (searchResults.length > 0) {
          knowledgeResults = '\n\nRelevant information from knowledge base:\n';
          searchResults.forEach(result => {
            knowledgeResults += `- ${result.title}: ${result.content}\n`;
          });
          hasKnowledgeContext = true;
          logger.info(`✅ Knowledge context prepared (${knowledgeResults.length} chars)`);
        } else {
          // Explicitly mark that search was done but no results found
          knowledgeResults = '';
          hasKnowledgeContext = false;
          logger.info('⚠️  Search completed but no results found');
        }
      } else {
        // No knowledge base service available
        knowledgeResults = '';
        hasKnowledgeContext = false;
        logger.warn('⚠️  No knowledge base service available');
      }

      // Build system message with clear indication of knowledge base status
      const systemContent = this.systemPrompt + 
        (hasKnowledgeContext 
          ? knowledgeResults 
          : '\n\n⚠️ IMPORTANT: No relevant information was found in the knowledge base for this query. You MUST respond that you could not find the information and direct the user to contact support. Do NOT attempt to answer using your general knowledge.');

      const messages: any[] = [
        {
          role: 'system',
          content: systemContent
        }
      ];

      if (context?.conversationHistory) {
        messages.push(...context.conversationHistory.map((msg: any) => ({
          role: msg.role,
          content: msg.content
        })));
      }

      messages.push({
        role: 'user',
        content: message
      });

      // Use AI settings if available, otherwise fallback to config/env
      const modelToUse = this.aiSettings?.model || this.config.model || process.env.AI_MODEL || 'gpt-4o-mini';
      const temperature = this.aiSettings?.temperature ?? this.config.temperature ?? parseFloat(process.env.AI_TEMPERATURE || '0.7');
      const maxTokens = this.aiSettings?.max_tokens ?? this.config.maxTokens ?? parseInt(process.env.AI_MAX_TOKENS || '1000', 10);

      logger.info(`🤖 Generating streaming response using model: ${modelToUse} (temp: ${temperature}, max_tokens: ${maxTokens})`);

      const stream = await this.openai.chat.completions.create({
        model: modelToUse,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: true,
      });

      let fullContent = '';
      let lastChunk: any = null;
      let hasYieldedAny = false;
      let chunkCount = 0;

      logger.info('🔄 Starting OpenAI stream collection...');

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        chunkCount++;
        
        // If we have a previous chunk, yield it with done: false
        if (lastChunk !== null) {
          yield { chunk: lastChunk, done: false };
          hasYieldedAny = true;
        }
        
        // Store current chunk as last chunk
        if (content) {
          lastChunk = content;
          fullContent += content;
        }
      }

      logger.info(`🏁 OpenAI stream ended. Total chunks: ${chunkCount}, fullContent length: ${fullContent.length}`);

      // Yield the LAST chunk with done: true
      if (lastChunk !== null) {
        logger.info(`📤 Yielding LAST chunk with done=true: "${lastChunk.substring(0, 30)}..."`);
        yield { chunk: lastChunk, done: true, fullContent };
      } else if (!hasYieldedAny) {
        // Edge case: no content at all
        logger.warn('⚠️  No content chunks received from OpenAI');
        yield { chunk: '', done: true, fullContent: '' };
      }

    } catch (error) {
      logger.error('AI Service Streaming Error:', error);
      throw new Error('Failed to generate streaming AI response');
    }
  }

  private findRelevantLinks(message: string): NavigationLink[] {
    const relevantLinks: NavigationLink[] = [];
    const messageLower = message.toLowerCase();

    this.navigationLinks.forEach(link => {
      const linkKeywords = [
        link.label.toLowerCase(),
        ...(link.keywords || []).map(k => k.toLowerCase()),
        link.description?.toLowerCase() || ''
      ];

      const isRelevant = linkKeywords.some(keyword => 
        keyword && messageLower.includes(keyword)
      );

      if (isRelevant) {
        relevantLinks.push(link);
      }
    });

    return relevantLinks.slice(0, 3);
  }
}


