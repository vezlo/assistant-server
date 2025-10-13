/**
 * Migration Status API Endpoint for Vercel
 * 
 * Serverless function that handles migration status checks
 * Uses the same MigrationService as the Express server
 */

import { VercelRequest, VercelResponse } from '@vercel/node';
import { MigrationService } from '../../dist/src/services/MigrationService';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-migration-key');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
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

    // Extract API key from query or header
    const apiKey = req.query.key as string || req.headers['x-migration-key'] as string;

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

    // Get migration status
    const result = await MigrationService.getStatus(apiKey);
    
    const statusCode = result.success ? 200 : 
      result.error === 'UNAUTHORIZED' ? 401 : 500;
    
    return res.status(statusCode).json(result);

  } catch (error: any) {
    console.error('Migration status API error:', error);
    
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
