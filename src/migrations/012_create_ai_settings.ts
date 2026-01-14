import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('vezlo_ai_settings', (table) => {
    table.bigIncrements('id').primary();
    table.uuid('uuid').defaultTo(knex.raw('gen_random_uuid()')).unique().notNullable();
    table.bigInteger('company_id').notNullable().references('id').inTable('vezlo_companies').onDelete('CASCADE');
    
    // JSONB column for flexible settings storage
    table.jsonb('settings').notNullable().defaultTo(JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.7,
      max_tokens: 1000,
      top_k: null,
      prompts: {
        personality: '',
        response_guidelines: '',
        interaction_etiquette: '',
        scope_of_assistance: '',
        formatting_and_presentation: ''
      }
    }));
    
    table.timestamps(true, true); // created_at, updated_at
    
    // Ensure one settings record per company
    table.unique(['company_id']);
  });

  // Create index for faster lookups
  await knex.schema.alterTable('vezlo_ai_settings', (table) => {
    table.index('company_id', 'idx_ai_settings_company_id');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('vezlo_ai_settings');
}
