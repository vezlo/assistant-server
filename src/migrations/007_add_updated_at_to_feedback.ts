import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add updated_at column to vezlo_message_feedback table
  await knex.schema.alterTable('vezlo_message_feedback', (table) => {
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  // Update existing rows to set updated_at = created_at
  await knex('vezlo_message_feedback')
    .whereNull('updated_at')
    .update({
      updated_at: knex.raw('created_at')
    });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('vezlo_message_feedback', (table) => {
    table.dropColumn('updated_at');
  });
}

