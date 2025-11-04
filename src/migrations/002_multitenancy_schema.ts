import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ============================================================================
  // COMPANIES TABLE
  // ============================================================================
  await knex.schema.createTable('vezlo_companies', (table) => {
    table.bigIncrements('id').primary();
    table.uuid('uuid').defaultTo(knex.raw('gen_random_uuid()')).unique().notNullable();
    table.text('name').notNullable();
    table.text('domain').unique();
    table.timestamps(true, true); // created_at, updated_at with timezone
  });

  // ============================================================================
  // USERS TABLE
  // ============================================================================
  await knex.schema.createTable('vezlo_users', (table) => {
    table.bigIncrements('id').primary();
    table.uuid('uuid').defaultTo(knex.raw('gen_random_uuid()')).unique().notNullable();
    table.text('email').unique().notNullable();
    table.text('name').notNullable();
    table.text('password_hash').notNullable();
    table.text('user_type').defaultTo('internal').comment('internal, external, admin');
    table.timestamp('token_updated_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamps(true, true); // created_at, updated_at with timezone
  });

  // ============================================================================
  // USER COMPANY PROFILES TABLE
  // ============================================================================
  await knex.schema.createTable('vezlo_user_company_profiles', (table) => {
    table.bigIncrements('id').primary();
    table.uuid('uuid').defaultTo(knex.raw('gen_random_uuid()')).unique().notNullable();
    table.bigInteger('user_id').notNullable().references('id').inTable('vezlo_users').onDelete('CASCADE');
    table.bigInteger('company_id').notNullable().references('id').inTable('vezlo_companies').onDelete('CASCADE');
    table.text('role').defaultTo('user').comment('admin, user, viewer');
    table.text('status').defaultTo('active').comment('active, inactive');
    table.timestamps(true, true); // created_at, updated_at with timezone
    table.unique(['user_id', 'company_id']);
  });

  // ============================================================================
  // API KEYS TABLE
  // ============================================================================
  await knex.schema.createTable('vezlo_api_keys', (table) => {
    table.bigIncrements('id').primary();
    table.uuid('uuid').defaultTo(knex.raw('gen_random_uuid()')).unique().notNullable();
    table.bigInteger('company_id').notNullable().references('id').inTable('vezlo_companies').onDelete('CASCADE');
    table.text('name').notNullable();
    table.text('key_hash').notNullable();
    table.timestamp('expires_at', { useTz: true });
    table.timestamps(true, true); // created_at, updated_at with timezone
  });

  // ============================================================================
  // UPDATE EXISTING TABLES WITH FOREIGN KEYS
  // ============================================================================

  // Update conversations table
  await knex.schema.alterTable('vezlo_conversations', (table) => {
    // company_id already exists from Migration 001, just add foreign key constraint
    table.foreign('company_id').references('id').inTable('vezlo_companies').onDelete('CASCADE');
  });

  // Update knowledge_items table
  await knex.schema.alterTable('vezlo_knowledge_items', (table) => {
    // company_id already exists from Migration 001, just add foreign key constraint
    table.foreign('company_id').references('id').inTable('vezlo_companies').onDelete('CASCADE');
  });

  // Update message_feedback table
  await knex.schema.alterTable('vezlo_message_feedback', (table) => {
    // user_id already exists from Migration 001, just add foreign key constraint
    table.foreign('user_id').references('id').inTable('vezlo_users').onDelete('CASCADE');
    table.bigInteger('company_id').references('id').inTable('vezlo_companies').onDelete('CASCADE');
  });

  // ============================================================================
  // INDEXES FOR PERFORMANCE
  // ============================================================================

  // Company indexes
  await knex.schema.raw('CREATE INDEX IF NOT EXISTS idx_vezlo_companies_uuid ON vezlo_companies(uuid)');
  await knex.schema.raw('CREATE INDEX IF NOT EXISTS idx_vezlo_companies_domain ON vezlo_companies(domain)');

  // User indexes
  await knex.schema.raw('CREATE INDEX IF NOT EXISTS idx_vezlo_users_uuid ON vezlo_users(uuid)');
  await knex.schema.raw('CREATE INDEX IF NOT EXISTS idx_vezlo_users_email ON vezlo_users(email)');
  await knex.schema.raw('CREATE INDEX IF NOT EXISTS idx_vezlo_users_user_type ON vezlo_users(user_type)');
  await knex.schema.raw('CREATE INDEX IF NOT EXISTS idx_vezlo_users_token_updated_at ON vezlo_users(token_updated_at)');

  // User-Company Profile indexes
  await knex.schema.raw('CREATE INDEX IF NOT EXISTS idx_vezlo_user_company_profiles_user_id ON vezlo_user_company_profiles(user_id)');
  await knex.schema.raw('CREATE INDEX IF NOT EXISTS idx_vezlo_user_company_profiles_company_id ON vezlo_user_company_profiles(company_id)');
  await knex.schema.raw('CREATE INDEX IF NOT EXISTS idx_vezlo_user_company_profiles_uuid ON vezlo_user_company_profiles(uuid)');
  await knex.schema.raw('CREATE INDEX IF NOT EXISTS idx_vezlo_user_company_profiles_role ON vezlo_user_company_profiles(role)');
  await knex.schema.raw('CREATE INDEX IF NOT EXISTS idx_vezlo_user_company_profiles_status ON vezlo_user_company_profiles(status)');

  // API Key indexes
  await knex.schema.raw('CREATE INDEX IF NOT EXISTS idx_vezlo_api_keys_uuid ON vezlo_api_keys(uuid)');
  await knex.schema.raw('CREATE INDEX IF NOT EXISTS idx_vezlo_api_keys_company_id ON vezlo_api_keys(company_id)');
  await knex.schema.raw('CREATE INDEX IF NOT EXISTS idx_vezlo_api_keys_key_hash ON vezlo_api_keys(key_hash)');
  await knex.schema.raw('CREATE INDEX IF NOT EXISTS idx_vezlo_api_keys_expires_at ON vezlo_api_keys(expires_at)');

  // Updated foreign key indexes
  await knex.schema.raw('CREATE INDEX IF NOT EXISTS idx_vezlo_conversations_company_id ON vezlo_conversations(company_id)');
  await knex.schema.raw('CREATE INDEX IF NOT EXISTS idx_vezlo_knowledge_company_id ON vezlo_knowledge_items(company_id)');
  await knex.schema.raw('CREATE INDEX IF NOT EXISTS idx_vezlo_feedback_user_id ON vezlo_message_feedback(user_id)');
  await knex.schema.raw('CREATE INDEX IF NOT EXISTS idx_vezlo_feedback_company_id ON vezlo_message_feedback(company_id)');
}

export async function down(knex: Knex): Promise<void> {
  // Drop foreign key constraints first
  await knex.schema.alterTable('vezlo_conversations', (table) => {
    table.dropForeign('company_id');
  });

  await knex.schema.alterTable('vezlo_knowledge_items', (table) => {
    table.dropForeign('company_id');
  });

  await knex.schema.alterTable('vezlo_message_feedback', (table) => {
    table.dropForeign('user_id');
    table.dropColumn('company_id');
  });

  // Drop tables in reverse order due to foreign key constraints
  await knex.schema.dropTableIfExists('vezlo_api_keys');
  await knex.schema.dropTableIfExists('vezlo_user_company_profiles');
  await knex.schema.dropTableIfExists('vezlo_users');
  await knex.schema.dropTableIfExists('vezlo_companies');
}