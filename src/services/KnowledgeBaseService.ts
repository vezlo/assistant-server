import { SupabaseClient } from '@supabase/supabase-js';
import logger from '../config/logger';

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
  threshold?: number;
  type?: 'semantic' | 'keyword' | 'hybrid';
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

export class KnowledgeBaseService {
  private supabase: SupabaseClient;
  private tableName: string;

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

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    try {
      const limit = options.limit || 5;
      // Lower threshold for code/technical content (0.25 recommended for hybrid)
      const threshold = options.threshold || 0.25;
      const type = options.type || 'hybrid'; // Hybrid as default for best results

      // Reduced logging - only essential info
      logger.info(`🔎 Search: type=${type}, threshold=${threshold}, limit=${limit}, companyId=${options.company_id ?? 'all'}`);

      if (type === 'semantic') {
        return await this.semanticSearch(query, limit, threshold, options.company_id);
      } else if (type === 'keyword') {
        return await this.keywordSearch(query, limit, options.company_id);
      } else {
        // Hybrid search - run both in PARALLEL for speed
        const [semanticResults, keywordResults] = await Promise.all([
          this.semanticSearch(query, limit, threshold, options.company_id),
          this.keywordSearch(query, limit, options.company_id)
        ]);
        
        // Merge with intelligent scoring (keyword prioritized for exact matches)
        const combined = [
          ...semanticResults.map(r => ({ ...r, source: 'semantic' })),
          ...keywordResults.map(r => ({ ...r, source: 'keyword', score: 0.85 })) // Boost keyword matches
        ];
        
        // Deduplicate and combine scores
        const scoreMap = new Map<string, { item: any; maxScore: number; sources: string[] }>();
        combined.forEach(item => {
          const existing = scoreMap.get(item.id);
          if (existing) {
            existing.maxScore = Math.max(existing.maxScore, item.score);
            existing.sources.push((item as any).source);
          } else {
            scoreMap.set(item.id, { 
              item: { ...item }, 
              maxScore: item.score,
              sources: [(item as any).source]
            });
          }
        });
        
        // Convert back to array and sort by max score
        const unique = Array.from(scoreMap.values())
          .map(({ item, maxScore }) => ({ ...item, score: maxScore }))
          .sort((a, b) => b.score - a.score);
        
        logger.info(`📊 Hybrid: ${semanticResults.length} semantic + ${keywordResults.length} keyword = ${unique.length} unique`);
        
        return unique.slice(0, limit);
      }

    } catch (error) {
      console.error('Search error:', error);
      throw new Error(`Failed to search knowledge items: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async semanticSearch(query: string, limit: number, threshold: number, companyId?: number): Promise<SearchResult[]> {
    try {
      const queryEmbedding = await this.generateEmbedding(query);
      if (!queryEmbedding) {
        logger.error('Failed to generate query embedding');
        return [];
      }

      // Use optimized RPC function for chunk-based vector search
      const { data, error } = await this.supabase.rpc('match_vezlo_knowledge_chunks', {
        query_embedding: JSON.stringify(queryEmbedding),
        match_threshold: threshold,
        match_count: limit,
        filter_company_id: companyId !== undefined ? companyId : null
      });

      if (error) {
        logger.error('RPC vector search error:', error);
        throw new Error(`Semantic search failed: ${error.message}`);
      }

      if (!data || data.length === 0) {
        logger.warn(`⚠️  No chunks found in DB for companyId=${companyId ?? 'all'}`);
        return [];
      }

      logger.info(`📦 RPC returned ${data.length} chunks`);

      // Transform chunk results to SearchResult format
      const results: SearchResult[] = data.map((item: any) => ({
        id: item.document_uuid,
        title: item.document_title,
        description: item.document_description,
        content: item.chunk_text,
        type: item.document_type,
        score: item.similarity,
        metadata: item.document_metadata
      }));

      // Log results summary
      if (results.length > 0) {
        const topResults = results.slice(0, 3);
        const topScores = topResults.map(r => `${r.title}:${r.score.toFixed(2)}`).join(', ');
        logger.info(`✅ Found ${results.length} results above threshold (top: ${topScores})`);
      }

      return results;

    } catch (error) {
      logger.error('Semantic search error:', error);
      return [];
    }
  }

  // Add cosine similarity function (from original implementation)
  private cosineSimilarity(a: number[], b: number[]): number {
    try {
      // Validate inputs
      if (!Array.isArray(a) || !Array.isArray(b)) {
        console.error('Cosine similarity: inputs are not arrays', typeof a, typeof b);
        return 0;
      }
      
      if (a.length !== b.length) {
        console.error('Cosine similarity: arrays have different lengths', a.length, b.length);
        return 0;
      }

      if (a.length === 0) {
        console.error('Cosine similarity: arrays are empty');
        return 0;
      }

      const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
      const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
      const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
      
      if (magnitudeA === 0 || magnitudeB === 0) {
        return 0;
      }
      
      return dotProduct / (magnitudeA * magnitudeB);
    } catch (error) {
      console.error('Error in cosine similarity calculation:', error);
      return 0;
    }
  }

  private async keywordSearch(query: string, limit: number, companyId?: number): Promise<SearchResult[]> {
    try {
      logger.info(`🔎 Keyword search: query="${query.substring(0, 50)}...", limit=${limit}`);

      // Use textSearch with GIN index (faster than ilike, works with Supabase client)
      // The GIN index on chunk_text makes this O(log n) instead of O(n)
      const dbQuery = this.supabase
        .from('vezlo_knowledge_chunks')
        .select(`
          uuid,
          chunk_text,
          document_id,
          vezlo_knowledge_items!inner(
            uuid,
            title,
            description,
            type,
            metadata,
            company_id
          )
        `)
        .textSearch('chunk_text', query, {
          type: 'websearch',
          config: 'english'
        });

      if (companyId) {
        dbQuery.eq('vezlo_knowledge_items.company_id', companyId);
      }

      dbQuery.limit(limit);

      const { data, error } = await dbQuery;

      if (error) throw new Error(`Keyword search failed: ${error.message}`);

      if (!data || data.length === 0) {
        logger.warn(`⚠️ No keyword matches found for companyId=${companyId}`);
        return [];
      }

      logger.info(`📦 Keyword search returned ${data.length} chunks`);

      // Map results to SearchResult format
      const results: SearchResult[] = data.map((row: any) => ({
        id: row.vezlo_knowledge_items.uuid,
        title: row.vezlo_knowledge_items.title,
        description: row.vezlo_knowledge_items.description,
        content: row.chunk_text,
        type: row.vezlo_knowledge_items.type,
        score: 0.7, // Fixed score for keyword matches (can enhance with ts_rank via RPC if needed)
        metadata: row.vezlo_knowledge_items.metadata
      }));

      logger.info(`✅ Found ${results.length} keyword results`);
      
      return results;

    } catch (error) {
      logger.error('Keyword search error:', error);
      return [];
    }
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
          model: 'text-embedding-3-small',
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

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      
      // Generate embedding from raw text (metadata enhancement reduced similarity)
      const embedding = await this.generateEmbedding(chunk.text);
      
      if (embedding) {
        await this.supabase.rpc('insert_knowledge_chunk', {
          p_document_id: documentId,
          p_chunk_text: chunk.text, // Store original text
          p_chunk_index: i,
          p_start_char: chunk.startChar,
          p_end_char: chunk.endChar,
          p_token_count: Math.ceil(chunk.text.length / 4),
          p_embedding: JSON.stringify(embedding),
          p_processed_at: processedAt
        });
      }
    }
  }

  private enhanceChunkText(text: string, documentTitle?: string, chunkIndex?: number, totalChunks?: number): string {
    // Add contextual metadata to improve semantic search
    let enhanced = text;
    
    // Add document context
    if (documentTitle) {
      enhanced = `Document: ${documentTitle}\n\n${enhanced}`;
    }
    
    // Add chunk position context
    if (chunkIndex !== undefined && totalChunks !== undefined) {
      enhanced = `[Part ${chunkIndex + 1} of ${totalChunks}]\n${enhanced}`;
    }
    
    // Enhance structured content (requirements.txt, package.json, etc.)
    if (documentTitle?.match(/requirements\.txt|package\.json|dependencies/i)) {
      enhanced = this.enhanceStructuredContent(enhanced);
    }
    
    return enhanced;
  }

  private enhanceStructuredContent(text: string): string {
    // Transform dependency lists into natural language for better semantic search
    let enhanced = text;
    
    // Convert Python requirements format: package==version
    const pythonDeps = text.match(/^(\w+(-\w+)*)==([\d.]+)/gm);
    if (pythonDeps && pythonDeps.length > 0) {
      const naturalText = pythonDeps.map(dep => {
        const [pkg, version] = dep.split('==');
        return `${pkg} version ${version}`;
      }).join(', ');
      enhanced = `Python package dependencies and versions:\n${naturalText}\n\nOriginal format:\n${text}`;
    }
    
    return enhanced;
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