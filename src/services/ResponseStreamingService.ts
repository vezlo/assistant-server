import { Response } from 'express';
import logger from '../config/logger';

export class ResponseStreamingService {
  /**
   * Detect if AI response is an apology (couldn't find information)
   */
  private isApologyResponse(response: string): boolean {
    const apologyPhrases = [
      "i'm sorry",
      "i am sorry",
      "i couldn't find",
      "i could not find",
      "i don't have",
      "i do not have",
      "no relevant information",
      "couldn't find the requested information",
      "could not find the requested information",
      "contact support",
      "please contact"
    ];
    const lowerResponse = response.toLowerCase();
    return apologyPhrases.some(phrase => lowerResponse.includes(phrase));
  }

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
    knowledgeResults?: string | null,
    validationCallback?: ((response: string, query: string) => Promise<{
      confidence: number;
      valid: boolean;
      status: string;
      accuracy: any;
      context: any;
      hallucination: any;
      warnings: string[];
    } | null>) | null,
    query?: string
  ): Promise<string> {
    let accumulatedContent = '';
    let chunkCount = 0;

    logger.info('🔄 Starting OpenAI stream...');

    for await (const { chunk, done, fullContent } of stream) {
      chunkCount++;
      
      // Update accumulated content first
      if (chunk) {
        accumulatedContent += chunk;
      }
      
      // On last chunk, determine if we should include sources
      let shouldIncludeSources = false;
      let validation = null;
      
      if (done && sources && sources.length > 0 && knowledgeResults && knowledgeResults.trim().length > 0) {
        const finalContent = fullContent || accumulatedContent;
        
        // Check if AI apologized (couldn't find info)
        const isApology = this.isApologyResponse(finalContent);
        
        if (!isApology) {
          // Run validation if callback provided
          if (validationCallback && query) {
            validation = await validationCallback(finalContent, query);
            // Include sources only if validation passed OR validation not enabled
            shouldIncludeSources = !validation || validation.valid !== false;
          } else {
            // No validation enabled, include sources
            shouldIncludeSources = true;
          }
        } else {
          logger.info('⚠️  Apology response detected - sources not sent');
        }
      }
      
      const chunkData = JSON.stringify({
        type: 'chunk',
        content: chunk,
        done: done || false,
        sources: shouldIncludeSources ? sources : undefined,
        validation: shouldIncludeSources && validation ? validation : undefined
      });
      
      // Log sources on last chunk for debugging
      if (shouldIncludeSources) {
        logger.info(`📚 Sending sources with last chunk: ${JSON.stringify(sources)}`);
      } else if (done && sources && sources.length > 0) {
        logger.info(`⚠️  Sources available but not sent (no knowledge results used)`);
      }
      
      res.write(`data: ${chunkData}\n\n`);
      if (res.flush) res.flush();
      
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

