import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add response_mode column to vezlo_companies
  await knex.schema.alterTable('vezlo_companies', (table) => {
    table.text('response_mode').defaultTo('developer').notNullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('vezlo_companies', (table) => {
    table.dropColumn('response_mode');
  });
}

