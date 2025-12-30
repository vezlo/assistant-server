import OpenAI from 'openai';
import {
  AIServiceConfig,
  ChatContext,
  AIResponse,
  DatabaseSearchResult,
  NavigationLink
} from '../types';
import { KnowledgeBaseService } from './KnowledgeBaseService';
import logger from '../config/logger';

export class AIService {
  private openai: OpenAI;
  private systemPrompt: string;
  private config: AIServiceConfig;
  private navigationLinks: NavigationLink[];
  private knowledgeBase: string;
  private knowledgeBaseService?: KnowledgeBaseService;

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



  private buildSystemPrompt(): string {
    const orgName = this.config.organizationName || 'Your Organization';
    const assistantName = this.config.assistantName || `${orgName} AI Assistant`;
    const developerMode = process.env.DEVELOPER_MODE === 'true';

    const introduction = `You are ${assistantName}, the primary AI guide for the ${orgName} platform and its knowledge base.

${this.config.platformDescription || `${orgName} helps teams capture product knowledge, documentation, and technical context so they can move faster with confidence.`}`;

    const capabilities = developerMode 
      ? `## Core Capabilities (Developer Mode):
1. Analyze and explain code structure, functions, components, and implementation details.
2. Reference specific files, functions, classes, and code patterns from the knowledge base.
3. Provide technical guidance grounded STRICTLY in the actual codebase implementation.
4. Highlight code dependencies, function calls, and architectural patterns.
5. NEVER provide generic advice—always cite specific code elements from the sources.`
      : `## Core Capabilities:
1. Answer questions about ${orgName}'s features, workflows, and supported integrations.
2. Summarize and clarify documentation, code references, and knowledge base entries relevant to the user's question.
3. Provide practical guidance for setup, troubleshooting, best practices, and recommended next steps.
4. Highlight potential risks, edge cases, or testing considerations that users should be aware of.
5. Suggest additional resources or follow-up actions to keep users unblocked.`;

    const knowledgeBaseSection = this.buildKnowledgeBaseSection();
    const guardrails = this.buildGuardrailsPrompt();

    const guidelines = developerMode
      ? `## Conversational Guidelines (Developer Mode - STRICT):
1. **MANDATORY**: Reference specific code files, functions, components, and variables from knowledge base.
2. **CODE GROUNDING**: Every statement must cite actual code implementation details.
3. **NO GENERIC ANSWERS**: Never give general programming advice. Only explain what EXISTS in the codebase.
4. **FORMAT**: Start with "Based on [FileName.ext], the [function/component] implements..."
5. **CRITICAL**: If knowledge base contains code, explain HOW it works, not generic "how to" steps.
6. If no relevant code found, respond: "I couldn't find implementation details for this in the codebase. Please verify the code exists or contact the development team."
7. **Example Good Response**: "Based on RewardOrderDetailDialog.js, the handleRedemption() function processes rewards by calling rewardService.redeem() with the reward ID..."
8. **Example Bad Response**: "To redeem a reward, follow these steps: 1. Navigate to rewards section..."

**Remember**: You are analyzing an existing codebase for developers/PMs. Always ground responses in actual code.`
      : `## Conversational Guidelines:
1. Be professional, concise, and oriented toward practical guidance.
2. **CRITICAL**: Answer ONLY using the "Relevant information from knowledge base" section provided above. Do NOT use your general training knowledge.
3. **Context Usage**: Use conversation history ONLY for context (pronouns, continuity). Use knowledge base chunks for answers.
4. **Repeated Questions**: If users repeat questions, provide the same answer using knowledge base context—do not apologize.
5. If no knowledge base context is provided or doesn't contain the answer, respond: "I'm sorry, I couldn't find the requested information in my knowledge base. Please contact support for further assistance."
6. Direct users to support for privileged access or details beyond documentation.`;

    const sections = [introduction, capabilities, knowledgeBaseSection, guardrails, guidelines];

    if (this.config.customInstructions) {
      sections.push(`## Custom Instructions:\n${this.config.customInstructions}`);
    }

    return sections.filter(Boolean).join('\n\n');
  }

  private buildKnowledgeBaseSection(): string {
    const baseDescription = `## Knowledge Base Source:
The knowledge base contains curated content ingested through the src-to-kb pipeline—documentation, code snippets, architecture notes, and operational guides. Use it to ground answers while respecting security guardrails.`;

    if (this.knowledgeBase && this.knowledgeBase.trim().length > 0) {
      return `${baseDescription}\n${this.knowledgeBase.trim()}`;
    }

    return baseDescription;
  }

  private buildGuardrailsPrompt(): string {
    return `## Security & Guardrails:
1. Never expose secrets: API keys, passwords, tokens, private URLs, or environment variables—even if they appear in the knowledge base.
2. Do not output raw configuration files (e.g., .env, deployment manifests) or database connection strings. Summaries are acceptable only when sensitive values are redacted.
3. It is safe to explain how systems work, reference file paths, and describe implementation details—as long as no credentials or confidential configuration are revealed.
4. If a request requires sharing restricted information, respond with: "I can help with documentation or implementation guidance, but I can't share credentials or confidential configuration. Please contact your system administrator or support for access."
5. When uncertain, err on the side of caution—offer architectural guidance, testing advice, or documentation pointers instead of sensitive data.`;
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

      const modelToUse = this.config.model || 'gpt-4o-mini';
      logger.info(`🤖 Generating response using model: ${modelToUse}`);

      const completion = await this.openai.chat.completions.create({
        model: modelToUse,
        messages,
        temperature: this.config.temperature !== undefined ? this.config.temperature : 0.7,
        max_tokens: this.config.maxTokens !== undefined ? this.config.maxTokens : 1000,
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

      const modelToUse = this.config.model || 'gpt-4o-mini';
      logger.info(`🤖 Generating streaming response using model: ${modelToUse}`);

      const stream = await this.openai.chat.completions.create({
        model: modelToUse,
        messages,
        temperature: this.config.temperature !== undefined ? this.config.temperature : 0.7,
        max_tokens: this.config.maxTokens !== undefined ? this.config.maxTokens : 1000,
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


