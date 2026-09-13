import type { Request, Response, NextFunction } from 'express';
import { TokenService, type UserRole } from '../services/token.service.js';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: UserRole | string;
        name: string;
      };
    }
  }
}

/**
 * Express middleware to verify JWT bearer tokens and attach user identity to request.
 *
 * Security:
 * - Rejects missing, expired, malformed, or tampered tokens with 401 Unauthorized.
 * - Does not log Authorization headers or sensitive tokens.
 * - Extracts only safe public claims: sub, email, role, name.
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];

  if (!authHeader || typeof authHeader !== 'string') {
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication token is required.',
      },
    });
    return;
  }

  const parts = authHeader.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Malformed authorization header. Expected "Bearer <token>".',
      },
    });
    return;
  }

  const token = parts[1];

  try {
    const decoded = TokenService.verifyToken(token);
    req.user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role,
      name: decoded.name,
    };
    next();
  } catch (err: unknown) {
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid or expired authentication token.',
      },
    });
  }
}

/**
 * Express middleware to enforce role-based access control (RBAC).
 * Must be mounted after `authenticate`.
 *
 * @param allowedRoles - One or more roles allowed to access the route.
 */
export function requireRole(...allowedRoles: (UserRole | string)[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required.',
        },
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied: insufficient permissions.',
        },
      });
      return;
    }

    next();
  };
}
