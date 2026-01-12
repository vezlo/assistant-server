import OpenAI from 'openai';
import { ChatMessage } from '../types';
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
  databaseToolsEnabled?: boolean;
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
}

export class IntentService {
  private openai: OpenAI;
  private model: string;
  private assistantName: string;
  private organizationName: string;
  private databaseToolsEnabled: boolean;

  constructor(config: IntentServiceConfig) {
    this.openai = new OpenAI({
      apiKey: config.openaiApiKey
    });
    this.model = config.model || 'gpt-4o-mini';
    this.assistantName = config.assistantName || 'AI Assistant';
    this.organizationName = config.organizationName || 'Your Organization';
    this.databaseToolsEnabled = config.databaseToolsEnabled || false;
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

    const systemMessage: OpenAI.Chat.Completions.ChatCompletionMessageParam = {
      role: 'system',
      content: `You are an intent classifier for ${this.assistantName}, the AI assistant for ${this.organizationName}. 
Your job is to analyse the latest user message (with short conversation history) and decide how the assistant should respond.

Return a JSON object with:
- intent: one of ${intentList}
- reason: brief justification
- response: a natural, contextual assistant response appropriate for this intent (ONLY for non-knowledge/non-database_tool intents; leave empty for "knowledge" and "database_tool")
- needs_guardrail: true if the user is requesting sensitive credentials or configuration
- contact_email: email address provided by the user, if present, otherwise null
- tool_call: (only for "database_tool" intent) { "tool_name": string, "parameters": object }

Definitions:
- "knowledge": ANY question, query, or request about the platform, product, documentation, technical details, features, usage, troubleshooting, or any topic that could potentially be in the knowledge base. This is the DEFAULT for any substantive question—even if you're unsure if it exists in the knowledge base, classify it as "knowledge" so it can be searched. Also includes follow-up questions like "what about X?", "can you explain more?", or topic expansions.${databaseToolSection}
- "greeting": ONLY simple greetings like "hi", "hello", "good morning", "hey" when they appear as the FIRST message in the conversation or as a clear conversation opener. If conversation history exists and contains assistant responses, this is likely NOT a greeting but an acknowledgment or knowledge query.
- "acknowledgment": expressions of gratitude, confirmation, or acknowledgment like "thank you", "thanks", "got it", "perfect", "appreciate it", "okay", "alright". These show the user received the information and may or may not need further help.
- "personality": questions about the assistant's identity, name, who they are, what they do, or introduction. Examples: "what's your name?", "who are you?", "tell me about yourself".
- "clarification": the request is extremely unclear, incomplete, or badly misspelled so you cannot understand what the user wants at all.
- "guardrail": user requests secrets (API keys, passwords, tokens, environment variables, private URLs, confidential config).
- "human_support_request": user explicitly asks for a human agent, wants to talk to support, or requests human assistance.
- "human_support_email": user provides contact information (email) after being asked for it.

Important:
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
- For all other intents: generate a natural, professional, contextually appropriate response
- Consider conversation history when crafting the response (e.g., if user says "I changed my mind" after a support request, acknowledge the change)
- For "greeting": welcome the user warmly
- For "acknowledgment": politely acknowledge and offer continued assistance
- For "personality": introduce the assistant professionally
- For "clarification": politely ask for more details
- For "guardrail": professionally decline and redirect
- For "human_support_request": explain support options and ask for contact email
- For "human_support_email": confirm receipt and set expectations
- Keep responses concise, professional, and helpful`
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


