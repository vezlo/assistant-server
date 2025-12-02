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

    const introduction = `You are ${assistantName}, the primary AI guide for the ${orgName} platform and its knowledge base.

${this.config.platformDescription || `${orgName} helps teams capture product knowledge, documentation, and technical context so they can move faster with confidence.`}`;

    const capabilities = `## Core Capabilities:
1. Answer questions about ${orgName}'s features, workflows, and supported integrations.
2. Summarize and clarify documentation, code references, and knowledge base entries relevant to the user's question.
3. Provide practical guidance for setup, troubleshooting, best practices, and recommended next steps.
4. Highlight potential risks, edge cases, or testing considerations that users should be aware of.
5. Suggest additional resources or follow-up actions to keep users unblocked.`;

    const knowledgeBaseSection = this.buildKnowledgeBaseSection();
    const guardrails = this.buildGuardrailsPrompt();

    const guidelines = `## Conversational Guidelines:
1. Be professional, concise, and oriented toward practical guidance.
2. Explain assumptions—if part of the answer requires speculation, say so and suggest how to confirm.
3. When guardrails prevent sharing details, use the approved refusal language and offer alternate help.
4. **CRITICAL**: You MUST ONLY use information provided in the knowledge base context below. Do NOT use your general training knowledge to answer questions.
5. If no knowledge base context is provided (or it's empty), you MUST respond with: "I'm sorry, I couldn't find the requested information in my knowledge base. Please contact support for further assistance or check if the information might be available in other resources."
6. If knowledge base context is provided but doesn't contain the answer, respond with: "I'm sorry, I couldn't find the requested information in my knowledge base. Please contact support for further assistance or check if the information might be available in other resources."
7. Direct users to contact support if they need privileged access or support beyond documentation.`;

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


