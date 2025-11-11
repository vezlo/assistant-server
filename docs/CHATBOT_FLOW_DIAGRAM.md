# Vezlo AI Assistant - Chatbot Flow Documentation

## Detailed Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        USER QUERY ARRIVES                                │
│                   POST /api/messages/:uuid/generate                      │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     LOAD CONVERSATION CONTEXT                            │
│  • Fetch conversation by UUID                                           │
│  • Retrieve last N messages (CHAT_HISTORY_LENGTH=2)                    │
│  • Extract company_id (integer) for filtering                           │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                  🧭 INTENT CLASSIFICATION (OpenAI)                       │
│  Model: AI_MODEL (gpt-4o-mini)                                          │
│  Input: User query + conversation history                               │
│  Output: Intent + Reason + Needs Guardrail + Contact Email             │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                ┌────────────────┴────────────────┐
                │                                 │
                ▼                                 ▼
    ┌─────────────────────┐         ┌─────────────────────────┐
    │  SIMPLE INTENTS     │         │  KNOWLEDGE INTENT       │
    │  (Short-circuit)    │         │  (RAG Pipeline)         │
    └─────────────────────┘         └─────────────────────────┘
                │                                 │
    ┌───────────┴───────────┐                    │
    │                       │                    │
    ▼                       ▼                    ▼
┌─────────┐         ┌──────────────┐    ┌───────────────────┐
│greeting │         │ personality  │    │ KNOWLEDGE LOOKUP  │
│         │         │              │    └─────────┬─────────┘
│Response:│         │Response:     │              │
│"Hello!" │         │"I'm [NAME]"  │              ▼
└─────────┘         └──────────────┘    ┌─────────────────────────────┐
                                        │  Generate Query Embedding    │
    ▼                       ▼            │  (OpenAI Embeddings API)    │
┌─────────┐         ┌──────────────┐    └─────────┬───────────────────┘
│clarifi- │         │ guardrail    │              │
│cation   │         │              │              ▼
│         │         │Response:     │    ┌─────────────────────────────┐
│Response:│         │"I can't      │    │  HYBRID SEARCH (PostgreSQL) │
│"Could   │         │share that"   │    │  • Semantic (cosine sim)    │
│you      │         └──────────────┘    │  • Keyword (tsvector)       │
│clarify?"│                              │  • Filter by company_id     │
└─────────┘                 ▼            │  • Threshold: 0.5           │
                    ┌──────────────┐    │  • Limit: 3 results         │
    ▼               │ human_support│    └─────────┬───────────────────┘
┌─────────┐         │              │              │
│ALL      │         │Response:     │    ┌─────────┴─────────┐
│INTENTS  │         │"Please       │    │                   │
│         │         │provide email"│    ▼                   ▼
│Save to  │         └──────────────┘ ┌──────┐         ┌──────────┐
│database │                          │FOUND │         │NOT FOUND │
│& return │                 ▼         │      │         │          │
│to user  │         ┌──────────────┐ └───┬──┘         └────┬─────┘
└─────────┘         │human_support_│     │                 │
                    │email         │     │                 │
                    │              │     ▼                 ▼
                    │Response:     │ ┌─────────┐    ┌────────────┐
                    │"Thank you!   │ │RESULTS  │    │FALLBACK    │
                    │Agent will    │ │CONTEXT  │    │RESPONSE    │
                    │contact you"  │ └────┬────┘    └─────┬──────┘
                    └──────────────┘      │               │
                                          ▼               ▼
                                ┌──────────────────────────────┐
                                │  AI RESPONSE GENERATION      │
                                │  (OpenAI Chat Completion)    │
                                │                              │
                                │  Model: AI_MODEL             │
                                │  Temperature: AI_TEMPERATURE │
                                │  Max Tokens: AI_MAX_TOKENS   │
                                │                              │
                                │  System Prompt includes:     │
                                │  • Platform description      │
                                │  • Core capabilities         │
                                │  • Security guardrails       │
                                │  • Knowledge base context    │
                                │  • Custom instructions       │
                                └──────────────┬───────────────┘
                                               │
                                               ▼
                                ┌──────────────────────────────┐
                                │  SAVE & RETURN RESPONSE      │
                                │  • Save assistant message    │
                                │  • Update conversation       │
                                │  • Return to user            │
                                └──────────────────────────────┘
```

## Lightweight Flow Diagram

```
USER QUERY
    │
    ▼
LOAD CONTEXT (History + Company)
    │
    ▼
🧭 INTENT CLASSIFIER (OpenAI)
    │
    ├─────────────────────┬──────────────────┐
    │                     │                  │
    ▼                     ▼                  ▼
SIMPLE                KNOWLEDGE          GUARDRAIL
(greeting,            (RAG Flow)         (Security)
personality,              │                  │
clarification,            ▼                  │
support)          Generate Embedding         │
    │                     │                  │
    │                     ▼                  │
    │             Hybrid Search              │
    │             (Semantic + Keyword)       │
    │                     │                  │
    │             ┌───────┴────────┐         │
    │             ▼                ▼         │
    │         Found            Not Found     │
    │             │                │         │
    │             ▼                ▼         │
    │      Use Results      Fallback        │
    │             │          Message         │
    │             └────┬─────────┘           │
    │                  ▼                     │
    └──────────► AI RESPONSE ◄──────────────┘
                 (OpenAI)
                     │
                     ▼
              SAVE & RETURN
