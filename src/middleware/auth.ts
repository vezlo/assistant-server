import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { SupabaseClient } from '@supabase/supabase-js';
import { UnauthorizedError, ForbiddenError } from './errorHandler';

// Extend Request interface to include user information
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    uuid: string;
    email: string;
    name: string;
    tokenUpdatedAt: string;
  };
  profile?: {
    id: string;
    uuid: string;
    companyId: string;
    companyUuid: string;
    companyName: string;
    role: string;
    status: string;
  };
}

// JWT payload interface
interface JWTPayload {
  user_company_profile_id: string;
  user_id: string;
  company_id: string;
  user_token_updated_at: string;
  role: string;
  iat: number;
  exp: number;
}

// Password utilities
export const PasswordUtils = {
  async hash(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  },

  async compare(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
};

// JWT utilities
export const JWTUtils = {
  generateToken(
    profileId: string,
    userId: string,
    companyId: string,
    tokenUpdatedAt: string,
    role: string
  ): string {
    const payload = {
      user_company_profile_id: profileId,
      user_id: userId,
      company_id: companyId,
      user_token_updated_at: tokenUpdatedAt,
      role: role
    };

    return jwt.sign(payload, process.env.JWT_SECRET!, {
      // No expiration - token is invalidated via token_updated_at check
      issuer: 'vezlo-assistant'
    });
  },

  generateRefreshToken(
    profileId: string,
    userId: string,
    companyId: string,
    tokenUpdatedAt: string,
    role: string
  ): string {
    const payload = {
      user_company_profile_id: profileId,
      user_id: userId,
      company_id: companyId,
      user_token_updated_at: tokenUpdatedAt,
      role: role,
      type: 'refresh'
    };

    return jwt.sign(payload, process.env.JWT_SECRET!, {
      expiresIn: '7d',
      issuer: 'vezlo-assistant'
    });
  },

  verifyToken(token: string): JWTPayload {
    try {
      return jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;
    } catch (error) {
      throw new UnauthorizedError('Invalid or expired token');
    }
  }
};

// User authentication middleware
export const authenticateUser = (supabase: SupabaseClient) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new UnauthorizedError('No token provided');
      }

      const token = authHeader.substring(7);
      const decoded = JWTUtils.verifyToken(token);

      // Get user data
      const { data: user, error: userError } = await supabase
        .from('vezlo_users')
        .select('*')
        .eq('id', decoded.user_id)
        .single();

      if (userError || !user) {
        throw new UnauthorizedError('User not found');
      }

      // Check if token is still valid (not logged out)
      if (user.token_updated_at !== decoded.user_token_updated_at) {
        throw new UnauthorizedError('Token has been invalidated');
      }

      // Get profile data
      const { data: profile, error: profileError } = await supabase
        .from('vezlo_user_company_profiles')
        .select(`
          *,
          companies:company_id (
            id,
            uuid,
            name,
            domain
          )
        `)
        .eq('id', decoded.user_company_profile_id)
        .single();

      if (profileError || !profile) {
        throw new UnauthorizedError('Profile not found');
      }

      // Check if profile is active
      if (profile.status !== 'active') {
        throw new UnauthorizedError('Profile is inactive');
      }

      // Attach user and profile data to request
      req.user = {
        id: user.id.toString(),
        uuid: user.uuid,
        email: user.email,
        name: user.name,
        tokenUpdatedAt: user.token_updated_at
      };

      req.profile = {
        id: profile.id.toString(),
        uuid: profile.uuid,
        companyId: profile.company_id.toString(),
        companyUuid: profile.companies.uuid,
        companyName: profile.companies.name,
        role: profile.role,
        status: profile.status
      };

      next();
    } catch (error) {
      next(error);
    }
  };
};

// API Key authentication middleware
export const authenticateApiKey = (supabase: SupabaseClient) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const apiKey = req.headers['x-api-key'] as string;
      if (!apiKey) {
        throw new UnauthorizedError('API key required');
      }

      // Hash the provided API key
      const keyHash = await PasswordUtils.hash(apiKey);

      // Find the API key
      const { data: apiKeyData, error: apiKeyError } = await supabase
        .from('vezlo_api_keys')
        .select(`
          *,
          companies:company_id (
            id,
            uuid,
            name,
            domain
          )
        `)
        .eq('key_hash', keyHash)
        .single();

      if (apiKeyError || !apiKeyData) {
        throw new UnauthorizedError('Invalid API key');
      }

      // Check if API key is expired
      if (apiKeyData.expires_at && new Date(apiKeyData.expires_at) < new Date()) {
        throw new UnauthorizedError('API key has expired');
      }

      // Attach company data to request
      (req as any).company = {
        id: apiKeyData.companies.id.toString(),
        uuid: apiKeyData.companies.uuid,
        name: apiKeyData.companies.name,
        domain: apiKeyData.companies.domain
      };

      next();
    } catch (error) {
      next(error);
    }
  };
};

// Role-based authorization helper
export const requireRole = (allowedRoles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.profile) {
      throw new UnauthorizedError('Authentication required');
    }

    if (!allowedRoles.includes(req.profile.role)) {
      throw new ForbiddenError(`Required role: ${allowedRoles.join(' or ')}`);
    }

    next();
  };
};