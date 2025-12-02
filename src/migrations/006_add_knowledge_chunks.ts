import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ============================================================================
  // CREATE KNOWLEDGE CHUNKS TABLE
  // ============================================================================
  // This table stores text chunks from knowledge items with their embeddings.
  // Each document can have multiple chunks for better semantic search on large content.
  // Chunks are created during ingestion and searched independently via vector similarity.
  // Uses text-embedding-3-large model which produces 3072-dimensional vectors.

  await knex.schema.createTable('vezlo_knowledge_chunks', (table) => {
    table.bigIncrements('id').primary();
    table.uuid('uuid').defaultTo(knex.raw('gen_random_uuid()')).unique().notNullable();
    
    // Foreign key to parent document
    table.bigInteger('document_id')
      .notNullable()
      .references('id')
      .inTable('vezlo_knowledge_items')
      .onDelete('CASCADE')
      .comment('Parent knowledge item');
    
    // Chunk content and metadata
    table.text('chunk_text').notNullable().comment('Text content of this chunk');
    table.integer('chunk_index').notNullable().comment('Position of chunk in document (0-based)');
    table.integer('start_char').comment('Starting character position in original content');
    table.integer('end_char').comment('Ending character position in original content');
    table.integer('token_count').comment('Approximate token count for this chunk');
    
    // Vector embedding for semantic search (3072 dimensions for text-embedding-3-large)
    table.specificType('embedding', 'vector(3072)').comment('OpenAI text-embedding-3-large embeddings for semantic search');
    
    // Metadata and timestamps
    table.jsonb('metadata').defaultTo('{}').comment('Flexible metadata storage (e.g., page numbers, sections)');
    table.timestamp('processed_at', { useTz: true }).comment('When embedding was generated');
    table.timestamps(true, true); // created_at, updated_at with timezone
  });

  // ============================================================================
  // CREATE INDEXES FOR CHUNKS TABLE
  // ============================================================================

  // Standard indexes
  await knex.schema.raw('CREATE INDEX IF NOT EXISTS idx_vezlo_chunks_uuid ON vezlo_knowledge_chunks(uuid)');
  await knex.schema.raw('CREATE INDEX IF NOT EXISTS idx_vezlo_chunks_document_id ON vezlo_knowledge_chunks(document_id)');
  await knex.schema.raw('CREATE INDEX IF NOT EXISTS idx_vezlo_chunks_chunk_index ON vezlo_knowledge_chunks(document_id, chunk_index)');
  
  // Vector similarity index for semantic search
  // NOTE: pgvector HNSW/ivfflat indexes typically support up to 2000 dimensions
  // text-embedding-3-large produces 3072 dimensions
  // If index creation fails, vector search will still work (sequential scan, slower)
  // For production with 3072-dim vectors, consider pgvector 0.5.0+ or alternative vector DBs
  await knex.raw(`
    DO $$
    BEGIN
      BEGIN
        CREATE INDEX idx_vezlo_chunks_embedding 
        ON vezlo_knowledge_chunks USING hnsw (embedding vector_cosine_ops)
        WHERE embedding IS NOT NULL;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'HNSW index creation skipped: % (Vector search will use sequential scan)', SQLERRM;
      END;
    END $$;
  `);

  // GIN index for full-text keyword search (optimized for large datasets)
  await knex.schema.raw(`
    CREATE INDEX IF NOT EXISTS idx_vezlo_chunks_chunk_text_gin 
    ON vezlo_knowledge_chunks USING gin (to_tsvector('english', chunk_text))
  `);

  // ============================================================================
  // CREATE INSERT RPC FUNCTION FOR PROPER VECTOR HANDLING
  // ============================================================================
  // Supabase client doesn't handle vector type insertion properly via regular insert
  // This RPC function ensures embeddings are stored as proper vector type
  // Uses vezlo_ prefix to match naming convention
  
  await knex.raw(`
    CREATE OR REPLACE FUNCTION vezlo_insert_knowledge_chunk(
      p_document_id bigint,
      p_chunk_text text,
      p_chunk_index int,
      p_start_char int,
      p_end_char int,
      p_token_count int,
      p_embedding text,
      p_processed_at timestamptz
    )
    RETURNS bigint
    LANGUAGE plpgsql
    AS $$
    DECLARE
      new_id bigint;
    BEGIN
      INSERT INTO vezlo_knowledge_chunks (
        document_id,
        chunk_text,
        chunk_index,
        start_char,
        end_char,
        token_count,
        embedding,
        processed_at,
        metadata
      ) VALUES (
        p_document_id,
        p_chunk_text,
        p_chunk_index,
        p_start_char,
        p_end_char,
        p_token_count,
        p_embedding::vector(3072),
        p_processed_at,
        '{}'::jsonb
      )
      RETURNING id INTO new_id;
      
      RETURN new_id;
    END;
    $$;
  `);

  // ============================================================================
  // DROP OLD RPC FUNCTION AND CREATE NEW CHUNK-BASED RPC FUNCTION
  // ============================================================================
  // Drop the old match_vezlo_knowledge function (created in migration 004)
  // and replace it with the new chunk-based function
  // Uses vezlo_ prefix to match naming convention
  
  await knex.raw('DROP FUNCTION IF EXISTS match_vezlo_knowledge');

  // ============================================================================
  // CREATE NEW RPC FUNCTION FOR CHUNK-BASED VECTOR SEARCH
  // ============================================================================
  // This function searches through chunks and joins back to parent documents
  // for metadata. It uses pgvector's <=> operator for efficient nearest-neighbor
  // search directly in the database. Uses 3072-dimensional vectors for text-embedding-3-large.

  await knex.raw(`
    CREATE OR REPLACE FUNCTION vezlo_match_knowledge_chunks(
      query_embedding text,
      match_threshold float DEFAULT 0.5,
      match_count int DEFAULT 10,
      filter_company_id bigint DEFAULT NULL
    )
    RETURNS TABLE (
      chunk_id bigint,
      chunk_uuid uuid,
      document_id bigint,
      document_uuid uuid,
      chunk_text text,
      chunk_index int,
      start_char int,
      end_char int,
      token_count int,
      document_title text,
      document_description text,
      document_type text,
      document_metadata jsonb,
      chunk_metadata jsonb,
      company_id bigint,
      similarity float
    )
    LANGUAGE plpgsql
    AS $$
    BEGIN
      RETURN QUERY
      SELECT
        c.id AS chunk_id,
        c.uuid AS chunk_uuid,
        c.document_id,
        ki.uuid AS document_uuid,
        c.chunk_text,
        c.chunk_index,
        c.start_char,
        c.end_char,
        c.token_count,
        ki.title AS document_title,
        ki.description AS document_description,
        ki.type AS document_type,
        ki.metadata AS document_metadata,
        c.metadata AS chunk_metadata,
        ki.company_id,
        1 - (c.embedding <=> query_embedding::vector(3072)) AS similarity
      FROM vezlo_knowledge_chunks c
      INNER JOIN vezlo_knowledge_items ki ON c.document_id = ki.id
      WHERE c.embedding IS NOT NULL
        AND (filter_company_id IS NULL OR ki.company_id = filter_company_id)
        AND (1 - (c.embedding <=> query_embedding::vector(3072))) >= match_threshold
      ORDER BY c.embedding <=> query_embedding::vector(3072)
      LIMIT match_count;
    END;
    $$;
  `);

}

