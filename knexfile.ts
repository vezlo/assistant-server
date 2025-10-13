import type { Knex } from 'knex';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Register ts-node for TypeScript support in migrations (works in all environments)
try {
  require('ts-node/register');
} catch (e) {
  // ts-node not available, that's okay - migrations will use compiled JS
}


const config: { [key: string]: Knex.Config } = {
  development: {
    client: 'postgresql',
    connection: {
      host: process.env.SUPABASE_DB_HOST || 'localhost',
      port: parseInt(process.env.SUPABASE_DB_PORT || '5432'),
      database: process.env.SUPABASE_DB_NAME || 'postgres',
      user: process.env.SUPABASE_DB_USER || 'postgres',
      password: process.env.SUPABASE_DB_PASSWORD || '',
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    },
    pool: {
      min: 2,
      max: 10
    },
    migrations: {
      directory: './src/migrations',
      tableName: 'knex_migrations',
      extension: 'ts'
    },
    seeds: {
      directory: './src/seeds',
      extension: 'ts'
    }
  },

  production: {
    client: 'postgresql',
    connection: {
      host: process.env.SUPABASE_DB_HOST || 'localhost',
      port: parseInt(process.env.SUPABASE_DB_PORT || '5432'),
      database: process.env.SUPABASE_DB_NAME || 'postgres',
      user: process.env.SUPABASE_DB_USER || 'postgres',
      password: process.env.SUPABASE_DB_PASSWORD || '',
      ssl: { rejectUnauthorized: false }
    },
    pool: {
      min: 2,
      max: 20
    },
    migrations: {
      directory: './src/migrations',
      tableName: 'knex_migrations',
      extension: 'ts'
    },
    seeds: {
      directory: './src/seeds',
      extension: 'ts'
    }
  },

  // For Supabase connection using connection string
  supabase: {
    client: 'postgresql',
    connection: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || {
      host: process.env.SUPABASE_DB_HOST || 'localhost',
      port: parseInt(process.env.SUPABASE_DB_PORT || '5432'),
      database: process.env.SUPABASE_DB_NAME || 'postgres',
      user: process.env.SUPABASE_DB_USER || 'postgres',
      password: process.env.SUPABASE_DB_PASSWORD || '',
      ssl: { rejectUnauthorized: false }
    },
    pool: {
      min: 2,
      max: 10
    },
    migrations: {
      directory: './src/migrations',
      tableName: 'knex_migrations',
      extension: 'ts'
    },
    seeds: {
      directory: './src/seeds',
      extension: 'ts'
    }
  }
};

export default config;