```

## Key Components

### 1. Intent Classification
**Purpose:** Optimize resource usage by identifying query type before expensive RAG operations

**Intents:**
- `knowledge`: Questions requiring knowledge base lookup (triggers RAG)
- `greeting`: Simple greetings (direct response: "Hello!")
- `personality`: Questions about assistant identity (direct response with name)
- `clarification`: Unclear/incomplete queries (ask for clarification)
- `guardrail`: Requests for sensitive information (security refusal)
- `human_support_request`: User wants human agent (ask for email)
- `human_support_email`: User provides email (confirm handoff)

**Benefits:**
- Reduces OpenAI API calls for simple queries
- Prevents unnecessary database searches
- Improves response time for common interactions

### 2. RAG (Retrieval-Augmented Generation) Pipeline
**Triggered by:** `knowledge` intent only

**Steps:**
1. **Generate Embedding:** Convert query to vector (OpenAI Embeddings API)
2. **Hybrid Search:**
   - Semantic: Cosine similarity between embeddings
   - Keyword: PostgreSQL full-text search (tsvector)
   - Company Filter: Only search within user's organization
   - Threshold: 0.5 (similarity score)
   - Limit: Top 3 results
3. **Context Assembly:** Build system prompt with retrieved knowledge
4. **AI Generation:** OpenAI generates response using context

### 3. Security Guardrails
**Implemented at two levels:**

**Intent Classifier:**
- Detects requests for API keys, passwords, tokens, env vars
- Returns `guardrail` intent

**System Prompt:**
- Explicit instructions to never expose secrets
- Safe architectural guidance allowed
- Redaction of sensitive configuration

**Refusal Message:**
> "I can help with documentation or implementation guidance, but I can't share credentials or confidential configuration. Please contact your system administrator or support for access."

### 4. Configuration (Environment Variables)
```
AI_MODEL=gpt-4o-mini              # Model for all OpenAI calls
AI_TEMPERATURE=0.7                # Response creativity (0-1)
AI_MAX_TOKENS=1000                # Maximum response length
CHAT_HISTORY_LENGTH=2             # Messages for context
ORGANIZATION_NAME=Your Organization
ASSISTANT_NAME=AI Assistant
PLATFORM_DESCRIPTION=...          # Custom platform description
```

### 5. Chat History Context
- Retrieves last N messages (default: 2)
- Provides conversation continuity
- Used by both intent classifier and response generator
- Enables multi-turn interactions (e.g., email collection)

## Flow Statistics

### API Calls per Query Type

| Query Type | Intent Classification | Embedding Generation | AI Response | Total |
|------------|----------------------|---------------------|-------------|-------|
| Greeting | ✓ | - | - | 1 |
| Personality | ✓ | - | - | 1 |
| Clarification | ✓ | - | - | 1 |
| Guardrail | ✓ | - | - | 1 |
| Support Request | ✓ | - | - | 1 |
| Knowledge (found) | ✓ | ✓ | ✓ | 3 |
| Knowledge (not found) | ✓ | ✓ | ✓ | 3 |

### Performance Optimization
- **Before Intent Classifier:** Every query → 3 API calls (embed + search + generate)
- **After Intent Classifier:** Simple queries → 1 API call (60-80% reduction for typical usage)

## Database Schema (Relevant Tables)

### `vezlo_knowledge`
- `id` (integer): Primary key
- `uuid` (uuid): External identifier
- `company_id` (integer): Organization filter
- `title`, `description`, `content`: Knowledge content
- `embedding` (vector): Semantic search vector
- `metadata` (jsonb): Additional data

### `vezlo_conversations`
- `id` (integer): Primary key
- `uuid` (uuid): External identifier
- `company_id` (integer): Organization filter
- `creator_id` (integer): User reference
- `title`: Conversation name

### `vezlo_messages`
- `id` (integer): Primary key
- `uuid` (uuid): External identifier
- `conversation_id` (integer): Parent conversation
- `sender_type`: 'user' | 'assistant'
- `content`: Message text
- `parent_message_id`: Threading support

## Error Handling

### No Knowledge Found
When RAG search returns 0 results:
> "I'm sorry, I couldn't find the requested information in my knowledge base. Please contact support for further assistance or check if the information might be available in other resources."

### LLM Behavior
- System prompt instructs LLM to ONLY use knowledge base context
- If no context provided, LLM must use fallback message
- Prevents hallucination from general training knowledge

## Future Improvements

### 1. Streaming Responses (Planned)
- Server-Sent Events (SSE)
- Real-time token streaming
- Better UX for long responses

### 2. Knowledge Chunks Architecture (Planned)
- New `knowledge_chunks` table
- Chunk-level embeddings
- More precise source citations
- Better relevance scoring

### 3. Manual Tool Calling (Discussed)
- Intent dispatcher to server-side functions
- Extensible for future capabilities (scheduling, ticketing, etc.)
- Full control over execution flow

---

**Generated:** November 11, 2025  
**Version:** assistant-server v2.0.1  
**Phase:** 3 (Intent Classification + RAG + Guardrails)

