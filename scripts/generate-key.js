#!/usr/bin/env node

/**
 * Generate API Key Script for Vezlo Assistant Server
 * Creates an API key for the default admin's company
 */

const { config } = require('dotenv');
const { initializeSupabase } = require('../dist/src/config/database.js');
const { SetupService } = require('../dist/src/services/SetupService.js');
const { ApiKeyService } = require('../dist/src/services/ApiKeyService.js');
const logger = require('../dist/src/config/logger.js');

// Load environment variables
config();

async function generateApiKey(options = { quiet: false }) {
  try {
    if (!options.quiet) console.log('🔑 Starting API Key Generation...\n');

    // Initialize Supabase
    const supabase = initializeSupabase();
    
    // Wait for schema cache to refresh
    if (!options.quiet) console.log('⏳ Waiting for schema cache to refresh...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Get default credentials from environment
    const credentials = SetupService.getDefaultCredentials();
    if (!options.quiet) console.log(`🔍 Using admin email: ${credentials.adminEmail}`);
    
    // Check if default company and admin exist
    if (!options.quiet) console.log('🔍 Checking for default company and admin...');
    
    // Find the admin user
    const { data: user, error: userError } = await supabase
      .from('vezlo_users')
      .select('id, uuid, name')
      .eq('email', credentials.adminEmail)
      .single();
    
    if (userError || !user) {
      throw new Error(`Admin user not found (${credentials.adminEmail}). Run seed-default first.`);
    }
    
    if (!options.quiet) console.log(`✅ Found admin user: ${user.name} (${user.uuid})`);
    
    // Find the admin's company profile
    const { data: profile, error: profileError } = await supabase
      .from('vezlo_user_company_profiles')
      .select(`
        id,
        role,
        company_id,
        companies:company_id(
          id,
          uuid,
          name,
          domain
        )
      `)
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .single();
    
    if (profileError || !profile) {
      throw new Error(`Admin profile not found. Run seed-default first.`);
    }
    
    if (!options.quiet) console.log(`✅ Found company: ${profile.companies.name} (${profile.companies.uuid})`);
    
    // Generate the API key - use joined company ID with fallback to direct company_id
    const apiKeyService = new ApiKeyService(supabase);
    const companyId = profile.companies?.id || profile.company_id;
    if (!companyId) {
      throw new Error('Could not determine company ID from profile');
    }
    const { uuid, apiKey } = await apiKeyService.generateApiKey(companyId);
    
    if (!options.quiet) {
      // Display success summary
      console.log('\n🎉 API Key Generated Successfully!');
      console.log('=====================================');
      console.log('📋 API Key Details:');
      console.log(`   Company: ${profile.companies.name}`);
      console.log(`   API Key: ${apiKey}`);
      console.log('');
      console.log('⚠️  IMPORTANT: Save this key securely. It will not be shown again.');
      console.log('');
      console.log('🔧 Usage Example:');
      console.log('   curl -X POST https://your-server/api/knowledge/items \\');
      console.log('     -H "X-API-Key: ' + apiKey + '" \\');
      console.log('     -H "Content-Type: application/json" \\');
      console.log('     -d \'{"title": "Example", "type": "document", "content": "Example content"}\'');
      console.log('');
    }
    
    // Return the generated API key details
    return {
      success: true,
      uuid,
      apiKey,
      company: profile.companies.name,
      user: {
        name: user.name,
        uuid: user.uuid
      }
    };

  } catch (error) {
    console.error('❌ API key generation failed:', error.message);
    if (!options.quiet) {
      process.exit(1);
    }
    return { success: false, error: error.message };
  }
}

// Run if called directly
if (require.main === module) {
  generateApiKey();
}

module.exports = { generateApiKey };
