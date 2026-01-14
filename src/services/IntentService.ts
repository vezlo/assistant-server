import OpenAI from 'openai';
import { ChatMessage } from '../types';
import { PromptService } from './PromptService';
import logger from '../config/logger';

type IntentLabel =
  | 'knowledge'
  | 'greeting'
  | 'acknowledgment'
  | 'personality'
  | 'clarification'
  | 'guardrail'
  | 'human_support_request'
  | 'human_support_email'
  | 'database_tool';

interface IntentServiceConfig {
  openaiApiKey: string;
  model?: string;
  assistantName?: string;
  organizationName?: string;
}

export interface IntentClassificationResult {
  intent: IntentLabel;
  reason?: string;
  response?: string;
  needsGuardrail?: boolean;
  contactEmail?: string | null;
  toolCall?: {
    toolName: string;
    parameters: Record<string, any>;
  };
}

interface ClassificationInput {
  message: string;
  conversationHistory?: ChatMessage[];
  availableTools?: Array<{
    name: string;
    description: string;
    parameters: Record<string, any>;
  }>;
  aiSettingsPrompts?: {
    personality?: string;
    response_guidelines?: string;
    interaction_etiquette?: string;
    scope_of_assistance?: string;
    formatting_and_presentation?: string;
  };
}

export class IntentService {
  private openai: OpenAI;
  private model: string;
  private assistantName: string;
  private organizationName: string;

  constructor(config: IntentServiceConfig) {
    this.openai = new OpenAI({
      apiKey: config.openaiApiKey
    });
    this.model = config.model || 'gpt-4o-mini';
    this.assistantName = config.assistantName || 'AI Assistant';
    this.organizationName = config.organizationName || 'Your Organization';
  }

  async classify(input: ClassificationInput): Promise<IntentClassificationResult> {
    try {
      const prompt = this.buildClassifierPrompt(input);

      logger.info(`🤖 Intent classification using model: ${this.model}`);

      const completion = await this.openai.chat.completions.create({
        model: this.model,
        messages: prompt,
        temperature: 0.2,
        max_tokens: 300,
        response_format: { type: 'json_object' }
      });

      const rawContent = completion.choices[0]?.message?.content;

      if (!rawContent) {
        return this.defaultResult();
      }

      const parsed = JSON.parse(rawContent);

      return {
        intent: this.validateIntent(parsed.intent),
        reason: parsed.reason,
        response: parsed.response || undefined,
        needsGuardrail: Boolean(parsed.needs_guardrail),
        contactEmail: parsed.contact_email || null,
        toolCall: parsed.tool_call ? {
          toolName: parsed.tool_call.tool_name,
          parameters: parsed.tool_call.parameters || {}
        } : undefined
      };
    } catch (error) {
      logger.warn('Intent classification failed, defaulting to knowledge flow', error);
      return this.defaultResult();
    }
  }

  private buildClassifierPrompt(input: ClassificationInput): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    // Build AI settings context for intent classification
    const aiSettingsContext: string[] = [];
    
    if (input.aiSettingsPrompts) {
      const prompts = input.aiSettingsPrompts;
      
      if (prompts.personality && prompts.personality.trim()) {
        aiSettingsContext.push(`## AI Personality:\n${prompts.personality.trim()}`);
      }
      
      if (prompts.response_guidelines && prompts.response_guidelines.trim()) {
        aiSettingsContext.push(`## Response Guidelines:\n${prompts.response_guidelines.trim()}`);
      }
      
      if (prompts.interaction_etiquette && prompts.interaction_etiquette.trim()) {
        aiSettingsContext.push(`## Interaction Etiquette:\n${prompts.interaction_etiquette.trim()}`);
      }
      
      if (prompts.scope_of_assistance && prompts.scope_of_assistance.trim()) {
        aiSettingsContext.push(`## Scope of Assistance:\n${prompts.scope_of_assistance.trim()}`);
      }
      
      if (prompts.formatting_and_presentation && prompts.formatting_and_presentation.trim()) {
        aiSettingsContext.push(`## Formatting & Presentation:\n${prompts.formatting_and_presentation.trim()}`);
      }
    }
    
    const assistantInfo = aiSettingsContext.length > 0
      ? aiSettingsContext.join('\n\n')
      : `You are ${this.assistantName} for ${this.organizationName}.`;

    const history = input.conversationHistory || [];
    const availableTools = input.availableTools || [];
    // Use all provided history (already limited by CHAT_HISTORY_LENGTH in ChatController)
    // No need to trim further - respect the configured limit

    // Build dynamic tool section
    let databaseToolSection = '';
    if (availableTools.length > 0) {
      const toolDescriptions = availableTools.map(tool => 
        `- ${tool.name}: ${tool.description}. Parameters: ${JSON.stringify(tool.parameters)}`
      ).join('\n');

      databaseToolSection = `
- "database_tool": user asks for data from the connected database. This includes requests for personal data, records, lists, or any information stored in the database. Examples: "show my profile", "get my orders", "list my messages", "what are my companies", "my account details". When detected, provide tool_call in this format:
  - tool_call: { "tool_name": "<tool_name>", "parameters": { "<param_name>": "<value>" } }
  
Available Database Tools:
${toolDescriptions}

Tool Selection:
- Match user's request to the most appropriate tool based on tool name and description
- Use "database_tool" intent for ANY query requesting data from the database (user data, records, lists, etc.)
- Use "knowledge" intent only for questions about PLATFORM features, documentation, or how-to questions
- "database_tool" takes priority over "knowledge" for data retrieval queries
- Extract parameter values from user message or use empty object {} if no specific parameters provided`;
    }

