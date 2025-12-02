/**
 * Diagnostic script to check chunks, embeddings, and test search
 * Run with: node scripts/test-chunks-embeddings.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_KEY in environment');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function generateEmbedding(text) {
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY not set');
    return null;
  }

  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'text-embedding-3-large',
        input: text.substring(0, 8000)
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
  } catch (error) {
    console.error('Failed to generate embedding:', error);
    return null;
  }
}

async function testChunks() {
  console.log('🔍 Testing chunks, embeddings, and search...\n');

  // 1. Find the Python files
  console.log('1️⃣  Finding Python files...');
  const { data: items, error: itemsError } = await supabase
    .from('vezlo_knowledge_items')
    .select('id, uuid, title, type')
    .in('title', ['setup_company_credentials.py', 'setup_partnership_system.py']);

  if (itemsError) {
    console.error('❌ Error fetching items:', itemsError);
    return;
  }

  if (!items || items.length === 0) {
    console.log('⚠️  No matching files found');
    return;
  }

  console.log(`✅ Found ${items.length} file(s)\n`);

  for (const item of items) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`📄 File: ${item.title} (ID: ${item.id})`);
    console.log('='.repeat(70));

    // 2. Get all chunks
    const { data: chunks, error: chunksError } = await supabase
      .from('vezlo_knowledge_chunks')
      .select('id, chunk_index, chunk_text, embedding, processed_at')
      .eq('document_id', item.id)
      .order('chunk_index', { ascending: true });

    if (chunksError) {
      console.error(`❌ Error fetching chunks:`, chunksError);
      continue;
    }

    if (!chunks || chunks.length === 0) {
      console.log('⚠️  No chunks found');
      continue;
    }

    console.log(`\n📦 Found ${chunks.length} chunk(s):\n`);

    // Show chunk details
    chunks.forEach((chunk) => {
      console.log(`Chunk ${chunk.chunk_index}:`);
      console.log(`  Text (first 150 chars): ${chunk.chunk_text.substring(0, 150)}...`);
      console.log(`  Text length: ${chunk.chunk_text.length} chars`);
      console.log(`  Has embedding: ${chunk.embedding ? 'Yes' : 'No'}`);
      if (chunk.embedding) {
        const embeddingArray = Array.isArray(chunk.embedding) ? chunk.embedding : 
                              (typeof chunk.embedding === 'string' ? JSON.parse(chunk.embedding) : null);
        console.log(`  Embedding dimensions: ${embeddingArray ? embeddingArray.length : 'N/A'}`);
      }
      console.log('');
    });

    // 3. Test search queries
    console.log(`\n🔎 Testing search queries for ${item.title}...\n`);

    const testQueries = [
      'run function',
      'what does run function do',
      'run()',
      'run_migration function',
      'verify_perplexity_api_key',
      'setup_env'
    ];

    for (const query of testQueries) {
      console.log(`\nQuery: "${query}"`);
      console.log('─'.repeat(60));
      
      // Generate query embedding
      console.log('  Generating query embedding...');
      const queryEmbedding = await generateEmbedding(query);
      
      if (!queryEmbedding) {
        console.log('  ❌ Failed to generate embedding');
        continue;
      }
      
      console.log(`  ✅ Embedding generated (${queryEmbedding.length} dimensions)`);
      
      // Test RPC function
      console.log('  Calling vezlo_match_knowledge_chunks RPC...');
      const { data: results, error: rpcError } = await supabase.rpc('vezlo_match_knowledge_chunks', {
        query_embedding: JSON.stringify(queryEmbedding),
        match_threshold: 0.20,
        match_count: 5,
        filter_company_id: null
      });

      if (rpcError) {
        console.log(`  ❌ RPC error:`, rpcError);
        continue;
      }

      if (!results || results.length === 0) {
        console.log(`  ⚠️  No results found (threshold: 0.20)`);
        
        // Try with lower threshold
        const { data: lowThresholdResults } = await supabase.rpc('vezlo_match_knowledge_chunks', {
          query_embedding: JSON.stringify(queryEmbedding),
          match_threshold: 0.10,
          match_count: 5,
          filter_company_id: null
        });
        
        if (lowThresholdResults && lowThresholdResults.length > 0) {
          console.log(`  ℹ️  Found ${lowThresholdResults.length} result(s) with threshold 0.10:`);
          lowThresholdResults.forEach((r, idx) => {
            if (r.document_title === item.title) {
              console.log(`     ${idx + 1}. Chunk ${r.chunk_index}: similarity=${r.similarity.toFixed(3)}`);
              console.log(`        Text: "${r.chunk_text.substring(0, 100)}..."`);
            }
          });
        }
      } else {
        console.log(`  ✅ Found ${results.length} result(s):`);
        results.forEach((r, idx) => {
          if (r.document_title === item.title) {
            console.log(`     ${idx + 1}. Chunk ${r.chunk_index}: similarity=${r.similarity.toFixed(3)}`);
            console.log(`        Text: "${r.chunk_text.substring(0, 100)}..."`);
            console.log(`        Contains function name: ${r.chunk_text.toLowerCase().includes(query.toLowerCase().replace(/[()]/g, '')) ? 'Yes' : 'No'}`);
          }
        });
      }
    }
  }

  console.log('\n\n' + '='.repeat(70));
  console.log('✅ Diagnostic complete');
  console.log('='.repeat(70));
}

testChunks().catch(console.error);
