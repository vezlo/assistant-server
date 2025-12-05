/**
 * Global Configuration File
 * Centralized configuration for the AI Assistant API
 */

import { config as dotenvConfig } from 'dotenv';

// Load environment variables first
dotenvConfig();

export interface GlobalConfig {
  app: {
    name: string;
    version: string;
    description: string;
    port: number;
    environment: string;
  };
  api: {
    prefix: string;
    version: string;
    timeout: number;
    rateLimiting: {
      windowMs: number;
      maxRequests: number;
    };
  };
  ai: {
    provider: string;
    model: string;
    embeddingModel: string;
    maxTokens: number;
    temperature: number;
    timeout: number;
  };
  knowledge: {
    chunkSize: number;
    chunkOverlap: number;
    similarityThreshold: number;
    maxSearchResults: number;
    embeddingDimensions: number;
  };
  validation: {
    enableRequestValidation: boolean;
    enableResponseValidation: boolean;
    returnDetailedErrors: boolean;
  };
  swagger: {
    enabled: boolean;
    title: string;
    description: string;
    version: string;
    path: string;
  };
  cors: {
    enabled: boolean;
    origins: string[];
    methods: string[];
    credentials: boolean;
  };
  logging: {
    level: string;
    enableRequestLogging: boolean;
    enableErrorLogging: boolean;
  };
}

const getDefaultCorsOrigins = () => {
  if (!process.env.CORS_ORIGINS) {
    return [];
  }

  const parsedOrigins = process.env.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return parsedOrigins;
};

// Default configuration
export const defaultConfig: GlobalConfig = {
  app: {
    name: 'AI Assistant API',
    version: '1.0.0',
    description: 'Intelligent AI Assistant API with conversation management, knowledge base integration, and advanced feedback system',
    port: parseInt(process.env.PORT || '3000'),
    environment: process.env.NODE_ENV || 'development'
  },
  api: {
    prefix: '/api',
    version: 'v1',
    timeout: 60000, // 60 seconds (matches Vercel Pro plan limit)
    rateLimiting: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '900000'), // Default 15 minutes
      maxRequests: parseInt(process.env.RATE_LIMIT_MAX || '100') // per window
    }
  },
  ai: {
    provider: 'openai',
    model: process.env.AI_MODEL || 'gpt-4o-mini',
    embeddingModel: 'text-embedding-ada-002',
    maxTokens: 4096,
    temperature: 0.7,
    timeout: 60000 // 60 seconds
  },
  knowledge: {
    chunkSize: parseInt(process.env.CHUNK_SIZE || '1000'),
    chunkOverlap: parseInt(process.env.CHUNK_OVERLAP || '200'),
    similarityThreshold: 0.7,
    maxSearchResults: 10,
    embeddingDimensions: 1536 // OpenAI ada-002 dimensions
  },
  validation: {
    enableRequestValidation: true,
    enableResponseValidation: process.env.NODE_ENV === 'development',
    returnDetailedErrors: process.env.NODE_ENV !== 'production'
  },
  swagger: {
    enabled: process.env.NODE_ENV !== 'production',
    title: 'AI Assistant API',
    description: 'Intelligent AI Assistant API with conversation management, knowledge base integration, and advanced feedback system',
    version: '1.0.0',
    path: '/docs'
  },
  cors: {
    enabled: true,
    origins: getDefaultCorsOrigins(),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    credentials: true
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    enableRequestLogging: true,
    enableErrorLogging: true
  }
};

// Environment-specific overrides
const envConfig: Partial<GlobalConfig> = {};

if (process.env.NODE_ENV === 'production') {
  envConfig.swagger = { ...defaultConfig.swagger, enabled: false };
  envConfig.validation = { 
    ...defaultConfig.validation, 
    returnDetailedErrors: false,
    enableResponseValidation: false 
  };
  envConfig.logging = { ...defaultConfig.logging, level: 'warn' };
}

if (process.env.NODE_ENV === 'test') {
  envConfig.logging = { ...defaultConfig.logging, level: 'error' };
  envConfig.api = { 
    ...defaultConfig.api, 
    rateLimiting: { windowMs: 1000, maxRequests: 1000 } 
  };
}

// Merge configurations
export const config: GlobalConfig = {
  ...defaultConfig,
  ...envConfig,
  // Deep merge nested objects
  app: { ...defaultConfig.app, ...envConfig.app },
  api: { ...defaultConfig.api, ...envConfig.api },
  ai: { ...defaultConfig.ai, ...envConfig.ai },
  knowledge: { ...defaultConfig.knowledge, ...envConfig.knowledge },
  validation: { ...defaultConfig.validation, ...envConfig.validation },
  swagger: { ...defaultConfig.swagger, ...envConfig.swagger },
  cors: { ...defaultConfig.cors, ...envConfig.cors },
  logging: { ...defaultConfig.logging, ...envConfig.logging }
};

// Validation helper
export function validateConfig(): void {
  const required = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_KEY', 
    'OPENAI_API_KEY'
  ];
  
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  
  console.log('✅ Configuration validated successfully');
  console.log(`🚀 Starting ${config.app.name} v${config.app.version} in ${config.app.environment} mode`);
}

export default config;
