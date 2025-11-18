#!/usr/bin/env node

/**
 * Default Data Setup Script for Vezlo Assistant Server
 * Creates default company and admin user
 */

const { config } = require('dotenv');
const { initializeSupabase } = require('../dist/src/config/database.js');
const { SetupService } = require('../dist/src/services/SetupService.js');
const logger = require('../dist/src/config/logger.js');

// Load environment variables
config();

async function runDefaultSetup() {
  try {
    console.log('🚀 Starting Default Data Setup...\n');

    // Initialize Supabase
    const supabase = initializeSupabase();
    
    // Wait for schema cache to refresh (Supabase needs time after migrations)
    console.log('⏳ Waiting for schema cache to refresh...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const setupService = new SetupService(supabase);

    // Check if setup is already completed
    const status = await setupService.getSetupStatus();
    if (status.completed) {
      console.log('✅ Default data already exists!');
      console.log(`🏢 Company: ${status.company?.name}`);
      console.log(`👤 Admin User: ${status.adminUser?.email}`);
      return;
    }

    // Get setup parameters from service (already required at top)
    const credentials = SetupService.getDefaultCredentials();

    console.log('📋 Setup Configuration:');
    console.log(`   Company Name: ${credentials.companyName}`);
    console.log(`   Admin Email: ${credentials.adminEmail}`);
    console.log(`   Admin Password: ${credentials.adminPassword}`);
    console.log('');

    // Create default data
    const result = await setupService.createDefaultData(credentials);

    // Display success summary
    console.log('\n🎉 Default Data Setup Completed!');
    console.log('=====================================');
    console.log('📋 Default Admin Credentials:');
    console.log('');
    console.log(`   Company Name: ${result.company.name}`);
    console.log(`   Admin Email: ${result.user.email}`);
    console.log(`   Admin Password: ${credentials.adminPassword}`);
    console.log(`   Admin Name: ${result.user.name}`);
    console.log('');

  } catch (error) {
    console.error('❌ Setup failed:', error);
    process.exit(1);
  }
}

// Run setup if called directly
if (require.main === module) {
  runDefaultSetup();
}

module.exports = { runDefaultSetup };
