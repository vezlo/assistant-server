import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('vezlo_conversations', (table) => {
    table.timestamp('joined_at', { useTz: true }).nullable();
    table.timestamp('responded_at', { useTz: true }).nullable();
    table.timestamp('closed_at', { useTz: true }).nullable();
    table.timestamp('last_message_at', { useTz: true }).nullable();
  });

  await knex.schema.alterTable('vezlo_messages', (table) => {
    table
      .bigInteger('author_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('vezlo_users')
      .onDelete('SET NULL');
  });

  await knex.schema.raw(
    'CREATE INDEX IF NOT EXISTS idx_vezlo_conversations_last_message_at ON vezlo_conversations(last_message_at DESC)'
  );
  await knex.schema.raw(
    'CREATE INDEX IF NOT EXISTS idx_vezlo_conversations_joined_at ON vezlo_conversations(joined_at)'
  );
  await knex.schema.raw(
    'CREATE INDEX IF NOT EXISTS idx_vezlo_conversations_closed_at ON vezlo_conversations(closed_at)'
  );
  await knex.schema.raw(
    'CREATE INDEX IF NOT EXISTS idx_vezlo_messages_author_id ON vezlo_messages(author_id)'
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.raw('DROP INDEX IF EXISTS idx_vezlo_messages_author_id');
  await knex.schema.raw('DROP INDEX IF EXISTS idx_vezlo_conversations_last_message_at');
  await knex.schema.raw('DROP INDEX IF EXISTS idx_vezlo_conversations_joined_at');
  await knex.schema.raw('DROP INDEX IF EXISTS idx_vezlo_conversations_closed_at');

  await knex.schema.alterTable('vezlo_messages', (table) => {
    table.dropForeign(['author_id']);
    table.dropColumn('author_id');
  });

  await knex.schema.alterTable('vezlo_conversations', (table) => {
    table.dropColumn('joined_at');
    table.dropColumn('responded_at');
    table.dropColumn('closed_at');
    table.dropColumn('last_message_at');
  });

}

