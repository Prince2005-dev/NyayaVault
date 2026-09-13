import type { Request, Response, NextFunction } from 'express';
import { PrismaUserRepository, type UserRepository } from '../database/prisma-user.repository.js';
import { PasswordService } from '../services/password.service.js';
import { TokenService, type UserRole } from '../services/token.service.js';

export class AuthController {
  constructor(private userRepo: UserRepository = new PrismaUserRepository()) {}

  /**
   * POST /api/auth/login
   *
   * Authenticates user credentials and issues a stateless JWT.
   */
  public login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rawEmail = req.body?.email ?? req.body?.username;
      const rawPassword = req.body?.password;

      if (!rawEmail || typeof rawEmail !== 'string' || !rawPassword || typeof rawPassword !== 'string') {
        res.status(400).json({
          error: {
            code: 'BAD_REQUEST',
            message: 'Email and password are required.',
          },
        });
        return;
      }

      const email = rawEmail.trim().toLowerCase();
      const password = rawPassword;

      const user = await this.userRepo.findByEmail(email);

      // Generic rejection to prevent user enumeration
      if (!user || !user.isActive) {
        res.status(401).json({
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid credentials.',
          },
        });
        return;
      }

      const isValidPassword = await PasswordService.verifyPassword(password, user.passwordHash);
      if (!isValidPassword) {
        res.status(401).json({
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid credentials.',
          },
        });
        return;
      }

      const token = TokenService.generateToken({
        sub: user.id,
        email: user.email,
        role: user.role as UserRole,
        name: user.name,
      });

      res.status(200).json({
        user: PrismaUserRepository.toSafeUser(user),
        token,
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/auth/me
   *
   * Returns current authenticated user's profile.
   */
  public me = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required.',
          },
        });
        return;
      }

      const user = await this.userRepo.findById(req.user.id);
      if (!user || !user.isActive) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'User account is inactive or not found.',
          },
        });
        return;
      }

      res.status(200).json({
        user: PrismaUserRepository.toSafeUser(user),
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/auth/logout
   *
   * Stateless acknowledgment endpoint.
   */
  public logout = async (_req: Request, res: Response): Promise<void> => {
    res.status(200).json({ success: true });
  };
}
