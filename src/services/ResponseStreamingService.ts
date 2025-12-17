import { Response } from 'express';
import logger from '../config/logger';

export class ResponseStreamingService {
  /**
   * Stream text content word by word to simulate streaming
   * This ensures consistent SSE format for all responses
   */
  async streamTextContent(content: string, res: Response): Promise<void> {
    const words = content.split(' ');
    const chunkSize = 2; // Stream 2 words at a time for smoother experience
    const totalChunks = Math.ceil(words.length / chunkSize);
    
    for (let i = 0; i < words.length; i += chunkSize) {
      const chunk = words.slice(i, i + chunkSize).join(' ') + (i + chunkSize < words.length ? ' ' : '');
      const chunkIndex = Math.floor(i / chunkSize) + 1;
      const isLastChunk = chunkIndex === totalChunks;
      
      const chunkData = JSON.stringify({
        type: 'chunk',
        content: chunk,
        done: isLastChunk, // Mark last chunk with done: true
        sources: undefined // Intent responses have no sources
      });
      res.write(`data: ${chunkData}\n\n`);
      
      // Flush the response to ensure chunks are sent immediately
      if (res.flush) {
        res.flush();
      }
      
      // Delay for smooth streaming effect (30ms for better visibility)
      await new Promise(resolve => setTimeout(resolve, 30));
    }
  }

  /**
   * Stream AI response chunks with source handling
   */
  async streamAIResponse(
    stream: AsyncGenerator<{ chunk: string; done: boolean; fullContent?: string }, void, unknown>,
    res: Response,
    sources?: Array<{
      document_uuid: string;
      document_title: string;
      chunk_indices: number[];
    }>,
    knowledgeResults?: string | null
  ): Promise<string> {
    let accumulatedContent = '';
    let chunkCount = 0;

    logger.info('🔄 Starting OpenAI stream...');

    for await (const { chunk, done, fullContent } of stream) {
      chunkCount++;
      
      // On last chunk, include sources (only if we actually have useful knowledge results)
      // Don't send sources if LLM couldn't answer or apologized
      const shouldIncludeSources = done && sources && sources.length > 0 && knowledgeResults && knowledgeResults.trim().length > 0;
      
      const chunkData = JSON.stringify({
        type: 'chunk',
        content: chunk,
        done: done || false,
        sources: shouldIncludeSources ? sources : undefined
      });
      
      // Log sources on last chunk for debugging
      if (shouldIncludeSources) {
        logger.info(`📚 Sending sources with last chunk: ${JSON.stringify(sources)}`);
      } else if (done && sources && sources.length > 0) {
        logger.info(`⚠️  Sources available but not sent (no knowledge results used)`);
      }
      
      res.write(`data: ${chunkData}\n\n`);
      if (res.flush) res.flush();
      
      // Update accumulated content
      if (chunk) {
        accumulatedContent += chunk;
      }
      
      // Log first and last chunks
      if (chunkCount === 1) {
        logger.info(`📤 First chunk sent: "${chunk.substring(0, 30)}..."`);
      }
      
      if (done && fullContent) {
        accumulatedContent = fullContent;
        logger.info(`🏁 Stream complete: ${chunkCount} chunks sent, ${fullContent.length} total chars`);
      }
    }

    return accumulatedContent;
  }

  /**
   * Send completion event
   */
  sendCompletionEvent(res: Response, messageUuid: string, parentMessageUuid: string | undefined, createdAt: Date): void {
    const completionData = JSON.stringify({
      type: 'completion',
      uuid: messageUuid,
      parent_message_uuid: parentMessageUuid || '',
      status: 'completed',
      created_at: createdAt.toISOString()
    });
    res.write(`data: ${completionData}\n\n`);
  }

  /**
   * Send error event
   */
  sendErrorEvent(res: Response, error: string, message?: string): void {
    const errorData = JSON.stringify({
      type: 'error',
      error,
      message: message || 'Unknown error'
    });
    res.write(`data: ${errorData}\n\n`);
  }

  /**
   * Setup SSE headers
   */
  setupSSEHeaders(res: Response): void {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  }
}

