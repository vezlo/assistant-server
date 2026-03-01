import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add technical_depth column to vezlo_ai_settings (company default)
  await knex.schema.alterTable('vezlo_ai_settings', (table) => {
    table.integer('technical_depth').notNullable().defaultTo(3);
  });

  // Add CHECK constraint for vezlo_ai_settings.technical_depth
  await knex.raw(`
    ALTER TABLE vezlo_ai_settings
    ADD CONSTRAINT chk_ai_settings_technical_depth
    CHECK (technical_depth >= 1 AND technical_depth <= 5)
  `);

  // Add technical_depth column to vezlo_conversations (nullable = inherit from company)
  await knex.schema.alterTable('vezlo_conversations', (table) => {
    table.integer('technical_depth').nullable();
  });

  // Add CHECK constraint for vezlo_conversations.technical_depth
  await knex.raw(`
    ALTER TABLE vezlo_conversations
    ADD CONSTRAINT chk_conversations_technical_depth
    CHECK (technical_depth IS NULL OR (technical_depth >= 1 AND technical_depth <= 5))
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Remove CHECK constraint and column from vezlo_conversations
  await knex.raw(`
    ALTER TABLE vezlo_conversations
    DROP CONSTRAINT IF EXISTS chk_conversations_technical_depth
  `);
  await knex.schema.alterTable('vezlo_conversations', (table) => {
    table.dropColumn('technical_depth');
  });

  // Remove CHECK constraint and column from vezlo_ai_settings
  await knex.raw(`
    ALTER TABLE vezlo_ai_settings
    DROP CONSTRAINT IF EXISTS chk_ai_settings_technical_depth
  `);
  await knex.schema.alterTable('vezlo_ai_settings', (table) => {
    table.dropColumn('technical_depth');
  });
}