export async function down(knex: Knex): Promise<void> {
  // Drop the new RPC functions
  await knex.raw('DROP FUNCTION IF EXISTS vezlo_match_knowledge_chunks');
  await knex.raw('DROP FUNCTION IF EXISTS vezlo_insert_knowledge_chunk');

  // Drop indexes first
  await knex.schema.raw('DROP INDEX IF EXISTS idx_vezlo_chunks_chunk_text_gin');
  await knex.schema.raw('DROP INDEX IF EXISTS idx_vezlo_chunks_embedding');
  await knex.schema.raw('DROP INDEX IF EXISTS idx_vezlo_chunks_chunk_index');
  await knex.schema.raw('DROP INDEX IF EXISTS idx_vezlo_chunks_document_id');
  await knex.schema.raw('DROP INDEX IF EXISTS idx_vezlo_chunks_uuid');

  // Drop the chunks table (CASCADE will handle foreign keys)
  await knex.schema.dropTableIfExists('vezlo_knowledge_chunks');

  // ============================================================================
  // RESTORE OLD RPC FUNCTION (from migration 004)
  // ============================================================================
  // Recreate the old match_vezlo_knowledge function that searches the parent table
  
  await knex.raw(`
    CREATE OR REPLACE FUNCTION match_vezlo_knowledge(
      query_embedding vector(1536),
      match_threshold float DEFAULT 0.5,
      match_count int DEFAULT 10,
      filter_company_id bigint DEFAULT NULL
    )
    RETURNS TABLE (
      id bigint,
      uuid uuid,
      title text,
      description text,
      content text,
      type text,
      metadata jsonb,
      embedding vector(1536),
      company_id bigint,
      similarity float
    )
    LANGUAGE plpgsql
    AS $$
    BEGIN
      RETURN QUERY
      SELECT
        ki.id,
        ki.uuid,
        ki.title,
        ki.description,
        ki.content,
        ki.type,
        ki.metadata,
        ki.embedding,
        ki.company_id,
        1 - (ki.embedding <=> query_embedding) AS similarity
      FROM vezlo_knowledge_items ki
      WHERE ki.embedding IS NOT NULL
        AND (filter_company_id IS NULL OR ki.company_id = filter_company_id)
        AND (1 - (ki.embedding <=> query_embedding)) >= match_threshold
      ORDER BY ki.embedding <=> query_embedding
      LIMIT match_count;
    END;
    $$;
  `);
}

