import knex, { Knex } from 'knex';
import config from '../../knexfile';

// Get the appropriate configuration based on environment
const getConfig = (): Knex.Config => {
  const env = process.env.NODE_ENV || 'development';
  
  console.log('🔧 Knex config loaded:', {
    NODE_ENV: process.env.NODE_ENV,
    environment: env,
    SUPABASE_URL: process.env.SUPABASE_URL ? 'present' : 'not present',
    processCwd: process.cwd(),
    hasSupabaseConfig: !!config.supabase,
    hasEnvConfig: !!config[env]
  });
  
  // For Supabase, we can use the supabase config or fall back to environment-based config
  if (process.env.SUPABASE_URL) {
    console.log('📋 Using supabase config');
    const supabaseConfig = config.supabase;
    if (supabaseConfig.migrations) {
      console.log('📁 Migration directory:', (supabaseConfig.migrations as any).directory);
      console.log('📁 Migration extension:', (supabaseConfig.migrations as any).extension);
    }
    return supabaseConfig;
  }
  
  console.log('📋 Using environment config:', env);
  const envConfig = config[env] || config.development;
  if (envConfig.migrations) {
    console.log('📁 Migration directory:', (envConfig.migrations as any).directory);
    console.log('📁 Migration extension:', (envConfig.migrations as any).extension);
  }
  return envConfig;
};

// Create Knex instance
const db: Knex = knex(getConfig());

// Export the Knex instance
export default db;

// Export types for use in other files
export type { Knex };

// Utility functions for migrations
export const runMigrations = async (): Promise<void> => {
  try {
    await db.migrate.latest();
    console.log('✅ Database migrations completed successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
};

export const rollbackMigrations = async (): Promise<void> => {
  try {
    await db.migrate.rollback();
    console.log('✅ Database rollback completed successfully');
  } catch (error) {
    console.error('❌ Rollback failed:', error);
    throw error;
  }
};

export const getMigrationStatus = async (): Promise<number> => {
  try {
    const status = await db.migrate.status();
    return status;
  } catch (error) {
    console.error('❌ Failed to get migration status:', error);
    throw error;
  }
};

// Graceful shutdown
export const closeConnection = async (): Promise<void> => {
  try {
    await db.destroy();
    console.log('✅ Database connection closed');
  } catch (error) {
    console.error('❌ Error closing database connection:', error);
  }
};