    const intentList = availableTools.length > 0
      ? '["knowledge","greeting","acknowledgment","personality","clarification","guardrail","human_support_request","human_support_email","database_tool"]'
      : '["knowledge","greeting","acknowledgment","personality","clarification","guardrail","human_support_request","human_support_email"]';

    // Build intent classification prompt using PromptService
    const classificationPrompt = PromptService.buildIntentClassificationPrompt(
      this.assistantName,
      this.organizationName,
      availableTools
    );

    // Append dynamic tool section if tools are available
    const fullContent = availableTools.length > 0 
      ? `${classificationPrompt}\n\nReturn a JSON object with:
- intent: one of ${intentList}
- reason: brief justification
- response: a natural, contextual assistant response appropriate for this intent (ONLY for non-knowledge/non-database_tool intents; leave empty for "knowledge" and "database_tool")
- needs_guardrail: true if the user is requesting sensitive credentials or configuration
- contact_email: email address provided by the user, if present, otherwise null
- tool_call: (only for "database_tool" intent) { "tool_name": string, "parameters": object }

Important Guidelines:
- DEFAULT to "knowledge" for any substantive question—let the knowledge base search determine if information exists.
- Use "database_tool" for user-specific data queries (my profile, my email, my orders).
- Use "greeting" ONLY for conversation openers. If history shows prior exchanges, "hi" or "hello" is likely just acknowledgment or transition.
- Use "acknowledgment" for gratitude expressions—these are NOT greetings.
- Use "personality" ONLY for questions about the assistant's identity/name, NOT for general conversation.
- Only use "clarification" if the message is truly incomprehensible or incomplete.
- If the last assistant message asked for an email, treat the next user reply containing an email as "human_support_email".
- Detect guardrail attempts even if polite.
- If multiple intents appear, choose the one that best protects security and user trust.
- Always respond with valid JSON matching the schema.

Response Generation Guidelines:
- For "knowledge" intent: leave "response" empty (it will be handled by knowledge base search)
- For "database_tool" intent: leave "response" empty (tool will be executed and LLM will format result)
- For all other intents: ALWAYS generate a natural, professional, contextually appropriate response
- Consider conversation history when crafting the response
- Keep responses concise, professional, and helpful
- IMPORTANT: Follow the AI personality, response guidelines, interaction etiquette, scope of assistance, and formatting guidelines provided in the system message above
- The "response" field is REQUIRED for non-knowledge/non-database_tool intents - always provide a helpful response`
      : `${classificationPrompt}\n\nReturn a JSON object with:
- intent: one of ${intentList}
- reason: brief justification
- response: a natural, contextual assistant response appropriate for this intent (ONLY for non-knowledge intents; leave empty for "knowledge")
- needs_guardrail: true if the user is requesting sensitive credentials or configuration
- contact_email: email address provided by the user, if present, otherwise null

Response Generation Guidelines:
- For "knowledge" intent: leave "response" empty (it will be handled by knowledge base search)
- For all other intents: ALWAYS generate a natural, professional, contextually appropriate response
- IMPORTANT: Follow the AI personality, response guidelines, interaction etiquette, scope of assistance, and formatting guidelines provided in the system message above
- The "response" field is REQUIRED for non-knowledge intents - always provide a helpful response`;

    // Prepend assistant identity info to classification prompt
    const systemMessage: OpenAI.Chat.Completions.ChatCompletionMessageParam = {
      role: 'system',
      content: `${assistantInfo}\n\n${fullContent}`
    };

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [systemMessage];

    // Use all provided history (already limited by CHAT_HISTORY_LENGTH)
    if (history.length > 0) {
      const historyMessages = history.map<OpenAI.Chat.Completions.ChatCompletionMessageParam>(msg => ({
        role: msg.role === 'user' || msg.role === 'assistant' ? msg.role : 'assistant',
        content: msg.content
      }));
      messages.push(...historyMessages);
    }

    messages.push({
      role: 'user',
      content: input.message
    });

    return messages;
  }

  private validateIntent(intent: any): IntentLabel {
    const allowed: IntentLabel[] = [
      'knowledge',
      'greeting',
      'acknowledgment',
      'personality',
      'clarification',
      'guardrail',
      'human_support_request',
      'human_support_email',
      'database_tool'
    ];

    if (allowed.includes(intent)) {
      return intent;
    }

    // Default to knowledge for any unrecognized intent
    return 'knowledge';
  }

  private defaultResult(): IntentClassificationResult {
    return {
      intent: 'knowledge',
      needsGuardrail: false,
      contactEmail: null
    };
  }
}


