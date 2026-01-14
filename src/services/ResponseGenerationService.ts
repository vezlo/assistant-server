import { IntentService, IntentClassificationResult } from './IntentService';
import { AIService } from './AIService';
import { DatabaseToolService } from './DatabaseToolService';
import { ChatMessage } from '../types';
import logger from '../config/logger';

export interface KnowledgeSearchResult {
  knowledgeResults: string | null;
  sources: Array<{
    document_uuid: string;
    document_title: string;
    chunk_indices: number[];
  }>;
  chunks: Array<{
    chunk_text: string;
    document_title: string;
    document_uuid: string;
  }>;
}

export interface GenerationResult {
  type: 'intent' | 'knowledge';
  intentResponse?: string;
  knowledgeContext?: {
    conversationHistory: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
    knowledgeResults?: string;
  };
  sources?: Array<{
    document_uuid: string;
    document_title: string;
    chunk_indices: number[];
  }>;
}

export class ResponseGenerationService {
  private intentService?: IntentService;
  private aiService?: AIService;
  private databaseToolService?: DatabaseToolService;
  private chatHistoryLength: number;
  private currentAISettingsPrompts?: {
    personality?: string;
    response_guidelines?: string;
    interaction_etiquette?: string;
    scope_of_assistance?: string;
    formatting_and_presentation?: string;
  };

  constructor(
    intentService: IntentService | undefined,
    aiService: AIService | undefined,
    chatHistoryLength: number,
    databaseToolService?: DatabaseToolService
  ) {
    this.intentService = intentService;
    this.aiService = aiService;
    this.databaseToolService = databaseToolService;
    this.chatHistoryLength = chatHistoryLength;
  }

  /**
   * Update AI settings prompts for intent classification
   */
  setAISettingsPrompts(prompts?: {
    personality?: string;
    response_guidelines?: string;
    interaction_etiquette?: string;
    scope_of_assistance?: string;
    formatting_and_presentation?: string;
  }): void {
    this.currentAISettingsPrompts = prompts;
  }

  /**
   * Classify user intent with dynamic tool support
   */
  async classifyIntent(message: string, history: ChatMessage[], companyId?: number): Promise<IntentClassificationResult> {
    if (!this.intentService) {
      return {
        intent: 'knowledge',
        needsGuardrail: false,
        contactEmail: null
      };
    }

    const resolvedHistory = Array.isArray(history) ? history : [];
    logger.info('🧭 Classifying user intent...');

    // Fetch available tools if companyId provided and databaseToolService exists
    let availableTools: Array<{ name: string; description: string; parameters: Record<string, any> }> = [];
    
    if (companyId && this.databaseToolService) {
      try {
        const toolDefinitions = await this.databaseToolService.getToolsForCompany(companyId);
        availableTools = toolDefinitions.map((tool: any) => ({
          name: tool.function.name,
          description: tool.function.description,
          parameters: tool.function.parameters
        }));
        
        if (availableTools.length > 0) {
          logger.info(`🔧 Loaded ${availableTools.length} dynamic tools for company ${companyId}`);
        }
      } catch (error) {
        logger.error('Failed to load dynamic tools:', error);
      }
    }

    return this.intentService.classify({
      message,
      conversationHistory: resolvedHistory,
      availableTools: availableTools.length > 0 ? availableTools : undefined,
      aiSettingsPrompts: this.currentAISettingsPrompts
    });
  }

  /**
   * Handle intent classification result
   * Returns response content if non-knowledge intent, null if knowledge/tool intent
   */
  handleIntentResult(
    result: IntentClassificationResult,
    userMessageContent: string
  ): string | null {
    if (result.needsGuardrail && result.intent !== 'guardrail') {
      logger.info('🛡️ Guardrail triggered');
      return `I can help with documentation or implementation guidance, but I can't share credentials or confidential configuration. Please contact your system administrator or support for access.`;
    }

    logger.info(`🧾 Intent result: ${result.intent}${result.needsGuardrail ? ' (guardrail triggered)' : ''}`);

    // Database tool intent - return null (handled by ChatController)
    if (result.intent === 'database_tool') {
      logger.info('🔧 Database tool intent detected; will be handled separately.');
      return null;
    }

    // For non-knowledge intents, return the response content to be streamed
    if (result.intent !== 'knowledge') {
      const responseContent = result.response || this.getFallbackResponse(result.intent);
      return responseContent;
    }

    // Knowledge intent - proceed to RAG flow (return null to indicate streaming will happen later)
    logger.info('📚 Intent requires knowledge lookup; proceeding with RAG flow.');
    return null;
  }

