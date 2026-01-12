import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Table for storing external database configurations
  await knex.schema.createTable('vezlo_database_tool_configs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.integer('company_id').notNullable().references('id').inTable('vezlo_companies').onDelete('CASCADE');
    table.text('db_url_encrypted').notNullable(); // Encrypted database URL
    table.text('db_key_encrypted').notNullable(); // Encrypted database key
    table.boolean('enabled').defaultTo(true);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Index for quick lookups by company
    table.index('company_id');
  });

  // Table for storing individual tool configurations per table
  await knex.schema.createTable('vezlo_database_tools', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('config_id').notNullable().references('id').inTable('vezlo_database_tool_configs').onDelete('CASCADE');
    table.text('table_name').notNullable(); // Database table name
    table.text('tool_name').notNullable(); // Generated tool name (e.g., 'get_user_details')
    table.text('tool_description'); // Description for LLM
    table.jsonb('columns').notNullable(); // Array of accessible column names
    table.text('id_column').notNullable().defaultTo('id'); // Primary key column name
    table.text('id_column_type').notNullable().defaultTo('integer'); // 'integer', 'uuid', 'string'
    table.boolean('enabled').defaultTo(true);
    
    // User filtering columns
    table.boolean('requires_user_context').defaultTo(false); // Whether tool needs user filtering
    table.text('user_filter_column').nullable(); // Column to filter by (e.g., 'uuid', 'company_id')
    table.text('user_filter_type').nullable(); // 'uuid', 'integer', 'string'
    table.text('user_context_key').nullable(); // Key from user_context (e.g., 'user_uuid', 'company_id')
    
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Index for quick lookups
    table.index('config_id');
    table.index('enabled');
    
    // Unique constraint: one tool per table per config
    table.unique(['config_id', 'table_name']);
  });

  console.log('✅ Created vezlo_database_tool_configs and vezlo_database_tools tables');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('vezlo_database_tools');
  await knex.schema.dropTableIfExists('vezlo_database_tool_configs');
  
  console.log('✅ Dropped vezlo_database_tool_configs and vezlo_database_tools tables');
}




