import { initializeEnvironment } from './encryption.config.js';

export interface AuthConfig {
  jwtSecret: string;
  jwtExpiresIn: string;
}

const DEFAULT_TEST_JWT_SECRET = 'nyayavault-development-test-jwt-secret-at-least-32-chars-long';
const DEFAULT_EXPIRES_IN = '15m';

/**
 * Loads authentication and JWT configuration from environment variables.
 *
 * Security:
 * - Does not print, log, or expose the JWT secret.
 * - Reuses existing environment loading pattern (dotenv via initializeEnvironment).
 * - Requires at least 32 characters for JWT secret in production.
 */
export function loadAuthConfig(): AuthConfig {
  initializeEnvironment();

  let secret = process.env.JWT_SECRET?.trim();
  const expiresIn = process.env.JWT_EXPIRES_IN?.trim() || DEFAULT_EXPIRES_IN;

  if (!secret) {
    if (process.env.NODE_ENV === 'test') {
      secret = DEFAULT_TEST_JWT_SECRET;
    } else {
      throw new Error(
        'Authentication configuration error: JWT_SECRET environment variable is missing or empty.'
      );
    }
  }

  if (secret.length < 32) {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error(
        'Authentication configuration error: JWT_SECRET must be at least 32 characters long.'
      );
    }
  }

  return {
    jwtSecret: secret,
    jwtExpiresIn: expiresIn,
  };
}
