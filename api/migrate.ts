/**
 * Migration API Endpoint for Vercel
 * 
 * Serverless function that handles database migrations
 * Uses the same MigrationService as the Express server
 */

import { VercelRequest, VercelResponse } from '@vercel/node';
import { MigrationService } from '../dist/src/services/MigrationService';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-migration-key');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Extract API key from query or header
    const apiKey = req.query.key as string || req.headers['x-migration-key'] as string;

  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed',
      error: 'METHOD_NOT_ALLOWED',
      details: {
        allowedMethods: ['GET']
      }
    });
  }

  // Run migrations
  if (!apiKey) {
    return res.status(400).json({
      success: false,
      message: 'Migration API key is required',
      error: 'MISSING_API_KEY',
      details: {
        usage: 'Add ?key=your-secret-key to the URL or x-migration-key header'
      }
    });
  }

  const result = await MigrationService.runMigrations(apiKey);
  
  const statusCode = result.success ? 200 : 
    result.error === 'UNAUTHORIZED' ? 401 :
    result.error === 'MISSING_ENV_VARS' || result.error === 'DATABASE_CONNECTION_FAILED' ? 400 : 500;
  
  return res.status(statusCode).json(result);

  } catch (error: any) {
    console.error('Migration API error:', error);
    
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: 'INTERNAL_SERVER_ERROR',
      details: {
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }
    });
  }
}
