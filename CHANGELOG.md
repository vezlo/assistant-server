## [2.8.0] - 2025-12-17

### Added
- **Citation System**: New citation API endpoint `GET /api/knowledge/citations/:uuid/context` for fetching source document content
- **CitationService**: Service to retrieve full document content or contextual chunks with adjacent context
- **Sources in AI Responses**: AI streaming responses now include `sources` array with document UUIDs and titles in final chunk
- **Smart Content Retrieval**: Citation API automatically uses full content if available, otherwise fetches relevant chunks ±2 adjacent chunks for context

### Changed
- AI response streaming includes sources array when knowledge base results are used
- Citation API returns `content` field instead of `chunks` array for simpler frontend handling
- Sources only sent when knowledge results are actually provided to LLM

## [2.7.0] - 2025-12-16

### Added
- **Archive Conversations**: New `POST /api/conversations/:uuid/archive` endpoint to archive closed conversations
- **Status Filtering**: `GET /api/conversations` now supports `?status=active|archived` query parameter
- Database migration (009) adds `archived_at` timestamp column with index
- Archive realtime event publishing via Socket.IO

### Changed
- Conversation status calculation now includes `archived` state (archived > closed > in_progress > open)
- `archived_at` field added to all conversation response schemas
- Both `api/index.ts` and `server.ts` routes updated with archive endpoint
- Swagger documentation updated with archive endpoint and status filter

## [2.6.0] - 2025-12-12

### Added
- **Analytics API**: New `GET /api/company/analytics` endpoint for company-wide analytics
- **RPC Functions**: Added `get_conversation_stats()` and `get_feedback_stats()` database functions (Migration 008)
- **Message Statistics**: Comprehensive message breakdown by type (user, assistant, agent) excluding system messages
- **Company Analytics**: Returns conversation stats, user counts, message volume, and feedback sentiment

### Changed
- Analytics endpoint requires authentication and returns company-scoped data
- Total message count excludes system messages (e.g., "user joined", "conversation closed")
- Swagger documentation updated with complete analytics API schema

## [2.5.1] - 2025-12-11

### Changed
- Optimized system prompt guidelines (reduced from 10 to 6 rules for better LLM comprehension)
- Improved prompt structure for clearer knowledge base vs chat history usage

## [2.5.0] - 2025-12-09

### Added
- Flexible knowledge ingestion: `POST /api/knowledge/items` now accepts raw content, pre-chunked data, or chunks with embeddings
- Support for line-based chunking metadata (startLine, endLine) in chunk payloads
- API schema updated to document `chunks` array and `hasEmbeddings` flag in Swagger documentation

### Changed
- Knowledge base service handles both character-based (server-side) and line-based (client-side) chunking
- `POST /api/knowledge/items` validation: now accepts `content` OR `chunks` array for document type

## [2.4.0] - 2025-12-05

### Added
- Server-Sent Events (SSE) streaming for all AI responses (intent-based and knowledge-based)
- Feedback API: `DELETE /api/feedback/:uuid` for undoing feedback (Public API)
- `updated_at` column in `vezlo_message_feedback` table (Migration 007)

### Changed
- `POST /api/messages/:uuid/generate` now streams responses via SSE instead of returning full JSON
- Feedback APIs (`POST /api/feedback`, `DELETE /api/feedback/:uuid`) are now public (no authentication required)
- API timeout increased to 60 seconds (matches Vercel Pro plan limit)
- Compression middleware now skips `text/event-stream` responses to prevent SSE buffering

### Fixed
- Frontend UI "jerk" issue when streaming completes
- Knowledge base queries now properly stream responses
- Message UUID race condition in feedback system resolved

## [2.3.0] - 2025-12-02

### Breaking Changes
- **Enhanced RAG Architecture**: New chunk-based semantic search with adjacent retrieval
- **Database Schema**: Migration 006 adds `vezlo_knowledge_chunks` table and new RPC functions
- **Embedding Model**: Upgraded to OpenAI `text-embedding-3-large` (3072 dimensions)

