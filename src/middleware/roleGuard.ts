import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth';
import { ForbiddenError } from './errorHandler';

/**
 * Middleware to require admin role
 * Must be used after authenticateUser middleware
 */
export const requireAdmin = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.profile) {
    res.status(401).json({
      success: false,
      error: 'Not authenticated'
    });
    return;
  }

  if (req.profile.role !== 'admin') {
    res.status(403).json({
      success: false,
      error: 'Admin access required'
    });
    return;
  }

  next();
};
