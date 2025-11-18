#!/usr/bin/env node

/**
 * Vezlo Assistant Server Setup Wizard
 * Interactive CLI to configure database and environment
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { createClient } = require('@supabase/supabase-js');
const knexLib = require('knex');
const pkgRoot = path.join(__dirname, '..');

const migrationCandidates = [
  path.join(pkgRoot, 'dist', 'src', 'migrations'),
  path.join(pkgRoot, 'dist', 'migrations'),
  path.join(pkgRoot, 'src', 'migrations'),
  path.join(process.cwd(), 'dist', 'src', 'migrations'),
  path.join(process.cwd(), 'src', 'migrations')
];

const fallbackMigrationDir = path.join(pkgRoot, 'dist', 'src', 'migrations');
const migrationDirectory = migrationCandidates.find(dir => fs.existsSync(dir)) || fallbackMigrationDir;

if (!fs.existsSync(migrationDirectory)) {
  console.error(`❌ Migration directory not found. Expected one of:\n${migrationCandidates.concat(fallbackMigrationDir).join('\n')}`);
  console.error('Run `npm run build` (or reinstall the package) to ensure compiled migrations exist.');
  process.exit(1);
}

const usingDistMigrations = migrationDirectory.includes(`${path.sep}dist${path.sep}`);
const migrationExtension = usingDistMigrations ? 'js' : 'ts';
const migrationLoadExtensions = migrationExtension === 'ts' ? ['.ts'] : ['.js'];

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function question(prompt) {
  return new Promise(resolve => {
    rl.question(`${colors.cyan}${prompt}${colors.reset} `, resolve);
  });
}

async function main() {
  console.clear();
  log('\n🚀 Vezlo Assistant Server Setup Wizard\n', 'bright');
  log('This wizard will help you configure your server in 4 easy steps:\n', 'blue');
  log('  1. Supabase Database Configuration');
  log('  2. OpenAI API Configuration');
  log('  3. Environment Validation');
  log('  4. Database Migration Setup\n');

  // Step 1: Supabase Configuration
  log('\n═══════════════════════════════════════════════════════════', 'cyan');
  log('  STEP 1: Supabase Database Configuration', 'bright');
  log('═══════════════════════════════════════════════════════════\n', 'cyan');

  const config = await setupSupabase();

  // Step 2: OpenAI Configuration
  log('\n═══════════════════════════════════════════════════════════', 'cyan');
  log('  STEP 2: OpenAI API Configuration', 'bright');
  log('═══════════════════════════════════════════════════════════\n', 'cyan');

  const openaiKey = await question('Enter your OpenAI API key (sk-...):');
  config.OPENAI_API_KEY = openaiKey.trim();

  const aiModel = await question('AI Model (default: gpt-4o):') || 'gpt-4o';
  config.AI_MODEL = aiModel.trim();

  const aiTemperature = await question('AI Temperature (default: 0.7):') || '0.7';
  config.AI_TEMPERATURE = aiTemperature.trim();

  const aiMaxTokens = await question('AI Max Tokens (default: 1000):') || '1000';
  config.AI_MAX_TOKENS = aiMaxTokens.trim();

  // Step 3: Save Configuration
  log('\n═══════════════════════════════════════════════════════════', 'cyan');
  log('  STEP 3: Save Configuration', 'bright');
  log('═══════════════════════════════════════════════════════════\n', 'cyan');

  const envPath = path.join(process.cwd(), '.env');
  log('Preparing to write environment configuration (.env)...', 'yellow');
  const createdEnv = await saveEnvFile(envPath, config);
  if (createdEnv) {
    log(`✅ Configuration saved to ${envPath}`, 'green');
  } else {
    log('ℹ️  Using existing .env (no overwrite). Review values as needed.', 'yellow');
  }

  // Step 4: Environment Validation
  log('\n═══════════════════════════════════════════════════════════', 'cyan');
  log('  STEP 4: Environment Validation', 'bright');
  log('═══════════════════════════════════════════════════════════\n', 'cyan');

  const validationStatus = await validateEnvironment(config);

  // Step 5: Database Migration Setup
  log('\n═══════════════════════════════════════════════════════════', 'cyan');
  log('  STEP 5: Database Migration Setup', 'bright');
  log('═══════════════════════════════════════════════════════════\n', 'cyan');

  const migrationStatus = await setupMigrations(config, validationStatus) || { migrations: validationStatus.database === 'success' ? 'success' : 'skipped' };

  // Step 6: Default Data Setup (only if migrations succeeded)
  if (migrationStatus.migrations === 'success') {
    log('\n═══════════════════════════════════════════════════════════', 'cyan');
    log('  STEP 6: Default Data Setup', 'bright');
    log('═══════════════════════════════════════════════════════════\n', 'cyan');

    const defaultDataStatus = await setupDefaultData(config);
    migrationStatus.defaultData = defaultDataStatus;
    
    // Step 7: API Key Generation (only if default data setup succeeded)
    if (defaultDataStatus === 'success') {
      log('\n═══════════════════════════════════════════════════════════', 'cyan');
      log('  STEP 7: API Key Generation', 'bright');
      log('═══════════════════════════════════════════════════════════\n', 'cyan');
      
      const apiKeyStatus = await setupApiKey(config);
      migrationStatus.apiKey = apiKeyStatus;
    } else {
      migrationStatus.apiKey = 'skipped';
    }
  } else {
    migrationStatus.defaultData = 'skipped';
    migrationStatus.apiKey = 'skipped';
  }

  // Final Instructions / Summary
  log('\n═══════════════════════════════════════════════════════════', 'green');
  log('  🎉 Setup Complete!', 'bright');
  log('═══════════════════════════════════════════════════════════\n', 'green');

  // Summary
  log('Summary:', 'bright');
  const supaStatus = validationStatus.supabaseApi === 'success' ? 'OK' : (validationStatus.supabaseApi === 'failed' ? 'FAILED' : 'UNKNOWN');
  log(`  Supabase API: ${supaStatus === 'OK' ? colors.green + 'OK' : supaStatus === 'FAILED' ? colors.red + 'FAILED' : colors.yellow + 'UNKNOWN'}${colors.reset}`);
  log(`  Database: ${validationStatus.database === 'success' ? colors.green + 'OK' : colors.red + (validationStatus.database === 'skipped' ? 'SKIPPED' : 'FAILED')}${colors.reset}`);
  log(`  Migrations: ${migrationStatus.migrations === 'success' ? colors.green + 'OK' : migrationStatus.migrations === 'skipped' ? colors.yellow + 'SKIPPED' : colors.red + 'FAILED'}${colors.reset}`);
  log(`  Default Data: ${migrationStatus.defaultData === 'success' ? colors.green + 'OK' : migrationStatus.defaultData === 'skipped' ? colors.yellow + 'SKIPPED' : colors.red + 'FAILED'}${colors.reset}`);
  log(`  API Key: ${migrationStatus.apiKey === 'success' ? colors.green + 'OK' : migrationStatus.apiKey === 'skipped' ? colors.yellow + 'SKIPPED' : colors.red + 'FAILED'}${colors.reset}`);

  log('\nNext steps:');
  log('  1. Review your .env file');
  if (migrationStatus.migrations !== 'success') {
    log('\n⚠️  IMPORTANT: Migrations were not run. You must run migrations first before seeding default data.', 'yellow');
    log('  2. Run database migrations: ' + colors.bright + 'npm run migrate:latest' + colors.reset);
    log('  3. Then run seed: ' + colors.bright + 'npm run seed-default' + colors.reset + ' (only after migrations complete)', 'yellow');
    log('  4. Generate API key: ' + colors.bright + 'npm run generate-key' + colors.reset + ' (if not already done)');
    log('  5. Start the server: ' + colors.bright + 'vezlo-server' + colors.reset);
    log('  6. Visit: ' + colors.bright + 'http://localhost:3000/health' + colors.reset);
    log('  7. API docs: ' + colors.bright + 'http://localhost:3000/docs' + colors.reset);
    log('  8. Test API: ' + colors.bright + 'curl http://localhost:3000/health' + colors.reset + '\n');
  } else if (migrationStatus.defaultData !== 'success') {
    log('  2. Setup default data: ' + colors.bright + 'npm run seed-default' + colors.reset);
    log('  3. Generate API key: ' + colors.bright + 'npm run generate-key' + colors.reset + ' (after default data is created)');
    log('  4. Start the server: ' + colors.bright + 'vezlo-server' + colors.reset);
    log('  5. Visit: ' + colors.bright + 'http://localhost:3000/health' + colors.reset);
    log('  6. API docs: ' + colors.bright + 'http://localhost:3000/docs' + colors.reset);
    log('  7. Test API: ' + colors.bright + 'curl http://localhost:3000/health' + colors.reset + '\n');
  } else if (migrationStatus.apiKey !== 'success') {
    log('  2. Generate API key: ' + colors.bright + 'npm run generate-key' + colors.reset + ' (for library integration)');
    log('  3. Start the server: ' + colors.bright + 'vezlo-server' + colors.reset);
    log('  4. Visit: ' + colors.bright + 'http://localhost:3000/health' + colors.reset);
    log('  5. API docs: ' + colors.bright + 'http://localhost:3000/docs' + colors.reset);
    log('  6. Test API: ' + colors.bright + 'curl http://localhost:3000/health' + colors.reset + '\n');
  } else {
    log('  2. Start the server: ' + colors.bright + 'vezlo-server' + colors.reset);
    log('  3. Visit: ' + colors.bright + 'http://localhost:3000/health' + colors.reset);
    log('  4. API docs: ' + colors.bright + 'http://localhost:3000/docs' + colors.reset);
    log('  5. Test API: ' + colors.bright + 'curl http://localhost:3000/health' + colors.reset + '\n');
  }

  rl.close();
  // Ensure graceful exit even if any handles remain
  setImmediate(() => process.exit(0));
}

async function setupSupabase() {
  log('\n📦 Supabase Configuration\n', 'blue');
  log('You can find these values in your Supabase Dashboard:', 'yellow');
  log('  • API keys & URL: Settings > API > Project URL & API Keys', 'yellow');
  log('  • Database params: Settings > Database > Connection info', 'yellow');
  log('  • Optional pooling: Connect > Connection Pooling > Session Pooler > View parameters\n', 'yellow');

  // Get Supabase URL and extract project ID for defaults
  const supabaseUrl = await question('Supabase Project URL (https://xxx.supabase.co):');
  const projectId = supabaseUrl.match(/https:\/\/(.+?)\.supabase\.co/)?.[1];
  
  if (!projectId) {
    log('\n❌ Invalid Supabase URL format. Please use: https://your-project.supabase.co', 'red');
    throw new Error('Invalid Supabase URL');
  }

  const supabaseServiceKey = await question('Supabase Service Role Key:');
  const supabaseAnonKey = await question('Supabase Anon Key (optional, press Enter to skip):');

  // Show defaults and ask for each database parameter
  log('\n📊 Database Connection Details:', 'blue');
  
  const dbHost = await question(`Database Host (default: db.${projectId}.supabase.co):`) || `db.${projectId}.supabase.co`;
  const dbPort = await question('Database Port (default: 5432):') || '5432';
  const dbName = await question('Database Name (default: postgres):') || 'postgres';
  const dbUser = await question(`Database User (default: postgres.${projectId}):`) || `postgres.${projectId}`;
  const dbPassword = await question('Database Password (from Settings > Database):');

  // Validate Supabase connection (same as validate script)
  log('\n🔄 Validating Supabase connection...', 'yellow');
  
  try {
    const client = createClient(supabaseUrl.trim(), supabaseServiceKey.trim());
    const { error } = await client.from('vezlo_conversations').select('count').limit(0);

    if (error) {
      // Check for table not found errors (normal before migrations run)
      if (error.code === 'PGRST116' || 
          error.message.includes('does not exist') ||
          error.message.includes('Could not find the table')) {
        log('✅ Supabase connection successful!', 'green');
        log('⚠️  Note: Table not found - this is normal before running migrations\n', 'yellow');
      } else {
        throw error;
      }
    } else {
      log('✅ Supabase connection successful!\n', 'green');
    }
  } catch (err) {
    log(`❌ Supabase connection failed: ${err.message}`, 'red');
    log('⚠️  This might be because migrations haven\'t run yet, or check your credentials.', 'yellow');
  }

  // Validate database connection (same as validate script)
  log('\n🔄 Validating database connection...', 'yellow');
  
  let client;
  try {
    const { Client } = require('pg');
    
    client = new Client({
      host: dbHost.trim(),
      port: parseInt(dbPort.trim()),
      database: dbName.trim(),
      user: dbUser.trim(),
      password: dbPassword.trim(),
      ssl: { rejectUnauthorized: false }
    });

    // Handle connection errors quietly for normal shutdowns
    client.on('error', (err) => {
      const msg = (err && err.message) ? err.message : String(err);
      if (msg && (msg.includes('client_termination') || msg.includes(':shutdown'))) {
        return; // ignore normal termination noise
      }
      console.error('Database connection error:', msg);
    });

    await client.connect();
    log('✅ Database connection successful!\n', 'green');
    await client.end();
  } catch (err) {
    log(`❌ Database connection failed: ${err.message}`, 'red');
    log('⚠️  Continuing setup. Migrations will be skipped; see summary for next steps.', 'yellow');
  }

  return {
    SUPABASE_URL: supabaseUrl.trim(),
    SUPABASE_ANON_KEY: supabaseAnonKey.trim() || '',
    SUPABASE_SERVICE_KEY: supabaseServiceKey.trim(),
    SUPABASE_DB_HOST: dbHost.trim(),
    SUPABASE_DB_PORT: dbPort.trim(),
    SUPABASE_DB_NAME: dbName.trim(),
    SUPABASE_DB_USER: dbUser.trim(),
    SUPABASE_DB_PASSWORD: dbPassword.trim(),
    PORT: '3000',
    NODE_ENV: 'development',
    CORS_ORIGINS: 'http://localhost:3000,http://localhost:5173',
    BASE_URL: 'http://localhost:3000'
  };
}

// Handle errors and cleanup
process.on('SIGINT', () => {
  log('\n\n⚠️  Setup cancelled by user', 'yellow');
  rl.close();
  process.exit(0);
});

// Run the wizard
main().catch(error => {
  log(`\n❌ Setup failed: ${error.message}`, 'red');
  rl.close();
  process.exit(1);
});

async function saveEnvFile(envPath, config) {
  // Don't overwrite existing .env
  if (fs.existsSync(envPath)) {
    log('\n⚠️  .env already exists. Skipping overwrite. Please review values manually.', 'yellow');
    return false;
  }
  // Generate a secure migration secret if not provided
  try {
    const crypto = require('crypto');
    if (!config.MIGRATION_SECRET_KEY) {
      config.MIGRATION_SECRET_KEY = crypto.randomBytes(32).toString('hex');
    }
    if (!config.JWT_SECRET) {
      config.JWT_SECRET = crypto.randomBytes(32).toString('hex');
    }
  } catch (_) {
    // Fallback simple values if crypto unavailable (very unlikely)
    config.MIGRATION_SECRET_KEY = config.MIGRATION_SECRET_KEY || `msk_${Date.now()}`;
    config.JWT_SECRET = config.JWT_SECRET || `jwt_${Date.now()}`;
  }
  const envContent = `# Vezlo Assistant Server Configuration
# Generated by setup wizard on ${new Date().toISOString()}

# Server Configuration
PORT=${config.PORT || '3000'}
NODE_ENV=${config.NODE_ENV || 'development'}
LOG_LEVEL=info

# CORS Configuration
CORS_ORIGINS=${config.CORS_ORIGINS || 'http://localhost:3000,http://localhost:5173'}

# Swagger Base URL
BASE_URL=${config.BASE_URL || 'http://localhost:3000'}

# Rate Limiting
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX=100

# Supabase Configuration
${config.SUPABASE_URL ? `SUPABASE_URL=${config.SUPABASE_URL}` : '# SUPABASE_URL=https://your-project.supabase.co'}
${config.SUPABASE_ANON_KEY ? `SUPABASE_ANON_KEY=${config.SUPABASE_ANON_KEY}` : '# SUPABASE_ANON_KEY=your-anon-key'}
${config.SUPABASE_SERVICE_KEY ? `SUPABASE_SERVICE_KEY=${config.SUPABASE_SERVICE_KEY}` : '# SUPABASE_SERVICE_KEY=your-service-role-key'}

# Database Configuration
SUPABASE_DB_HOST=${config.SUPABASE_DB_HOST || 'localhost'}
SUPABASE_DB_PORT=${config.SUPABASE_DB_PORT || '5432'}
SUPABASE_DB_NAME=${config.SUPABASE_DB_NAME || 'postgres'}
SUPABASE_DB_USER=${config.SUPABASE_DB_USER || 'postgres'}
SUPABASE_DB_PASSWORD=${config.SUPABASE_DB_PASSWORD || ''}

# OpenAI Configuration
OPENAI_API_KEY=${config.OPENAI_API_KEY || 'sk-your-openai-api-key'}
AI_MODEL=${config.AI_MODEL || 'gpt-4o'}
AI_TEMPERATURE=${config.AI_TEMPERATURE || '0.7'}
AI_MAX_TOKENS=${config.AI_MAX_TOKENS || '1000'}

# Organization Settings
ORGANIZATION_NAME=Vezlo
ASSISTANT_NAME=Vezlo Assistant

# Knowledge Base
CHUNK_SIZE=1000
CHUNK_OVERLAP=200

# Chat History
CHAT_HISTORY_LENGTH=${config.CHAT_HISTORY_LENGTH || '2'}

# Migration Security
MIGRATION_SECRET_KEY=${config.MIGRATION_SECRET_KEY}

# Authentication / Defaults
JWT_SECRET=${config.JWT_SECRET}
DEFAULT_ADMIN_EMAIL=${config.DEFAULT_ADMIN_EMAIL || 'admin@vezlo.org'}
DEFAULT_ADMIN_PASSWORD=${config.DEFAULT_ADMIN_PASSWORD || 'admin123'}
`;

  fs.writeFileSync(envPath, envContent, 'utf8');
  return true;
}

async function validateEnvironment(config) {
  log('🔄 Validating environment configuration...', 'yellow');

  // Test Supabase connection (same as validate script)
  try {
    const client = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY);
    const { error } = await client.from('vezlo_conversations').select('count').limit(0);
    
    if (error) {
      // Check for table not found errors (normal before migrations run)
      if (error.code === 'PGRST116' || 
          error.message.includes('does not exist') ||
          error.message.includes('Could not find the table')) {
        log('✅ Supabase API connection validated', 'green');
        log('⚠️  Note: Table not found - this is normal before running migrations', 'yellow');
      } else {
        throw error;
      }
    } else {
      log('✅ Supabase API connection validated', 'green');
    }
  } catch (err) {
    log(`❌ Supabase API validation failed: ${err.message}`, 'red');
    // non-blocking; proceed to DB check anyway
    // return partial status so caller can decide
    // (we'll still attempt DB validation)
  }

  // Test database connection (same as validate script)
  log('\n🔄 Validating database connection...', 'yellow');
  let client;
  try {
    const { Client } = require('pg');
    
    client = new Client({
      host: config.SUPABASE_DB_HOST,
      port: parseInt(config.SUPABASE_DB_PORT),
      database: config.SUPABASE_DB_NAME,
      user: config.SUPABASE_DB_USER,
      password: config.SUPABASE_DB_PASSWORD,
      ssl: { rejectUnauthorized: false }
    });

    // Handle connection errors quietly for normal shutdowns
    client.on('error', (err) => {
      const msg = (err && err.message) ? err.message : String(err);
      if (msg && (msg.includes('client_termination') || msg.includes(':shutdown'))) {
        return; // ignore normal termination noise
      }
      console.error('Database connection error:', msg);
    });

    await client.connect();
    log('✅ Database connection validated', 'green');
    await client.end();
  } catch (err) {
    log(`❌ Database validation failed: ${err.message}`, 'red');
    log('⚠️  Continuing setup; migrations will be skipped.', 'yellow');
    return { supabaseApi: 'unknown', database: 'failed' };
  }

  log('✅ Environment validation complete!\n', 'green');
  return { supabaseApi: 'success', database: 'success' };
}

async function setupMigrations(config, validationStatus) {
  log('🔄 Checking migration status...', 'yellow');

  if (validationStatus.database !== 'success') {
    log('⚠️  Skipping migrations because database validation failed.', 'yellow');
    return { migrations: 'skipped' };
  }

  try {
    const { Client } = require('pg');
    const client = new Client({
      host: config.SUPABASE_DB_HOST,
      port: parseInt(config.SUPABASE_DB_PORT),
      database: config.SUPABASE_DB_NAME,
      user: config.SUPABASE_DB_USER,
      password: config.SUPABASE_DB_PASSWORD,
      ssl: { rejectUnauthorized: false }
    });

    await client.connect();

    // Check if migrations table exists
    const migrationTableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'knex_migrations'
      );
    `);

    if (!migrationTableExists.rows[0].exists) {
      log('📋 No migrations table found. Database needs initial setup.', 'blue');
      
      const runMigrations = await question('Run initial database migrations now? (y/n):');
      
      if (runMigrations.toLowerCase() === 'y') {
        log('🔄 Running migrations...', 'yellow');
        
        await runMigrationsWithConfig(config);
        
        log('✅ Migrations completed successfully!', 'green');
        return { migrations: 'success' };
      } else {
        log('\n⚠️  Migrations skipped by user.', 'yellow');
        log('   You can run them later using: ' + colors.cyan + 'npm run migrate:latest' + colors.reset, 'yellow');
        log('   Or via API: ' + colors.cyan + 'GET /api/migrate?key=your-migration-secret' + colors.reset, 'yellow');
        log('\n   ⚠️  Note: Default data seeding will be skipped until migrations are run.\n', 'yellow');
        return { migrations: 'skipped' };
      }
    } else {
      // Check migration status
      const migrationStatus = await client.query(`
        SELECT COUNT(*) as count FROM knex_migrations;
      `);
      
      log(`📊 Found ${migrationStatus.rows[0].count} completed migrations`, 'blue');
      
      const runPending = await question('Check for pending migrations? (y/n):');
      
      if (runPending.toLowerCase() === 'y') {
        log('🔄 Checking for pending migrations...', 'yellow');
        
        await runMigrationsWithConfig(config);
        
        log('✅ Migration check completed!', 'green');
        await client.end();
        return { migrations: 'success' };
      } else {
        log('⚠️  Migration check skipped by user.', 'yellow');
        log('   You can run them later using: ' + colors.cyan + 'npm run migrate:latest' + colors.reset, 'yellow');
        log('   Or via API: ' + colors.cyan + 'GET /api/migrate?key=your-migration-secret' + colors.reset, 'yellow');
        log('\n   ⚠️  Note: Default data seeding will be skipped until migrations are run.\n', 'yellow');
        await client.end();
        return { migrations: 'skipped' };
      }
    }

    await client.end();
    return { migrations: 'skipped' };
  } catch (err) {
    log(`❌ Migration setup failed: ${err.message}`, 'red');
    log('\nYou can run migrations manually later:', 'yellow');
    log('   npm run migrate:latest', 'cyan');
    log('   Or via API: GET /api/migrate?key=your-migration-secret\n', 'cyan');
    return { migrations: 'failed' };
  }
}

// Handle errors and cleanup
process.on('SIGINT', () => {
  log('\n\n⚠️  Setup cancelled by user', 'yellow');
  rl.close();
  process.exit(0);
});

// Run the wizard
main().catch(error => {
  log(`\n❌ Setup failed: ${error.message}`, 'red');
  rl.close();
  process.exit(1);
});

async function runMigrationsWithConfig(config) {
  const knexInstance = knexLib({
    client: 'postgresql',
    connection: {
      host: config.SUPABASE_DB_HOST,
      port: parseInt(config.SUPABASE_DB_PORT),
      database: config.SUPABASE_DB_NAME,
      user: config.SUPABASE_DB_USER,
      password: config.SUPABASE_DB_PASSWORD,
      ssl: { rejectUnauthorized: false }
    },
    migrations: {
      directory: migrationDirectory,
      tableName: 'knex_migrations',
      extension: migrationExtension,
      loadExtensions: migrationLoadExtensions
    },
    pool: { min: 0, max: 10 }
  });

  try {
    await knexInstance.migrate.latest();
  } finally {
    await knexInstance.destroy();
  }
}

async function setupDefaultData(config) {
  log('🔄 Setting up default company and admin user...', 'yellow');

  try {
    // Import the setup service dynamically
    const { runDefaultSetup } = await import('./seed-default.js');
    
    // Set environment variables for the setup
    process.env.SUPABASE_URL = config.SUPABASE_URL;
    process.env.SUPABASE_SERVICE_KEY = config.SUPABASE_SERVICE_KEY;
    process.env.DEFAULT_ADMIN_EMAIL = config.DEFAULT_ADMIN_EMAIL || 'admin@vezlo.org';
    process.env.DEFAULT_ADMIN_PASSWORD = config.DEFAULT_ADMIN_PASSWORD || 'admin123';
    process.env.ORGANIZATION_NAME = config.ORGANIZATION_NAME || 'Vezlo';
    process.env.JWT_SECRET = config.JWT_SECRET || require('crypto').randomBytes(32).toString('hex');

    // Run the default setup
    await runDefaultSetup();
    
    log('✅ Default data setup completed successfully!', 'green');
    return 'success';
  } catch (err) {
    log(`❌ Default data setup failed: ${err.message}`, 'red');
    log('\nYou can run default data setup manually later:', 'yellow');
    log('   npm run seed-default', 'cyan');
    return 'failed';
  }
}

async function setupApiKey(config) {
  log('🔄 Generating API key for library integration...', 'yellow');

  try {
    // Import the API key generator dynamically
    const { generateApiKey } = await import('./generate-key.js');
    
    // Set environment variables for the setup (already set in setupDefaultData)
    
    // Run the API key generator in quiet mode
    const result = await generateApiKey({ quiet: true });
    
    if (result.success) {
      // Show API key details
      log('✅ API key generated successfully!', 'green');
      log('\n📋 API Key Details:', 'bright');
      log(`   Company: ${result.company}`, 'reset');
      log(`   User: ${result.user.name}`, 'reset');
      log(`   API Key: ${result.apiKey}`, 'bright');
      log('\n⚠️  IMPORTANT: Save this key securely. It will not be shown again.', 'yellow');
      
      // Show usage example
      log('\n🔧 Usage Example:', 'bright');
      log(`   curl -X POST http://localhost:3000/api/knowledge/items \\
     -H "X-API-Key: ${result.apiKey}" \\
     -H "Content-Type: application/json" \\
     -d '{"title": "Example", "type": "document", "content": "Example content"}'`, 'cyan');
      
      return 'success';
    } else {
      throw new Error(result.error);
    }
  } catch (err) {
    log(`❌ API key generation failed: ${err.message}`, 'red');
    log('\nYou can generate an API key manually later:', 'yellow');
    log('   npm run generate-key', 'cyan');
    return 'failed';
  }
}