### Added
- Chunk-based knowledge storage with overlap for better context preservation
- Adjacent chunk retrieval (±2 chunks) for complete code/function understanding
- Top-k search strategy (no threshold) for consistent results
- New RPC functions: `vezlo_insert_knowledge_chunk`, `vezlo_match_knowledge_chunks`
- HNSW vector index with graceful fallback for high-dimensional embeddings
- Configurable embedding model constants (`EMBEDDING_MODEL`, `EMBEDDING_DIMENSIONS`)

### Changed
- Search strategy: Top-5 semantic search + ±2 adjacent chunks + merge by document
- Removed keyword search and hybrid search (pure semantic now)
- Removed threshold-based filtering (top-k only)
- Intent classification now generates dynamic LLM responses (no hardcoded strings)
- Added "acknowledgment" intent for gratitude expressions

### Removed
- Keyword search functionality
- Hybrid search mode

## [2.2.2] - 2025-11-28

### Added
- Human agent API flow: `POST /api/conversations/:uuid/join`, `POST /api/conversations/:uuid/messages/agent`, `POST /api/conversations/:uuid/close`.
- Conversation status + system messages now broadcast via Supabase Realtime for agent handoff.

### Changed
- Documentation refreshed to highlight agent workflows and realtime requirements.

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.2.1] - 2025-11-17

### Added
- Docker entrypoint now runs default seeding and API key generation after migrations for parity with npm setup.
- README “Docker Setup” instructions detailing `.env` preparation and build/up workflow.

### Changed
- Setup wizard now runs migrations via Knex directly, ensuring global installs use the provided credentials without relying on `.env`.
- Generated `.env` now includes `JWT_SECRET`, `DEFAULT_ADMIN_*`, and `CHAT_HISTORY_LENGTH`.
- Packaged CLI detects compiled JS migrations automatically; Docker no longer installs `ts-node`.

### Fixed
- Global npm installs no longer fail due to missing migrations or ts-node dependency requirements.
- CLI migrations, seeding, and API key generation now behave consistently across local, Docker, and npm environments.

## [2.1.0] - 2025-11-11

### Added
- RPC-based vector search using pgvector's `<=>` operator for 10-100x performance improvement
- Intent classification service for intelligent query routing (greetings, personality, knowledge)
- Configurable chat history length via `CHAT_HISTORY_LENGTH` environment variable (default: 2)
- Centralized service initialization module for consistent configuration across deployment targets

### Changed
- Search parameters updated to industry standards: limit 5, threshold 0.5, semantic-only
- Optimized RAG pipeline with intent-based direct responses for non-knowledge queries
- System prompt improved with enhanced guardrails and generic organization support
- Database migration 004: Added `match_vezlo_knowledge()` RPC function

### Improved
- Reduced token usage with optimized chat history (10→2 messages)
- Faster semantic search with database-side similarity calculations
- Better response quality with increased context (3→5 knowledge results)

## [2.0.1] - 2025-11-07

### Changed
- Removed `idx_vezlo_knowledge_content` index from initial migration to avoid PostgreSQL btree size errors

### Fixed
- Fresh installs no longer create the `idx_vezlo_knowledge_content` index (migration 003 still drops it for existing databases)

## [2.0.0] - 2025-10-31

### Breaking Changes
- Introduced multi-tenancy; existing data is not auto-migrated.
- Updated auth model: endpoints now use a mix of JWT and API key; select public endpoints remain for the chat widget.
- Foreign keys refactored to `user_id`/`company_id` across core tables.

### Added
- Multi-tenancy tables: `vezlo_companies`, `vezlo_users`, `vezlo_user_company_profiles`, `vezlo_api_keys`.
- Authentication: JWT support, role-based access, company-scoped API keys.
- CLI: `vezlo-seed-default`, `vezlo-generate-key` (bin commands).

### Changed
- Database schema consolidated and simplified; added RLS and indexes.
- README updated; version bumped to 2.0.0.

### Removed
- Legacy single-tenant assumptions and redundant schema fields.

---

## [1.4.0] - 2024-01-XX

### Added
- Initial release with single-tenant support
- Conversation management
- Knowledge base functionality
- Message feedback system
- Vector search capabilities

### Changed
- Various improvements and bug fixes

### Fixed
- Various bug fixes and performance improvements
