import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ============================================================================
  // CREATE RPC FUNCTION FOR OPTIMIZED VECTOR SEARCH
  // ============================================================================
  // This function uses pgvector's <=> operator for efficient nearest-neighbor search
  // directly in the database, avoiding the need to fetch all records and calculate
  // similarity in Node.js. This provides significant performance improvements,
  // especially for large knowledge bases.
  
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

export async function down(knex: Knex): Promise<void> {
  // Drop the RPC function if rolling back
  await knex.raw('DROP FUNCTION IF EXISTS match_vezlo_knowledge');
}

