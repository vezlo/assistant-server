-- Vezlo AI Assistant - Database Schema
-- Simplified schema dump with all tables, indexes, and constraints
-- Run this in your Supabase SQL Editor

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- KNEX MIGRATION TRACKING TABLES
-- ============================================================================

-- Knex.js migration tracking table
CREATE TABLE IF NOT EXISTS knex_migrations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  batch INTEGER NOT NULL,
  migration_time TIMESTAMPTZ DEFAULT NOW()
);

-- Knex.js migration lock table
CREATE TABLE IF NOT EXISTS knex_migrations_lock (
  index INTEGER PRIMARY KEY,
  is_locked INTEGER
);

-- Insert initial migration entries (marks migrations as already run)
-- This ensures Knex knows the schema was created manually
-- Only insert if they don't already exist
INSERT INTO knex_migrations (name, batch, migration_time) 
SELECT '001_initial_schema.ts', 1, NOW()
WHERE NOT EXISTS (SELECT 1 FROM knex_migrations WHERE name = '001_initial_schema.ts');

INSERT INTO knex_migrations (name, batch, migration_time) 
SELECT '002_multitenancy_schema.ts', 1, NOW()
WHERE NOT EXISTS (SELECT 1 FROM knex_migrations WHERE name = '002_multitenancy_schema.ts');

INSERT INTO knex_migrations (name, batch, migration_time) 
SELECT '003_drop_content_index.ts', 1, NOW()
WHERE NOT EXISTS (SELECT 1 FROM knex_migrations WHERE name = '003_drop_content_index.ts');

-- Set migration lock to unlocked (0 = unlocked, 1 = locked)
INSERT INTO knex_migrations_lock (index, is_locked) 
VALUES (1, 0)
ON CONFLICT (index) DO UPDATE SET is_locked = 0;

-- ============================================================================
-- USERS & COMPANIES SCHEMA (Multi-tenancy)
-- ============================================================================

