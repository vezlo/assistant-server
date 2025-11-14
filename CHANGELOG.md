# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.2.0] - 2025-11-14

### Added
- Chunk-based knowledge storage with separate `vezlo_knowledge_chunks` table for scalable document processing
- Tree-sitter AST analysis for code files (Python, JavaScript, TypeScript, TSX) with function metadata extraction
- Hybrid search combining semantic and keyword search for improved accuracy
- New RPC functions: `insert_knowledge_chunk()` and `match_vezlo_knowledge_chunks()` for optimized chunk operations
- Configurable chunk size and overlap via `CHUNK_SIZE` and `CHUNK_OVERLAP` environment variables

### Changed
- Knowledge ingestion now creates chunks with embeddings stored in dedicated chunks table
- Semantic search operates on chunks instead of full documents for better precision
- Default search type changed to `hybrid` for optimal results
- Search threshold lowered to 0.20 for better recall with code/technical content
- Semantic search limit increased to 7 chunks for improved context

### Improved
- Better semantic matching for code-related queries through AST metadata enhancement
- Scalable architecture supporting large documents via chunking
- Enhanced search accuracy with hybrid semantic + keyword approach
- Code file analysis extracts function names, parameters, and docstrings for better searchability

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
