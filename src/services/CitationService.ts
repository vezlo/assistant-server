import { SupabaseClient } from '@supabase/supabase-js';
import logger from '../config/logger';

export class CitationService {
  private supabase: SupabaseClient;
  private tablePrefix: string;
  private adjacentChunks: number = 2;

  constructor(supabase: SupabaseClient, tablePrefix: string = 'vezlo') {
    this.supabase = supabase;
    this.tablePrefix = tablePrefix;
  }

  async getContext(documentUuid: string, chunkIndices: number[]): Promise<{
    document_title: string;
    document_type: string;
    file_type?: string;
    content: string;
  } | null> {
    try {
      // Get document with full content
      const { data: document, error: docError } = await this.supabase
        .from(`${this.tablePrefix}_knowledge_items`)
        .select('uuid, title, type, content, file_type')
        .eq('uuid', documentUuid)
        .single();

      if (docError || !document) {
        logger.error('Document not found:', docError);
        return null;
      }

      // If document has full content, return it directly
      if (document.content) {
        return {
          document_title: document.title,
          document_type: document.type,
          file_type: document.file_type || undefined,
          content: document.content
        };
      }

      // Fallback: If no full content, fetch relevant chunks with context
      const { data: docData, error: idError } = await this.supabase
        .from(`${this.tablePrefix}_knowledge_items`)
        .select('id')
        .eq('uuid', documentUuid)
        .single();

      if (idError || !docData) {
        return null;
      }

      // Calculate range with adjacent chunks for context
      const minIndex = Math.max(0, Math.min(...chunkIndices) - this.adjacentChunks);
      const maxIndex = Math.max(...chunkIndices) + this.adjacentChunks;

      logger.info(`📚 Fetching chunks ${minIndex}-${maxIndex} (relevant: ${chunkIndices.join(',')}, adjacent: ±${this.adjacentChunks})`);

      // Fetch only relevant chunks with adjacent context
      const { data: chunks, error: chunksError } = await this.supabase
        .from(`${this.tablePrefix}_knowledge_chunks`)
        .select('chunk_text, chunk_index')
        .eq('document_id', docData.id)
        .gte('chunk_index', minIndex)
        .lte('chunk_index', maxIndex)
        .order('chunk_index', { ascending: true });

      if (chunksError) {
        logger.error('Failed to fetch chunks:', chunksError);
        return null;
      }

      // Combine chunks with context
      const combinedContent = chunks?.map(c => c.chunk_text).join('\n\n') || '';

      return {
        document_title: document.title,
        document_type: document.type,
        file_type: document.file_type || undefined,
        content: combinedContent
      };

    } catch (error) {
      logger.error('Citation context error:', error);
      return null;
    }
  }
}

