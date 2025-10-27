import { Request, Response, NextFunction } from 'express';
import { config } from '../config/global';

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
  details?: any;
}

export class ValidationError extends Error {
  public statusCode = 400;
  public code = 'VALIDATION_ERROR';
  public details: any;

  constructor(message: string, details?: any) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
  }
}

export class NotFoundError extends Error {
  public statusCode = 404;
  public code = 'NOT_FOUND';

  constructor(resource: string = 'Resource') {
    super(`${resource} not found`);
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends Error {
  public statusCode = 401;
  public code = 'UNAUTHORIZED';

  constructor(message: string = 'Unauthorized access') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends Error {
  public statusCode = 403;
  public code = 'FORBIDDEN';

  constructor(message: string = 'Access forbidden') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class ConflictError extends Error {
  public statusCode = 409;
  public code = 'CONFLICT';

  constructor(message: string = 'Resource conflict') {
    super(message);
    this.name = 'ConflictError';
  }
}

export class RateLimitError extends Error {
  public statusCode = 429;
  public code = 'RATE_LIMIT_EXCEEDED';

  constructor(message: string = 'Rate limit exceeded') {
    super(message);
    this.name = 'RateLimitError';
  }
}

export class InternalServerError extends Error {
  public statusCode = 500;
  public code = 'INTERNAL_SERVER_ERROR';

  constructor(message: string = 'Internal server error') {
    super(message);
    this.name = 'InternalServerError';
  }
}

// Main error handler middleware
export const errorHandler = (
  err: ApiError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Default values
  let statusCode = err.statusCode || 500;
  let code = err.code || 'INTERNAL_SERVER_ERROR';
  let message = err.message || 'An unexpected error occurred';
  let details = err.details;

  // Handle specific error types
  if (err.name === 'ValidationError' || err.message.includes('validation')) {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
  } else if (err.message.includes('not found') || err.message.includes('does not exist')) {
    statusCode = 404;
    code = 'NOT_FOUND';
  } else if (err.message.includes('unauthorized') || err.message.includes('authentication')) {
    statusCode = 401;
    code = 'UNAUTHORIZED';
  } else if (err.message.includes('forbidden') || err.message.includes('permission')) {
    statusCode = 403;
    code = 'FORBIDDEN';
  } else if (err.message.includes('conflict') || err.message.includes('already exists')) {
    statusCode = 409;
    code = 'CONFLICT';
  } else if (err.message.includes('rate limit')) {
    statusCode = 429;
    code = 'RATE_LIMIT_EXCEEDED';
  }

  // Handle JSON parsing errors
  if (err instanceof SyntaxError && 'body' in err) {
    statusCode = 400;
    code = 'INVALID_JSON';
    message = 'Invalid JSON in request body';
  }

  // Handle database constraint errors
  if (err.message.includes('duplicate key') || err.message.includes('unique constraint')) {
    statusCode = 409;
    code = 'DUPLICATE_RESOURCE';
    message = 'Resource already exists';
  }

  // Handle foreign key constraint errors
  if (err.message.includes('foreign key constraint') || err.message.includes('violates foreign key')) {
    statusCode = 400;
    code = 'INVALID_REFERENCE';
    message = 'Referenced resource does not exist';
  }

  // Prepare error response - simplified to just the message
  const errorResponse = {
    error: message
  };

  // Log details in development/detailed error mode (but don't send to client)
  if (config.validation.returnDetailedErrors) {
    const errorDetails = details || {
      stack: err.stack,
      originalError: err.message
    };
    console.error('Error details:', {
      code,
      message,
      timestamp: new Date().toISOString(),
      path: req.path,
      method: req.method,
      details: errorDetails
    });
  }

  // Log error (but not for client errors like 400, 401, 403, 404)
  if (statusCode >= 500 && config.logging.enableErrorLogging) {
    console.error(`🚨 Error ${statusCode} - ${code}:`, {
      message: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
      body: req.body,
      query: req.query,
      params: req.params,
      headers: req.headers,
      timestamp: new Date().toISOString()
    });
  } else if (config.logging.level === 'debug') {
    console.log(`⚠️  Client Error ${statusCode} - ${code}: ${message}`);
  }

  // Send error response
  res.status(statusCode).json(errorResponse);
};

// 404 handler for undefined routes
export const notFoundHandler = (req: Request, res: Response): void => {
  const errorResponse = {
    error: `Endpoint ${req.method} ${req.path} not found`
  };

  res.status(404).json(errorResponse);
};

// Async error wrapper
export const asyncHandler = (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Request validation helper
export const validateRequired = (body: any, requiredFields: string[]): void => {
  const missing = requiredFields.filter(field => {
    const value = body[field];
    return value === undefined || value === null || value === '';
  });

  if (missing.length > 0) {
    throw new ValidationError(`Missing required fields: ${missing.join(', ')}`, {
      missingFields: missing,
      providedFields: Object.keys(body)
    });
  }
};

// Type validation helper
export const validateTypes = (body: any, fieldTypes: Record<string, string>): void => {
  const errors: string[] = [];

  Object.entries(fieldTypes).forEach(([field, expectedType]) => {
    const value = body[field];
    if (value !== undefined && value !== null) {
      const actualType = Array.isArray(value) ? 'array' : typeof value;
      if (actualType !== expectedType) {
        errors.push(`Field '${field}' must be of type ${expectedType}, got ${actualType}`);
      }
    }
  });

  if (errors.length > 0) {
    throw new ValidationError('Type validation failed', {
      errors,
      received: body
    });
  }
};

export default {
  errorHandler,
  notFoundHandler,
  asyncHandler,
  validateRequired,
  validateTypes,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  RateLimitError,
  InternalServerError
};
