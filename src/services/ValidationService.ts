import { AIValidator, ValidationResult } from '@vezlo/ai-validator';
import logger from '../config/logger';

export interface ValidationMetadata extends ValidationResult {
  status: 'validated' | 'warning' | 'failed';
}

export class ValidationService {
  private validator: AIValidator | null = null;
  private enabled: boolean;

  constructor(enabled: boolean) {
    this.enabled = enabled;

    if (enabled) {
      const openaiApiKey = process.env.OPENAI_API_KEY;
      const developerMode = process.env.DEVELOPER_MODE === 'true';
      
      if (!openaiApiKey) {
        logger.warn('⚠️ AI Validation enabled but OPENAI_API_KEY not set - validation disabled');
        this.enabled = false;
        return;
      }

      try {
        this.validator = new AIValidator({
          openaiApiKey,
          llmProvider: 'openai',
          confidenceThreshold: 0.7,
          enableQueryClassification: true,
          enableContextValidation: true,
          useLLMJudge: true,
          developerMode: developerMode,
          enableAccuracyCheck: true,
          enableHallucinationDetection: true
        });
        logger.info(`✅ AI Validation service initialized (LLM Judge, ${developerMode ? 'Developer' : 'User'} Mode)`);
      } catch (error) {
        logger.error('Failed to initialize AI Validation:', error);
        this.enabled = false;
      }
    }
  }

  async validateResponse(
    query: string,
    response: string,
    chunks: Array<{ chunk_text: string; document_title: string; document_uuid: string; embedding?: number[] }>
  ): Promise<ValidationMetadata | null> {
    if (!this.validator) {
      return null;
    }

    try {
      // Map chunks to validator format
      const sources = chunks.map(chunk => ({
        content: chunk.chunk_text,
        title: chunk.document_title,
        id: chunk.document_uuid,
        embedding: chunk.embedding
      }));

      // Run validation
      const result: ValidationResult = await this.validator.validate({
        query,
        response,
        sources
      });

      // Determine status
      let status: 'validated' | 'warning' | 'failed';
      if (result.confidence >= 0.8) {
        status = 'validated';
      } else if (result.confidence >= 0.5) {
        status = 'warning';
      } else {
        status = 'failed';
      }

      logger.info(`🔍 Validation: ${status} (confidence: ${(result.confidence * 100).toFixed(1)}%)`);

      return {
        ...result,
        status
      };
    } catch (error) {
      logger.error('Validation error:', error);
      return null;
    }
  }
}



