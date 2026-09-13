import jwt from 'jsonwebtoken';
import { loadAuthConfig } from '../config/auth.config.js';

export type UserRole = 'INSPECTOR' | 'FORENSIC_OFFICER' | 'AUDITOR' | 'ADMIN';

export interface AuthTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
  name: string;
}

export interface DecodedAuthToken extends AuthTokenPayload {
  iat: number;
  exp: number;
}

/**
 * Service providing JWT generation and verification for stateless authentication.
 *
 * Security:
 * - Minimal claims only: sub, email, role, name.
 * - No cryptographic keys, secrets, passwords, or document data stored in token.
 * - Enforces explicit short expiration.
 */
export class TokenService {
  /**
   * Generates a signed JWT access token for an authenticated user.
   *
   * @param payload - Minimal user claims.
   * @param secretOverride - Optional secret override (for testing).
   * @param expiresInOverride - Optional expiration override (for testing).
   * @returns Signed JWT string.
   */
  public static generateToken(
    payload: AuthTokenPayload,
    secretOverride?: string,
    expiresInOverride?: string
  ): string {
    const config = loadAuthConfig();
    const secret = secretOverride ?? config.jwtSecret;
    const expiresIn = expiresInOverride ?? config.jwtExpiresIn;

    return jwt.sign(
      {
        sub: payload.sub,
        email: payload.email,
        role: payload.role,
        name: payload.name,
      },
      secret,
      {
        algorithm: 'HS256',
        expiresIn: expiresIn as jwt.SignOptions['expiresIn'],
      }
    );
  }

  /**
   * Verifies and decodes a signed JWT access token.
   *
   * @param token - JWT string to verify.
   * @param secretOverride - Optional secret override (for testing).
   * @returns Decoded token payload if valid.
   * @throws Error if token is expired, invalid, or malformed.
   */
  public static verifyToken(token: string, secretOverride?: string): DecodedAuthToken {
    if (typeof token !== 'string' || token.trim().length === 0) {
      throw new Error('Token must be a non-empty string.');
    }

    const config = loadAuthConfig();
    const secret = secretOverride ?? config.jwtSecret;

    const decoded = jwt.verify(token, secret, {
      algorithms: ['HS256'],
    });

    return decoded as DecodedAuthToken;
  }
}
