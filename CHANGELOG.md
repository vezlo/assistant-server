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