CREATE TABLE IF NOT EXISTS vezlo_users (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  user_type TEXT DEFAULT 'internal', -- internal, external, admin
  token_updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS vezlo_companies (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  name TEXT NOT NULL,
  domain TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS vezlo_user_company_profiles (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  user_id BIGINT NOT NULL REFERENCES vezlo_users(id) ON DELETE CASCADE,
  company_id BIGINT NOT NULL REFERENCES vezlo_companies(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'user', -- admin, user, viewer
  status TEXT DEFAULT 'active', -- active, inactive
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, company_id)
);

CREATE TABLE IF NOT EXISTS vezlo_api_keys (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  company_id BIGINT NOT NULL REFERENCES vezlo_companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ============================================================================
-- CONVERSATIONS & MESSAGES SCHEMA
-- ============================================================================

CREATE TABLE IF NOT EXISTS vezlo_conversations (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  company_id BIGINT, -- Foreign key added in migration 002
  creator_id BIGINT NOT NULL,
  title TEXT NOT NULL,
  message_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  deleted_at TIMESTAMPTZ -- Soft delete
);

CREATE TABLE IF NOT EXISTS vezlo_messages (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  conversation_id BIGINT NOT NULL REFERENCES vezlo_conversations(id) ON DELETE CASCADE,
  parent_message_id BIGINT REFERENCES vezlo_messages(id), -- For regeneration chains
  type TEXT NOT NULL, -- user, assistant, system
  content TEXT NOT NULL,
  status TEXT DEFAULT 'completed', -- generating, completed, stopped, failed
  metadata JSONB DEFAULT '{}', -- For tool_calls, tool_results, etc.
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS vezlo_message_feedback (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  message_id BIGINT NOT NULL REFERENCES vezlo_messages(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL, -- Foreign key added in migration 002
  company_id BIGINT, -- Added in migration 002 with foreign key
  rating TEXT NOT NULL, -- positive, negative
  category TEXT,
  comment TEXT,
  suggested_improvement TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- KNOWLEDGE BASE SCHEMA
-- ============================================================================

CREATE TABLE IF NOT EXISTS vezlo_knowledge_items (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  parent_id BIGINT REFERENCES vezlo_knowledge_items(id), -- Hierarchical structure
  company_id BIGINT, -- Foreign key added in migration 002
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL, -- folder, document, file, url, url_directory
  content TEXT, -- For document type
  file_url TEXT, -- For file/url types
  file_size BIGINT, -- File size in bytes
  file_type TEXT, -- MIME type for files
  metadata JSONB DEFAULT '{}', -- Flexible metadata storage
  embedding vector(1536), -- OpenAI embeddings for search
  processed_at TIMESTAMPTZ, -- When embedding was generated
  created_by BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ============================================================================
-- ADD FOREIGN KEY CONSTRAINTS (Matching Migration 002)
-- These constraints use explicit names matching Knex migration naming convention
-- for proper rollback compatibility: {table}_{column}_foreign
-- ============================================================================

-- Add foreign keys to vezlo_conversations (added in migration 002)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vezlo_conversations_company_id_foreign') THEN
    ALTER TABLE vezlo_conversations 
      ADD CONSTRAINT vezlo_conversations_company_id_foreign 
      FOREIGN KEY (company_id) REFERENCES vezlo_companies(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add foreign keys to vezlo_knowledge_items (added in migration 002)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vezlo_knowledge_items_company_id_foreign') THEN
    ALTER TABLE vezlo_knowledge_items 
      ADD CONSTRAINT vezlo_knowledge_items_company_id_foreign 
      FOREIGN KEY (company_id) REFERENCES vezlo_companies(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add foreign keys to vezlo_message_feedback (added in migration 002)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vezlo_message_feedback_user_id_foreign') THEN
    ALTER TABLE vezlo_message_feedback 
      ADD CONSTRAINT vezlo_message_feedback_user_id_foreign 
      FOREIGN KEY (user_id) REFERENCES vezlo_users(id) ON DELETE CASCADE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vezlo_message_feedback_company_id_foreign') THEN
    ALTER TABLE vezlo_message_feedback 
      ADD CONSTRAINT vezlo_message_feedback_company_id_foreign 
      FOREIGN KEY (company_id) REFERENCES vezlo_companies(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Users indexes
CREATE INDEX IF NOT EXISTS idx_vezlo_users_uuid ON vezlo_users(uuid);
CREATE INDEX IF NOT EXISTS idx_vezlo_users_email ON vezlo_users(email);
CREATE INDEX IF NOT EXISTS idx_vezlo_users_user_type ON vezlo_users(user_type);
CREATE INDEX IF NOT EXISTS idx_vezlo_users_token_updated_at ON vezlo_users(token_updated_at);

-- Companies indexes
CREATE INDEX IF NOT EXISTS idx_vezlo_companies_uuid ON vezlo_companies(uuid);
CREATE INDEX IF NOT EXISTS idx_vezlo_companies_domain ON vezlo_companies(domain);

-- User company profiles indexes
CREATE INDEX IF NOT EXISTS idx_vezlo_user_company_profiles_uuid ON vezlo_user_company_profiles(uuid);
CREATE INDEX IF NOT EXISTS idx_vezlo_user_company_profiles_user_id ON vezlo_user_company_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_vezlo_user_company_profiles_company_id ON vezlo_user_company_profiles(company_id);
CREATE INDEX IF NOT EXISTS idx_vezlo_user_company_profiles_role ON vezlo_user_company_profiles(role);
CREATE INDEX IF NOT EXISTS idx_vezlo_user_company_profiles_status ON vezlo_user_company_profiles(status);

-- API keys indexes
CREATE INDEX IF NOT EXISTS idx_vezlo_api_keys_uuid ON vezlo_api_keys(uuid);
CREATE INDEX IF NOT EXISTS idx_vezlo_api_keys_company_id ON vezlo_api_keys(company_id);
CREATE INDEX IF NOT EXISTS idx_vezlo_api_keys_key_hash ON vezlo_api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_vezlo_api_keys_expires_at ON vezlo_api_keys(expires_at);

-- Conversations indexes
CREATE INDEX IF NOT EXISTS idx_vezlo_conversations_uuid ON vezlo_conversations(uuid);
CREATE INDEX IF NOT EXISTS idx_vezlo_conversations_company_id ON vezlo_conversations(company_id);
CREATE INDEX IF NOT EXISTS idx_vezlo_conversations_creator_id ON vezlo_conversations(creator_id);
CREATE INDEX IF NOT EXISTS idx_vezlo_conversations_deleted ON vezlo_conversations(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_vezlo_conversations_updated_at ON vezlo_conversations(updated_at DESC);

-- Messages indexes
CREATE INDEX IF NOT EXISTS idx_vezlo_messages_uuid ON vezlo_messages(uuid);
CREATE INDEX IF NOT EXISTS idx_vezlo_messages_conversation_id ON vezlo_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_vezlo_messages_parent_id ON vezlo_messages(parent_message_id);
CREATE INDEX IF NOT EXISTS idx_vezlo_messages_type ON vezlo_messages(type);
CREATE INDEX IF NOT EXISTS idx_vezlo_messages_status ON vezlo_messages(status);
CREATE INDEX IF NOT EXISTS idx_vezlo_messages_created_at ON vezlo_messages(created_at DESC);

-- Message feedback indexes
CREATE INDEX IF NOT EXISTS idx_vezlo_feedback_uuid ON vezlo_message_feedback(uuid);
CREATE INDEX IF NOT EXISTS idx_vezlo_feedback_message_id ON vezlo_message_feedback(message_id);
CREATE INDEX IF NOT EXISTS idx_vezlo_feedback_user_id ON vezlo_message_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_vezlo_feedback_company_id ON vezlo_message_feedback(company_id);
CREATE INDEX IF NOT EXISTS idx_vezlo_feedback_rating ON vezlo_message_feedback(rating);

-- Knowledge items indexes
CREATE INDEX IF NOT EXISTS idx_vezlo_knowledge_uuid ON vezlo_knowledge_items(uuid);
CREATE INDEX IF NOT EXISTS idx_vezlo_knowledge_company_id ON vezlo_knowledge_items(company_id);
CREATE INDEX IF NOT EXISTS idx_vezlo_knowledge_parent_id ON vezlo_knowledge_items(parent_id);
CREATE INDEX IF NOT EXISTS idx_vezlo_knowledge_type ON vezlo_knowledge_items(type);
CREATE INDEX IF NOT EXISTS idx_vezlo_knowledge_created_by ON vezlo_knowledge_items(created_by);
CREATE INDEX IF NOT EXISTS idx_vezlo_knowledge_created_at ON vezlo_knowledge_items(created_at DESC);

-- Full-text search index for knowledge items
CREATE INDEX IF NOT EXISTS idx_vezlo_knowledge_search
ON vezlo_knowledge_items USING gin(to_tsvector('english', title || ' ' || COALESCE(description, '') || ' ' || COALESCE(content, '')));

-- Vector similarity index for semantic search (only for items with content)
CREATE INDEX IF NOT EXISTS idx_vezlo_knowledge_embedding
ON vezlo_knowledge_items USING ivfflat (embedding vector_cosine_ops)
WHERE embedding IS NOT NULL;

-- Sparse indexes for better performance
-- Note: idx_vezlo_knowledge_content was removed in migration 003
-- because btree indexes fail on large content (>2704 bytes).
-- Full-text search is handled by the GIN index above.

CREATE INDEX IF NOT EXISTS idx_vezlo_knowledge_file_url
ON vezlo_knowledge_items(file_url) WHERE file_url IS NOT NULL;

-- ============================================================================
-- ROW LEVEL SECURITY (Optional but Recommended)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE vezlo_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE vezlo_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE vezlo_user_company_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vezlo_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE vezlo_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE vezlo_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE vezlo_message_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE vezlo_knowledge_items ENABLE ROW LEVEL SECURITY;

-- Policies for service role access (full access)
CREATE POLICY "Service role can access all users" ON vezlo_users
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can access all companies" ON vezlo_companies
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can access all user company profiles" ON vezlo_user_company_profiles
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can access all API keys" ON vezlo_api_keys
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can access all conversations" ON vezlo_conversations
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can access all messages" ON vezlo_messages
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can access all feedback" ON vezlo_message_feedback
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can access all knowledge items" ON vezlo_knowledge_items
  FOR ALL USING (auth.role() = 'service_role');

-- Example company-based policies (uncomment and modify as needed)
-- CREATE POLICY "Users can access their company conversations" ON vezlo_conversations
--   FOR ALL USING (company_id = auth.jwt() ->> 'company_id');
--
-- CREATE POLICY "Users can access their company knowledge" ON vezlo_knowledge_items
--   FOR ALL USING (company_id = auth.jwt() ->> 'company_id');
