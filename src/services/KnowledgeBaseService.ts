import { SupabaseClient } from '@supabase/supabase-js';
import logger from '../config/logger';

// Embedding model configuration
export const EMBEDDING_MODEL = 'text-embedding-3-large';
export const EMBEDDING_DIMENSIONS = 3072;

interface KnowledgeBaseConfig {
  supabase: SupabaseClient;
  tableName?: string;
}

interface KnowledgeItem {
  id?: string;
  parent_id?: string;
  company_id?: number;
  title: string;
  description?: string;
  type: string; // folder, document, file, url, url_directory
  content?: string;
  file_url?: string;
  file_size?: number;
  file_type?: string;
  metadata?: Record<string, any>;
  created_by?: number;
}

interface SearchOptions {
  limit?: number;
  company_id?: number;
}

interface SearchResult {
  id: string;
  title: string;
  description?: string;
  content?: string;
  type: string;
  score: number;
  metadata?: Record<string, any>;
}

interface ChunkResult {
  chunk_id: number;
  document_id: number;
  document_uuid: string;
  document_title: string;
  document_description?: string;
  document_type: string;
  document_metadata?: Record<string, any>;
  chunk_text: string;
  chunk_index: number;
  similarity: number;
}

export class KnowledgeBaseService {
  private supabase: SupabaseClient;
  private tableName: string;
  private adjacentChunkSize: number = 2; // Fetch ±2 chunks

  constructor(config: KnowledgeBaseConfig) {
    this.supabase = config.supabase;
    this.tableName = config.tableName || 'vezlo_knowledge_items';
  }

