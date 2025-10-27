#!/usr/bin/env node

/**
 * Vezlo Assistant Server - Database Validation
 * Validates database connection and table setup
 */

const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

// Load environment variables
dotenv.config();

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  bright: '\x1b[1m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function validateDatabase() {
  log('\n🔍 Validating Database Configuration\n', 'cyan');

  // Check environment variables
  log('Checking environment variables...', 'yellow');

  const requiredVars = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_KEY',
    'SUPABASE_DB_HOST',
    'SUPABASE_DB_PASSWORD'
  ];

  const missing = requiredVars.filter(key => !process.env[key]);

  if (missing.length > 0) {
    log(`\n❌ Missing required environment variables:`, 'red');
    missing.forEach(key => log(`   - ${key}`, 'red'));
    log('\nRun the setup wizard: ' + colors.bright + 'npx vezlo-setup' + colors.reset + '\n', 'yellow');
    process.exit(1);
  }

  log('✅ Environment variables configured\n', 'green');

  // Test Supabase connection
  log('Testing Supabase connection...', 'yellow');

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    // Try to query any table (query will fail if connection is bad)
    const { error } = await supabase.from('vezlo_conversations').select('count').limit(0);

    if (error) {
      // Check for table not found errors (normal before migrations run)
      if (error.code === 'PGRST116' || 
          error.message.includes('does not exist') ||
          error.message.includes('Could not find the table')) {
        log('✅ Supabase connection successful', 'green');
        log('⚠️  Note: Tables not found yet - this is normal before running migrations\n', 'yellow');
      } else {
        // Only throw if it's a real connection error
        throw error;
      }
    } else {
      log('✅ Supabase connection successful\n', 'green');
    }

  } catch (error) {
    log(`❌ Supabase connection failed: ${error.message}\n`, 'red');
    process.exit(1);
  }

  // Test database connection and validate tables
  log('Validating database tables...', 'yellow');

  let client;
  try {
    const { Client } = require('pg');

    client = new Client({
      host: process.env.SUPABASE_DB_HOST,
      port: parseInt(process.env.SUPABASE_DB_PORT || '5432'),
      database: process.env.SUPABASE_DB_NAME || 'postgres',
      user: process.env.SUPABASE_DB_USER || 'postgres',
      password: process.env.SUPABASE_DB_PASSWORD,
      ssl: { rejectUnauthorized: false }
    });

    // Handle connection errors
    client.on('error', (err) => {
      console.error('Database connection error:', err.message);
    });

    await client.connect();

    // Check required tables
    const requiredTables = [
      'vezlo_companies',
      'vezlo_users',
      'vezlo_user_company_profiles',
      'vezlo_api_keys',
      'vezlo_conversations',
      'vezlo_messages',
      'vezlo_message_feedback',
      'vezlo_knowledge_items'
    ];

    const result = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = ANY($1)
      ORDER BY table_name
    `, [requiredTables]);

    const existingTables = result.rows.map(row => row.table_name);
    const missingTables = requiredTables.filter(t => !existingTables.includes(t));

    if (missingTables.length > 0) {
      log(`\n❌ Missing required tables:`, 'red');
      missingTables.forEach(table => log(`   - ${table}`, 'red'));
      log('\nRun the setup wizard: ' + colors.bright + 'npx vezlo-setup' + colors.reset + '\n', 'yellow');
      if (client) {
        await client.end();
      }
      process.exit(1);
    }

    log('✅ All required tables exist\n', 'green');

    // Check table structure
    log('Checking table structure...', 'yellow');

    const schemaCheck = await client.query(`
      SELECT
        t.table_name,
        COUNT(c.column_name) as column_count
      FROM information_schema.tables t
      LEFT JOIN information_schema.columns c
        ON c.table_name = t.table_name
        AND c.table_schema = t.table_schema
      WHERE t.table_schema = 'public'
      AND t.table_name = ANY($1)
      GROUP BY t.table_name
      ORDER BY t.table_name
    `, [requiredTables]);

    log('\n📊 Database Tables Summary:', 'cyan');
    log(`   Total tables found: ${schemaCheck.rows.length}`, 'green');
    
    log('\n📋 Table Details:', 'cyan');
    schemaCheck.rows.forEach(row => {
      log(`   ✓ ${row.table_name} (${row.column_count} columns)`, 'green');
    });

    // Check for vector extension
    const vectorCheck = await client.query(`
      SELECT EXISTS(
        SELECT 1 FROM pg_extension WHERE extname = 'vector'
      ) as has_vector
    `);

    if (vectorCheck.rows[0].has_vector) {
      log('   ✓ pgvector extension enabled', 'green');
    } else {
      log('   ⚠️  pgvector extension not enabled (semantic search disabled)', 'yellow');
    }

    log('\n✅ Database validation complete!\n', 'green');
    log('Your server is ready to start:', 'cyan');
    log('  ' + colors.bright + 'vezlo-server' + colors.reset + '\n');

    if (client) {
      await client.end();
    }

  } catch (error) {
    log(`\n❌ Database validation failed: ${error.message}\n`, 'red');
    if (client) {
      try {
        await client.end();
      } catch (closeError) {
        // Ignore close errors
      }
    }
    process.exit(1);
  }
}

// Run validation
validateDatabase().catch(error => {
  log(`\n❌ Validation failed: ${error.message}\n`, 'red');
  process.exit(1);
});
