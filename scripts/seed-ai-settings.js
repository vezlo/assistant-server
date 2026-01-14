#!/usr/bin/env node

/**
 * Seed AI Settings Script for Vezlo Assistant Server
 * Seeds or updates AI settings for all existing companies
 */

const { config } = require('dotenv');
const { initializeSupabase } = require('../dist/src/config/database.js');
const { AISettingsService } = require('../dist/src/services/AISettingsService.js');
const { DEFAULT_AI_SETTINGS } = require('../dist/src/config/defaultAISettings.js');
const logger = require('../dist/src/config/logger.js');

// Load environment variables
config();

async function seedAISettings() {
  try {
    console.log('🚀 Starting AI Settings Seed...\n');

    // Initialize Supabase
    const supabase = initializeSupabase();
    
    // Wait for schema cache to refresh
    console.log('⏳ Waiting for schema cache to refresh...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const aiSettingsService = new AISettingsService(supabase);

    // Get all companies
    const { data: companies, error: companiesError } = await supabase
      .from('vezlo_companies')
      .select('id, uuid, name');

    if (companiesError) {
      throw new Error(`Failed to fetch companies: ${companiesError.message}`);
    }

    if (!companies || companies.length === 0) {
      console.log('⚠️  No companies found in database');
      return;
    }

    console.log(`📋 Found ${companies.length} company(ies)\n`);

    let seededCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    for (const company of companies) {
      try {
        // Check if AI settings already exist
        const { data: existing, error: checkError } = await supabase
          .from('vezlo_ai_settings')
          .select('id, settings')
          .eq('company_id', company.id)
          .single();

        if (checkError && checkError.code !== 'PGRST116') {
          // PGRST116 = not found error (expected if no settings exist)
          console.log(`   ⚠️  Error checking settings for ${company.name}: ${checkError.message}`);
          skippedCount++;
          continue;
        }

        if (existing) {
          // Settings exist - update with defaults
          console.log(`   🔄 Updating AI settings for: ${company.name}`);
          
          const { error: updateError } = await supabase
            .from('vezlo_ai_settings')
            .update({ 
              settings: DEFAULT_AI_SETTINGS,
              updated_at: new Date().toISOString()
            })
            .eq('company_id', company.id);

          if (updateError) {
            console.log(`   ❌ Failed to update for ${company.name}: ${updateError.message}`);
            skippedCount++;
          } else {
            console.log(`   ✅ Updated AI settings for: ${company.name}`);
            updatedCount++;
          }
        } else {
          // Settings don't exist - create new
          console.log(`   🆕 Creating AI settings for: ${company.name}`);
          
          await aiSettingsService.createDefaultSettings(company.id);
          
          console.log(`   ✅ Created AI settings for: ${company.name}`);
          seededCount++;
        }
      } catch (companyError) {
        console.log(`   ❌ Error processing ${company.name}:`, companyError.message);
        skippedCount++;
      }
    }

    // Display summary
    console.log('\n🎉 AI Settings Seed Completed!');
    console.log('=====================================');
    console.log(`   Total Companies: ${companies.length}`);
    console.log(`   ✅ Created: ${seededCount}`);
    console.log(`   🔄 Updated: ${updatedCount}`);
    console.log(`   ⚠️  Skipped: ${skippedCount}`);
    console.log('');

  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  }
}

// Run seed if called directly
if (require.main === module) {
  seedAISettings();
}

module.exports = { seedAISettings };