  async createItem(item: {
    parent_id?: string;
    company_id?: number;
    title: string;
    description?: string;
    type: string;
    content?: string;
    file_url?: string;
    file_size?: number;
    file_type?: string;
    metadata?: Record<string, any>;
    created_by?: number;
  }): Promise<string> {
    try {
      // Convert parent_id from UUID to internal ID if provided
      let parentId = null;
      if (item.parent_id) {
        const parentQuery = await this.supabase
          .from(this.tableName)
          .select('id')
          .eq('uuid', item.parent_id)
          .single();
          
        if (parentQuery.data && !parentQuery.error) {
          parentId = parentQuery.data.id;
        }
      }

      // Get created_by - use provided value, or default to admin user ID (1) if not provided
      let createdBy = item.created_by;
      if (!createdBy) {
        // For API key requests, use admin user (ID 1 by default)
        // This maintains auditability while supporting service-to-service calls
        createdBy = 1;
      }

      const insertData: any = {
        parent_id: parentId,
        company_id: item.company_id || 1,
        title: item.title,
        description: item.description,
        type: item.type,
        content: item.content,
        file_url: item.file_url,
        file_size: item.file_size,
        file_type: item.file_type,
        metadata: item.metadata || {},
        created_by: createdBy,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // Insert parent document (without embedding)
      const { data, error } = await this.supabase
        .from(this.tableName)
        .insert(insertData)
        .select('id, uuid')
        .single();

      if (error) throw new Error(`Failed to create knowledge item: ${error.message}`);

      // Create chunks with embeddings for content-based items
      if (item.content && (item.type === 'document' || item.type === 'file')) {
        console.log('Creating chunks for content...');
        await this.createChunksForDocument(data.id, item.content, item.title);
      }

      return data.uuid;

    } catch (error) {
      throw new Error(`Failed to create knowledge item: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getItem(itemId: string): Promise<KnowledgeItem | null> {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select(`
          uuid,
          parent_id,
          company_id,
          title,
          description,
          type,
          content,
          file_url,
          file_size,
          file_type,
          metadata,
          created_by,
          created_at,
          updated_at,
          parent:` + this.tableName + `!parent_id(uuid)
        `)
        .eq('uuid', itemId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw new Error(`Failed to get knowledge item: ${error.message}`);
      }

      return {
        id: (data as any).uuid,
        parent_id: (data as any).parent ? ((data as any).parent as any).uuid : undefined,
        company_id: (data as any).company_id,
        title: (data as any).title,
        description: (data as any).description,
        type: (data as any).type,
        content: (data as any).content,
        file_url: (data as any).file_url,
        file_size: (data as any).file_size,
        file_type: (data as any).file_type,
        metadata: (data as any).metadata,
        created_by: (data as any).created_by
      };

    } catch (error) {
      throw new Error(`Failed to get knowledge item: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async listItems(options: {
    parent_id?: string;
    company_id?: number;
    type?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ items: KnowledgeItem[]; total: number }> {
    try {
      let query = this.supabase
        .from(this.tableName)
        .select(`
          uuid,
          parent_id,
          company_id,
          title,
          description,
          type,
          file_url,
          file_size,
          file_type,
          metadata,
          created_by,
          created_at,
          updated_at,
          parent:` + this.tableName + `!parent_id(uuid)
        `, { count: 'exact' });

      // Filter by parent
      if (options.parent_id) {
        // Get parent internal ID
        const parentQuery = await this.supabase
          .from(this.tableName)
          .select('id')
          .eq('uuid', options.parent_id)
          .single();
          
        if (parentQuery.data && !parentQuery.error) {
          query = query.eq('parent_id', parentQuery.data.id);
        } else {
          return { items: [], total: 0 };
        }
      } else if (options.parent_id === null) {
        query = query.is('parent_id', null);
      }

      // Filter by company
      if (options.company_id) {
        query = query.eq('company_id', options.company_id);
      }

      // Filter by type
      if (options.type) {
        query = query.eq('type', options.type);
      }

      // Pagination
      const limit = options.limit || 50;
      const offset = options.offset || 0;
      query = query.range(offset, offset + limit - 1);

      // Order by creation date
      query = query.order('created_at', { ascending: false });

      const { data, error, count } = await query;

      if (error) throw new Error(`Failed to list knowledge items: ${error.message}`);

      const items = data.map((row: any) => ({
        id: row.uuid,
        parent_id: row.parent ? (row.parent as any).uuid : undefined,
        company_id: row.company_id,
        title: row.title,
        description: row.description,
        type: row.type,
        file_url: row.file_url,
        file_size: row.file_size,
        file_type: row.file_type,
        metadata: row.metadata,
        created_by: row.created_by
      }));

      return { items, total: count || 0 };

    } catch (error) {
      throw new Error(`Failed to list knowledge items: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async updateItem(itemId: string, updates: Partial<KnowledgeItem>): Promise<boolean> {
    try {
      const updateData: any = {
        updated_at: new Date().toISOString()
      };

      if (updates.title !== undefined) updateData.title = updates.title;
      if (updates.description !== undefined) updateData.description = updates.description;
      if (updates.content !== undefined) updateData.content = updates.content;
      if (updates.file_url !== undefined) updateData.file_url = updates.file_url;
      if (updates.file_size !== undefined) updateData.file_size = updates.file_size;
      if (updates.file_type !== undefined) updateData.file_type = updates.file_type;
      if (updates.metadata !== undefined) updateData.metadata = updates.metadata;

      // Regenerate embedding if content changed
      if (updates.content !== undefined) {
        const embedding = await this.generateEmbedding(updates.content);
        if (embedding) {
          updateData.embedding = embedding;
          updateData.processed_at = new Date().toISOString();
        }
      }

      const { error } = await this.supabase
        .from(this.tableName)
        .update(updateData)
        .eq('uuid', itemId);

      if (error) throw new Error(`Failed to update knowledge item: ${error.message}`);
      return true;

    } catch (error) {
      throw new Error(`Failed to update knowledge item: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async deleteItem(itemId: string): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from(this.tableName)
        .delete()
        .eq('uuid', itemId);

      if (error) throw new Error(`Failed to delete knowledge item: ${error.message}`);
      return true;

    } catch (error) {
      throw new Error(`Failed to delete knowledge item: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Search with top-k + adjacent chunk retrieval strategy
   */
  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    try {
      const topK = options.limit || 5;
      const companyId = options.company_id;

      logger.info(`🔎 Search: top-k=${topK}, adjacent=±${this.adjacentChunkSize}, companyId=${companyId ?? 'all'}`);

      // Step 1: Generate query embedding
      const queryEmbedding = await this.generateEmbedding(query);
      if (!queryEmbedding) {
        logger.error('Failed to generate query embedding');
        return [];
      }

      // Step 2: Initial top-k semantic search (no threshold)
      const initialChunks = await this.topKSemanticSearch(queryEmbedding, topK, companyId);
      if (initialChunks.length === 0) {
        logger.warn('⚠️  No chunks found in top-k search');
        return [];
      }

      logger.info(`📦 Found ${initialChunks.length} initial chunks (scores: ${initialChunks.map(c => c.similarity.toFixed(2)).join(', ')})`);

      // Step 3: Fetch adjacent chunks for each matched chunk
      const enrichedChunks = await this.fetchAdjacentChunks(initialChunks);
      logger.info(`📚 Enriched to ${enrichedChunks.length} total chunks (with adjacent context)`);

      // Step 4: Group by document and merge continuous sequences
      const mergedResults = this.mergeAdjacentChunks(enrichedChunks, initialChunks);
      logger.info(`✅ Merged into ${mergedResults.length} contextual results`);

      return mergedResults;

    } catch (error) {
      logger.error('Search error:', error);
      return [];
    }
  }

  /**
   * Top-k semantic search (no threshold)
   */
  private async topKSemanticSearch(
    queryEmbedding: number[],
    topK: number,
    companyId?: number
  ): Promise<ChunkResult[]> {
    const rpcParams = {
      query_embedding: JSON.stringify(queryEmbedding),
      match_threshold: 0.0, // No threshold - pure top-k
      match_count: topK,
      filter_company_id: companyId !== undefined ? companyId : null
    };

    const { data, error } = await this.supabase.rpc('vezlo_match_knowledge_chunks', rpcParams);

    if (error) {
      logger.error('RPC top-k search error:', error);
      throw new Error(`Top-k search failed: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Fetch adjacent chunks (±N) for all matched chunks in ONE query
   */
  private async fetchAdjacentChunks(matchedChunks: ChunkResult[]): Promise<ChunkResult[]> {
    if (matchedChunks.length === 0) {
      return [];
    }

    // Build similarity lookup map for matched chunks
    const similarityMap = new Map<string, number>();
    matchedChunks.forEach(chunk => {
      similarityMap.set(`${chunk.document_id}-${chunk.chunk_index}`, chunk.similarity);
    });

    // Calculate all adjacent ranges and build OR conditions
    const ranges: Array<{ documentId: number; minIndex: number; maxIndex: number }> = [];
    
    matchedChunks.forEach(chunk => {
      const minIndex = Math.max(0, chunk.chunk_index - this.adjacentChunkSize);
      const maxIndex = chunk.chunk_index + this.adjacentChunkSize;
      
      ranges.push({
        documentId: chunk.document_id,
        minIndex,
        maxIndex
      });
    });

    // Fetch ALL adjacent chunks in ONE query using OR conditions
    let query = this.supabase
      .from('vezlo_knowledge_chunks')
      .select(`
        id,
        document_id,
        chunk_text,
        chunk_index,
        vezlo_knowledge_items!inner(
          uuid,
          title,
          description,
          type,
          metadata
        )
      `);

    // Build OR filter: (doc=1 AND idx>=10 AND idx<=14) OR (doc=2 AND idx>=5 AND idx<=9) OR ...
    const orConditions = ranges.map(r => 
      `and(document_id.eq.${r.documentId},chunk_index.gte.${r.minIndex},chunk_index.lte.${r.maxIndex})`
    ).join(',');

    query = query.or(orConditions);
    query = query.order('document_id', { ascending: true }).order('chunk_index', { ascending: true });

    const { data, error } = await query;

    if (error) {
      logger.error('Failed to fetch adjacent chunks:', error);
      return matchedChunks; // Fallback to original chunks on error
    }

    if (!data || data.length === 0) {
      return matchedChunks;
    }

    // Transform and assign similarity scores
    const allChunks = data.map((row: any) => {
      const doc = row.vezlo_knowledge_items;
      const key = `${row.document_id}-${row.chunk_index}`;
      const similarity = similarityMap.get(key) || 0; // Use original score if matched, else 0

      return {
        chunk_id: row.id,
        document_id: row.document_id,
        document_uuid: doc.uuid,
        document_title: doc.title,
        document_description: doc.description,
        document_type: doc.type,
        document_metadata: doc.metadata,
        chunk_text: row.chunk_text,
        chunk_index: row.chunk_index,
        similarity
      };
    });

    // Deduplicate by chunk_id
    const uniqueChunks = new Map<number, ChunkResult>();
    allChunks.forEach(chunk => {
      if (!uniqueChunks.has(chunk.chunk_id)) {
        uniqueChunks.set(chunk.chunk_id, chunk);
      }
    });

    return Array.from(uniqueChunks.values());
  }

  /**
   * Merge continuous chunk sequences by document
   */
  private mergeAdjacentChunks(
    allChunks: ChunkResult[],
    originalMatches: ChunkResult[]
  ): SearchResult[] {
    // Group chunks by document
    const byDocument = new Map<number, ChunkResult[]>();
    
    allChunks.forEach(chunk => {
      if (!byDocument.has(chunk.document_id)) {
        byDocument.set(chunk.document_id, []);
      }
      byDocument.get(chunk.document_id)!.push(chunk);
    });

    // Merge continuous sequences within each document
    const results: SearchResult[] = [];

    byDocument.forEach((chunks, documentId) => {
      // Sort by chunk_index
      chunks.sort((a, b) => a.chunk_index - b.chunk_index);

      // Find the best similarity score for this document (from original matches)
      const bestMatch = originalMatches.find(m => m.document_id === documentId);
      const score = bestMatch?.similarity || 0;

      // Merge all chunks into single content (preserving order)
      const mergedContent = chunks.map(c => c.chunk_text).join('\n\n');

      // Use first chunk's metadata for result
      const firstChunk = chunks[0];

      results.push({
        id: firstChunk.document_uuid,
        title: firstChunk.document_title,
        description: firstChunk.document_description,
        content: mergedContent,
        type: firstChunk.document_type,
        score,
        metadata: {
          ...firstChunk.document_metadata,
          chunk_count: chunks.length,
          chunk_range: `${chunks[0].chunk_index}-${chunks[chunks.length - 1].chunk_index}`
        }
      });
    });

    // Sort by score (highest first)
    return results.sort((a, b) => b.score - a.score);
  }

  private async generateEmbedding(text: string): Promise<number[] | null> {
    const maxRetries = 3;
    const retryDelay = 1000; // 1 second

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Generating embedding with OpenAI API... (attempt ${attempt}/${maxRetries})`);
        
        if (!process.env.OPENAI_API_KEY) {
          console.error('OPENAI_API_KEY environment variable is not set');
          return null;
        }

        // Use OpenAI API with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

        const response = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: EMBEDDING_MODEL,
            input: text.substring(0, 8000) // Limit text length to avoid token limits
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`OpenAI API error: ${response.status} - ${errorText}`);
          throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json() as { data: Array<{ embedding: number[] }> };
        console.log('OpenAI API response received, embedding length:', data.data[0].embedding.length);
        return data.data[0].embedding;

      } catch (error) {
        console.error(`Embedding generation failed (attempt ${attempt}/${maxRetries}):`, error);
        
        // If it's a network/DNS error and we have retries left, wait and retry
        if (attempt < maxRetries && (
          error instanceof Error && (
            error.message.includes('EAI_AGAIN') ||
            error.message.includes('fetch failed') ||
            error.message.includes('getaddrinfo')
          )
        )) {
          console.log(`Retrying in ${retryDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue;
        }
        
        // If it's the last attempt or not a network error, return null
        return null;
      }
    }
    
    return null;
  }

  private async createChunksForDocument(documentId: number, content: string, documentTitle?: string): Promise<void> {
    const chunkSize = parseInt(process.env.CHUNK_SIZE || '1000');
    const chunkOverlap = parseInt(process.env.CHUNK_OVERLAP || '200');
    const chunks = this.splitIntoChunks(content, chunkSize, chunkOverlap);
    const processedAt = new Date().toISOString();

    console.log(`Creating ${chunks.length} chunks for document...`);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      
      // Generate embedding from chunk text
      const embedding = await this.generateEmbedding(chunk.text);
      
      if (embedding) {
        const { data, error } = await this.supabase.rpc('vezlo_insert_knowledge_chunk', {
          p_document_id: documentId,
          p_chunk_text: chunk.text,
          p_chunk_index: i,
          p_start_char: chunk.startChar,
          p_end_char: chunk.endChar,
          p_token_count: Math.ceil(chunk.text.length / 4),
          p_embedding: JSON.stringify(embedding),
          p_processed_at: processedAt
        });
        
        if (error) {
          console.error(`❌ Failed to insert chunk ${i}:`, error);
          throw new Error(`Failed to insert chunk: ${error.message}`);
        }
        
        console.log(`✓ Inserted chunk ${i} (ID: ${data})`);
      }
    }
  }

  private splitIntoChunks(text: string, chunkSize: number, overlap: number): Array<{text: string; startChar: number; endChar: number}> {
    const chunks: Array<{text: string; startChar: number; endChar: number}> = [];
    let startChar = 0;

    while (startChar < text.length) {
      const endChar = Math.min(startChar + chunkSize, text.length);
      const chunkText = text.substring(startChar, endChar);
      
      chunks.push({
        text: chunkText,
        startChar: startChar,
        endChar: endChar
      });

      startChar += chunkSize - overlap;
    }

    return chunks;
  }
}