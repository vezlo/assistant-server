export interface AIServiceConfig {
  openaiApiKey: string;
  organizationName?: string;
  assistantName?: string;
  platformDescription?: string;
  supportEmail?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  enableDatabaseSearch?: boolean;
  navigationLinks?: NavigationLink[];
  existingFeatures?: string[];
  missingFeatures?: string[];
  customInstructions?: string;
  knowledgeBase?: string;
  knowledgeBaseService?: any;
}

export interface ChatContext {
  userId?: string;
  organizationId?: string;
  conversationId?: string;
  threadId?: string;
  conversationHistory?: ChatMessage[];
  metadata?: Record<string, any>;
}

export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant' | 'system' | 'agent';
  content: string;
  createdAt?: Date;
  toolCalls?: any;
  toolResults?: DatabaseSearchResult[];
}

export interface AIResponse {
  content: string;
  toolResults: DatabaseSearchResult[];
  suggestedLinks: NavigationLink[];
}

export interface DatabaseSearchResult {
  type: string;
  entity: string;
  source: string;
  title: string;
  content: Array<{
    type: string;
    text: string;
  }>;
  citations: {
    enabled: boolean;
  };
  count?: number;
  data?: any;
}


export interface NavigationLink {
  label: string;
  path: string;
  description?: string;
  keywords?: string[];
  icon?: string;
  category?: string;
}

/** Technical depth level: 1 (Executive) to 5 (Developer) */
export type TechnicalDepthLevel = 1 | 2 | 3 | 4 | 5;

export interface DepthLevelInfo {
  level: TechnicalDepthLevel;
  name: string;
  description: string;
}

export interface DepthResolutionContext {
  requestDepth?: number;
  conversationUuid?: string;
  companyUuid: string;
}

export interface ChatConversation {
  id?: string;
  threadId: string;
  userId: string;
  organizationId?: string;
  title: string;
  messageCount: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
  joinedAt?: Date;
  respondedAt?: Date;
  closedAt?: Date;
  archivedAt?: Date;
  lastMessageAt?: Date;
  slack_channel_id?: string;
  slack_thread_ts?: string;
  status?: string;
  technical_depth?: number | null;
}

export interface StoredChatMessage {
  id?: string;
  conversationId: string;
  threadId: string;
  role: 'user' | 'assistant' | 'system' | 'agent';
  content: string;
  parentMessageId?: string;
  toolCalls?: any;
  toolResults?: DatabaseSearchResult[];
  authorId?: number;
  authorName?: string;
  createdAt: Date;
  updatedAt?: Date;
}

export interface MessageListOptions {
  order?: 'asc' | 'desc';
  types?: string[];
}

export interface ConversationListOptions {
  limit?: number;
  offset?: number;
  orderBy?: 'last_message_at' | 'updated_at';
  status?: 'active' | 'archived';
}

export interface ConversationListResult {
  conversations: ChatConversation[];
  total: number;
}

export interface ChatStorage {
  saveConversation(conversation: ChatConversation): Promise<ChatConversation>;
  getConversation(conversationId: string): Promise<ChatConversation | null>;
  updateConversation(conversationId: string, updates: Partial<ChatConversation>): Promise<ChatConversation>;
  deleteConversation(conversationId: string): Promise<boolean>;
  getUserConversations(
    userId: string,
    organizationId?: string,
    options?: ConversationListOptions
  ): Promise<ConversationListResult>;
  saveMessage(message: StoredChatMessage): Promise<StoredChatMessage>;
  getMessages(
    conversationId: string,
    limit?: number,
    offset?: number,
    options?: MessageListOptions
  ): Promise<StoredChatMessage[]>;
  deleteMessage(messageId: string): Promise<boolean>;
  saveFeedback(feedback: Feedback): Promise<Feedback>;
  getFeedback(messageId: string): Promise<Feedback[]>;
}

export interface Feedback {
  id?: string;
  messageId: string;
  conversationId: string;
  userId: string;
  rating: 'positive' | 'negative';
  category?: string;
  comment?: string;
  suggestedImprovement?: string;
  createdAt: Date;
  companyId?: string;
}

export interface ChatManagerConfig {
  aiService: any;
  storage?: ChatStorage;
  enableConversationManagement?: boolean;
  conversationTimeout?: number;
  maxMessagesPerConversation?: number;
  historyLength?: number;
}

export interface HandoffRequest {
  id?: string;
  conversationId: string;
  userId: string;
  reason: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'assigned' | 'active' | 'resolved' | 'cancelled';
  agentId?: string;
  metadata?: any;
  createdAt: Date;
  updatedAt?: Date;
}

export interface AgentProfile {
  id: string;
  name: string;
  email: string;
  status: 'online' | 'offline' | 'busy';
  skills: string[];
  maxConcurrentChats: number;
  currentChatCount: number;
}

export interface MessageFeedback {
  id?: string;
  messageId: string;
  conversationId: string;
  userId: string;
  rating: 'positive' | 'negative';
  category?: string;
  comment?: string;
  suggestedImprovement?: string;
  createdAt: Date;
}

export interface KnowledgeDocument {
  id: string;
  title: string;
  content: string;
  metadata: Record<string, any>;
  embeddings?: number[];
  lastModified: Date;
  source: string;
}

export interface CompanyAnalytics {
  conversations: {
    total: number;
    open: number;
    closed: number;
  };
  users: {
    total_active_users: number;
  };
  messages: {
    total: number;
    user_messages_total: number;
    assistant_messages_total: number;
    agent_messages_total: number;
  };
  feedback: {
    total: number;
    likes: number;
    dislikes: number;
  };
}


