import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ============================================================================
  // DROP BTREE INDEX ON CONTENT COLUMN
  // ============================================================================
  // The btree index on content column causes errors when content exceeds
  // PostgreSQL's btree index size limit (2704 bytes). We already have a
  // GIN full-text search index that handles content search efficiently.
  // Content column is still needed for citations and display purposes.
  
  await knex.schema.raw('DROP INDEX IF EXISTS idx_vezlo_knowledge_content');
}

export async function down(knex: Knex): Promise<void> {
  // Recreate the index if rolling back (though it may fail on large content)
  await knex.schema.raw('CREATE INDEX IF NOT EXISTS idx_vezlo_knowledge_content ON vezlo_knowledge_items(content) WHERE content IS NOT NULL');
}




