import type { Knex } from 'knex';
import dotenv from 'dotenv';
const path = require('path');
const fs = require('fs');

// Load environment variables
dotenv.config();

// Register ts-node for TypeScript support in migrations (works in all environments)
try {
  require('ts-node/register');
} catch (e) {
  // ts-node not available, that's okay - migrations will use compiled JS
}


const projectRoot = fs.existsSync(path.join(__dirname, 'package.json'))
  ? __dirname
  : path.join(__dirname, '..');

const srcMigrationsPath = path.join(projectRoot, 'src', 'migrations');
const distMigrationsPath = path.join(projectRoot, 'dist', 'src', 'migrations');
const tsMigrationProbe = path.join(srcMigrationsPath, '001_initial_schema.ts');
const jsMigrationProbe = path.join(distMigrationsPath, '001_initial_schema.js');

const hasTsMigrations = fs.existsSync(tsMigrationProbe);
const hasJsMigrations = fs.existsSync(jsMigrationProbe);

const resolvedMigrationsDirectory = hasTsMigrations
  ? srcMigrationsPath
  : hasJsMigrations
    ? distMigrationsPath
    : srcMigrationsPath;

const migrationExtension = hasTsMigrations ? 'ts' : (hasJsMigrations ? 'js' : 'ts');
const migrationLoadExtensions = migrationExtension === 'ts' ? ['.ts'] : ['.js'];

const supabaseMigrationsDirectory = fs.existsSync(distMigrationsPath)
  ? distMigrationsPath
  : resolvedMigrationsDirectory;
const supabaseMigrationExtension = fs.existsSync(distMigrationsPath) ? 'js' : migrationExtension;
const supabaseSeedsDirectory = fs.existsSync(path.join(projectRoot, 'dist', 'src', 'seeds'))
  ? path.join(projectRoot, 'dist', 'src', 'seeds')
  : path.join(projectRoot, 'src', 'seeds');
const supabaseSeedsAreJs = supabaseSeedsDirectory.endsWith(path.join('dist', 'src', 'seeds'));

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
      directory: resolvedMigrationsDirectory,
      tableName: 'knex_migrations',
      extension: migrationExtension,
      loadExtensions: migrationLoadExtensions
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
      // Use resolved path (prefers TS during development, JS in packaged builds)
      directory: resolvedMigrationsDirectory,
      tableName: 'knex_migrations',
      extension: migrationExtension,
      loadExtensions: migrationLoadExtensions
    },
    seeds: {
      directory: path.join(__dirname, 'src/seeds'),
      extension: 'js'
    }
  },

  // Supabase (used by Vercel) always targets compiled JS migrations
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
      directory: supabaseMigrationsDirectory,
      tableName: 'knex_migrations',
      extension: supabaseMigrationExtension,
      loadExtensions: supabaseMigrationExtension === 'ts' ? ['.ts'] : ['.js']
    },
    seeds: {
      directory: supabaseSeedsDirectory,
      extension: supabaseSeedsAreJs ? 'js' : 'ts'
    }
  }
};

export default config;

