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

    // Get setup parameters
    const adminEmail = process.env.DEFAULT_ADMIN_EMAIL || 'admin@vezlo.com';
    const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
    const companyName = process.env.ORGANIZATION_NAME || 'Vezlo';

    console.log('📋 Setup Configuration:');
    console.log(`   Company Name: ${companyName}`);
    console.log(`   Admin Email: ${adminEmail}`);
    console.log(`   Admin Password: ${adminPassword}`);
    console.log('');

    // Create default data
    const result = await setupService.createDefaultData({
      adminEmail,
      adminPassword,
      companyName
    });

    // Display success summary
    console.log('\n🎉 Default Data Setup Completed!');
    console.log('=====================================');
    console.log(`🏢 Company: ${result.company.name}`);
    console.log(`   Domain: ${result.company.domain}`);
    console.log(`   UUID: ${result.company.id}`);
    console.log('');
    console.log(`👤 Admin User: ${result.user.name}`);
    console.log(`   Email: ${result.user.email}`);
    console.log(`   Password: ${adminPassword}`);
    console.log(`   UUID: ${result.user.id}`);
    console.log('');
    console.log(`🔑 Profile: ${result.profile.id}`);
    console.log(`   Role: ${result.profile.role}`);
    console.log('');
    console.log('📝 Next Steps:');
    console.log('   1. Start your server: npm run dev');
    console.log('   2. Login with the admin credentials above');
    console.log('   3. Create additional users and companies as needed');
    console.log('   4. Configure your knowledge base');
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
