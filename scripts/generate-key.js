#!/usr/bin/env node

/**
 * Generate API Key Script for Vezlo Assistant Server
 * Creates an API key for the default admin's company
 */

const { config } = require('dotenv');
const { initializeSupabase } = require('../dist/src/config/database.js');
const { SetupService } = require('../dist/src/services/SetupService.js');

// Load environment variables
config();

async function generateApiKey(options = { quiet: false }) {
  try {
    if (!options.quiet) console.log('🔑 Starting API Key Generation...\n');

    const supabase = initializeSupabase();
    const setupService = new SetupService(supabase);
    const response = await setupService.executeGenerateKey();
    
    if (!options.quiet) {
      console.log('\n🎉 API Key Generated Successfully!');
      console.log('=====================================');
      console.log('📋 API Key Details:');
      console.log(`   Company: ${response.company_name}`);
      console.log(`   API Key: ${response.api_key}`);
      console.log('');
      console.log('⚠️  IMPORTANT: Save this key securely. It will not be shown again.');
      console.log('');
      console.log('🔧 Usage Example:');
      console.log('   curl -X POST https://your-server/api/knowledge/items \\');
      console.log('     -H "X-API-Key: ' + response.api_key + '" \\');
      console.log('     -H "Content-Type: application/json" \\');
      console.log('     -d \'{"title": "Example", "type": "document", "content": "Example content"}\'');
      console.log('');
    }
    
    return {
      success: true,
      uuid: response.uuid,
      apiKey: response.api_key,
      company: response.company_name,
      user: {
        name: response.user_name
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
