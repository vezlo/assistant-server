import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('vezlo_company_ai_settings', (table) => {
    table.bigInteger('company_id').primary().references('id').inTable('vezlo_companies').onDelete('CASCADE');
    table.jsonb('settings').notNullable().defaultTo('{}');
    table.timestamps(true, true); // created_at, updated_at with timezone
  });

  // Index for performance
  await knex.schema.raw('CREATE INDEX IF NOT EXISTS idx_vezlo_company_ai_settings_settings ON vezlo_company_ai_settings USING gin (settings)');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('vezlo_company_ai_settings');
}


