/**
 * Migration Service
 * 
 * Handles database migrations with comprehensive validation and error handling
 * Used by both Docker (Express server) and Vercel (serverless functions)
 */

import { runMigrations, getMigrationStatus } from '../config/knex';
import logger from '../config/logger';

export interface MigrationResult {
  success: boolean;
  message: string;
  migrations?: string[];
  currentVersion?: string;
  error?: string;
  details?: any;
}

export class MigrationService {
  private static readonly REQUIRED_ENV_VARS = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_KEY',
    'SUPABASE_DB_HOST',
    'SUPABASE_DB_PASSWORD'
  ];

  /**
   * Validates API key against environment variable
   */
  private static validateApiKey(apiKey: string): boolean {
    try {
      const expectedKey = process.env.MIGRATION_SECRET_KEY;
      
      if (!expectedKey) {
        logger.warn('MIGRATION_SECRET_KEY not configured in environment');
        return false;
      }

      return apiKey === expectedKey;
    } catch (error) {
      logger.error('Error validating API key:', error);
      return false;
    }
  }

  /**
   * Validates required environment variables
   */
  private static validateEnvironment(): { valid: boolean; missing: string[] } {
    const missing = this.REQUIRED_ENV_VARS.filter(key => !process.env[key]);
    
    return {
      valid: missing.length === 0,
      missing
    };
  }

  /**
   * Tests database connection
   */
  private static async testDatabaseConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const { Client } = require('pg');
      
      const client = new Client({
        host: process.env.SUPABASE_DB_HOST,
        port: parseInt(process.env.SUPABASE_DB_PORT || '5432'),
        database: process.env.SUPABASE_DB_NAME || 'postgres',
        user: process.env.SUPABASE_DB_USER || 'postgres',
        password: process.env.SUPABASE_DB_PASSWORD,
        ssl: { rejectUnauthorized: false }
      });

      await client.connect();
      
      // Test with a simple query
      await client.query('SELECT 1');
      
      await client.end();
      
      return { success: true };
    } catch (error: any) {
      logger.error('Database connection test failed:', error);
      return { 
        success: false, 
        error: error.message || 'Database connection failed' 
      };
    }
  }

  /**
   * Gets current migration status
   */
  private static async getCurrentMigrationStatus(): Promise<string> {
    try {
      const status = await getMigrationStatus();
      
      // status = 0 means all migrations are applied (up to date)
      if (status === 0) {
        return 'up-to-date';
      }
      
      // status > 0 means there are pending migrations
      return `pending: ${status}`;
    } catch (error) {
      logger.warn('Could not get migration status:', error);
      return 'unknown';
    }
  }

  /**
   * Main migration execution method
   */
  static async runMigrations(apiKey: string): Promise<MigrationResult> {
    logger.info('Migration request received');

    try {
      // 1. Validate API key
      if (!this.validateApiKey(apiKey)) {
        return {
          success: false,
          message: 'Invalid or missing migration API key',
          error: 'UNAUTHORIZED'
        };
      }

      logger.info('✅ API key validated');

      // 2. Validate environment variables
      const envValidation = this.validateEnvironment();
      if (!envValidation.valid) {
        return {
          success: false,
          message: 'Missing required environment variables',
          error: 'MISSING_ENV_VARS',
          details: {
            missing: envValidation.missing,
            required: this.REQUIRED_ENV_VARS
          }
        };
      }

      logger.info('✅ Environment variables validated');

      // 3. Test database connection
      const dbTest = await this.testDatabaseConnection();
      if (!dbTest.success) {
        return {
          success: false,
          message: 'Database connection failed',
          error: 'DATABASE_CONNECTION_FAILED',
          details: {
            error: dbTest.error
          }
        };
      }

      logger.info('✅ Database connection verified');

      // 4. Get current migration status
      const currentVersion = await this.getCurrentMigrationStatus();
      logger.info(`Current migration version: ${currentVersion}`);

      // 5. Run migrations
      logger.info('🚀 Running database migrations...');
      await runMigrations();

      // 6. Get final status
      const finalVersion = await this.getCurrentMigrationStatus();
      
      logger.info(`✅ Migrations completed successfully`);
      logger.info(`Version: ${currentVersion} → ${finalVersion}`);

      return {
        success: true,
        message: 'Migrations completed successfully',
        currentVersion: finalVersion,
        details: {
          previousVersion: currentVersion,
          timestamp: new Date().toISOString()
        }
      };

    } catch (error: any) {
      logger.error('❌ Migration failed:', error);
      
      return {
        success: false,
        message: 'Migration execution failed',
        error: 'MIGRATION_EXECUTION_FAILED',
        details: {
          error: error.message,
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        }
      };
    }
  }

  /**
   * Get migration status without running migrations
   */
  static async getStatus(apiKey: string): Promise<MigrationResult> {
    try {
      // Validate API key
      if (!this.validateApiKey(apiKey)) {
        return {
          success: false,
          message: 'Invalid or missing migration API key',
          error: 'UNAUTHORIZED'
        };
      }

      // Validate environment
      const envValidation = this.validateEnvironment();
      if (!envValidation.valid) {
        return {
          success: false,
          message: 'Missing required environment variables',
          error: 'MISSING_ENV_VARS',
          details: { missing: envValidation.missing }
        };
      }

      // Test database connection
      const dbTest = await this.testDatabaseConnection();
      if (!dbTest.success) {
        return {
          success: false,
          message: 'Database connection failed',
          error: 'DATABASE_CONNECTION_FAILED'
        };
      }

      // Get migration status
      const currentVersion = await this.getCurrentMigrationStatus();

      return {
        success: true,
        message: 'Migration status retrieved',
        currentVersion,
        details: {
          timestamp: new Date().toISOString()
        }
      };

    } catch (error: any) {
      logger.error('❌ Status check failed:', error);
      
      return {
        success: false,
        message: 'Status check failed',
        error: 'STATUS_CHECK_FAILED',
        details: {
          error: error.message
        }
      };
    }
  }
}