  /**
   * Search knowledge base and extract sources
   */
  async searchKnowledgeBase(
    query: string,
    companyId?: number
  ): Promise<KnowledgeSearchResult> {
    const sources: Array<{
      document_uuid: string;
      document_title: string;
      chunk_indices: number[];
    }> = [];
    const chunks: Array<{
      chunk_text: string;
      document_title: string;
      document_uuid: string;
    }> = [];
    let knowledgeResults: string | null = null;

    const aiServiceAny = this.aiService as any;
    if (!aiServiceAny || !aiServiceAny.knowledgeBaseService) {
      logger.warn('⚠️  AI service or knowledge base service not available');
      return { knowledgeResults: null, sources: [], chunks: [] };
    }

    try {
      logger.info(`🔍 Searching KB: query="${query.substring(0, 50)}...", companyId=${companyId}`);
      
      const searchResults = await aiServiceAny.knowledgeBaseService.search(query, {
        limit: 5,
        company_id: companyId
      });

      logger.info(`📊 Found knowledge base results: ${searchResults.length}`);

      if (searchResults.length > 0) {
        knowledgeResults = '\n\nRelevant information from knowledge base:\n';
        searchResults.forEach((result: any) => {
          const title = result.title || 'Untitled';
          const content = result.content || '';
          if (content.trim()) {
            knowledgeResults += `- ${title}: ${content}\n`;
            
            // Store individual raw chunks for validation (not merged content)
            if (result.raw_chunks && result.raw_chunks.length > 0) {
              result.raw_chunks.forEach((rawChunk: any) => {
                chunks.push({
                  chunk_text: rawChunk.chunk_text,
                  document_title: title,
                  document_uuid: result.id
                });
              });
            } else {
              // Fallback: if no raw_chunks, use merged content
              chunks.push({
                chunk_text: content,
                document_title: title,
                document_uuid: result.id
              });
            }
            
            // Extract chunk indices from metadata.chunk_range (e.g., "0-2" -> [0,1,2])
            let chunkIndices: number[] = [];
            if (result.metadata?.chunk_range) {
              const [start, end] = result.metadata.chunk_range.split('-').map((n: string) => parseInt(n, 10));
              if (!isNaN(start) && !isNaN(end)) {
                for (let i = start; i <= end; i++) {
                  chunkIndices.push(i);
                }
              }
            }
            
            // Add to sources array (deduplicate by document_uuid)
            if (!sources.find(s => s.document_uuid === result.id)) {
              sources.push({
                document_uuid: result.id,
                document_title: title,
                chunk_indices: chunkIndices
              });
            } else {
              const existing = sources.find(s => s.document_uuid === result.id);
              if (existing) {
                // Merge chunk indices
                chunkIndices.forEach(idx => {
                  if (!existing.chunk_indices.includes(idx)) {
                    existing.chunk_indices.push(idx);
                  }
                });
              }
            }
          }
        });
        
        // Verify we actually have meaningful content (not just the header)
        const headerLength = '\n\nRelevant information from knowledge base:\n'.length;
        if (knowledgeResults.length > headerLength + 10) {
          logger.info(`✅ Knowledge context prepared (${knowledgeResults.length} chars, ${searchResults.length} results)`);
          logger.info(`📝 Knowledge preview: ${knowledgeResults.substring(0, 200)}...`);
        } else {
          logger.warn(`⚠️  Knowledge results found but content is empty or too short (${knowledgeResults.length} chars), treating as no results`);
          knowledgeResults = '';
        }
      } else {
        knowledgeResults = '';
        logger.info('⚠️  No knowledge base results found; will return appropriate fallback response');
      }
    } catch (error) {
      console.error('❌ Failed to search knowledge base:', error);
      logger.error('Failed to search knowledge base:', error);
      knowledgeResults = null;
    }

    return { knowledgeResults, sources, chunks };
  }

  /**
   * Build chat context for AI generation
   */
  buildChatContext(
    messages: ChatMessage[],
    knowledgeResults?: string | null
  ): {
    conversationHistory: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
    knowledgeResults?: string;
  } {
    return {
      conversationHistory: messages.map(msg => ({
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.content
      })),
      knowledgeResults: knowledgeResults ?? undefined
    };
  }

  /**
   * Get AI service for streaming
   */
  getAIService(): AIService | undefined {
    return this.aiService;
  }

  /**
   * Get fallback response for intent
   * Note: "personality" intent is NOT included here - it should go through LLM
   * to use the custom AI personality from settings
   */
  private getFallbackResponse(intent: string): string {
    const fallbacks: Record<string, string> = {
      greeting: 'Hello! How can I help you today?',
      acknowledgment: "You're welcome! Let me know if you need anything else.",
      clarification: "I'm not sure I understood. Could you clarify what you need help with?",
      guardrail: "I can help with documentation or implementation guidance, but I can't share credentials or confidential configuration.",
      human_support_request: "I'd be happy to connect you with our support team. Could you please provide your email address?",
      human_support_email: "Thank you! Our support team will reach out to you shortly."
    };
    
    return fallbacks[intent] || "I'm here to help. What would you like to know?";
  }
}

