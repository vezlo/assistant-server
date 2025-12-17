import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('vezlo_conversations', (table) => {
    table.timestamp('archived_at', { useTz: true }).nullable();
  });

  await knex.schema.raw(
    'CREATE INDEX IF NOT EXISTS idx_vezlo_conversations_archived_at ON vezlo_conversations(archived_at)'
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.raw('DROP INDEX IF EXISTS idx_vezlo_conversations_archived_at');
  
  await knex.schema.alterTable('vezlo_conversations', (table) => {
    table.dropColumn('archived_at');
  });
}


