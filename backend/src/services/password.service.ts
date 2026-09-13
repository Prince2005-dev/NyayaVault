import { hash, verify, Algorithm } from '@node-rs/argon2';

/**
 * Service providing password hashing and verification using Argon2id.
 *
 * Security:
 * - Implements Argon2id (memory-hard, resistant to GPU/ASIC attacks).
 * - Never prints or logs plain passwords or password hashes.
 * - Enforces minimum salt generation and standard OWASP baseline parameters.
 */
export class PasswordService {
  /**
   * Hashes a plaintext password using Argon2id.
   *
   * @param password - Plaintext password string to hash.
   * @returns Formatted Argon2id hash string ($argon2id$...).
   */
  public static async hashPassword(password: string): Promise<string> {
    if (typeof password !== 'string' || password.length === 0) {
      throw new TypeError('Password must be a non-empty string.');
    }

    return hash(password, {
      algorithm: Algorithm.Argon2id,
      memoryCost: 19456, // 19 MiB
      timeCost: 2,       // 2 iterations
      parallelism: 1,
    });
  }

  /**
   * Verifies a plaintext password against an Argon2id hash.
   *
   * @param password - Plaintext password to verify.
   * @param passwordHash - Stored Argon2id hash.
   * @returns True if password matches hash, false otherwise.
   */
  public static async verifyPassword(password: string, passwordHash: string): Promise<boolean> {
    if (typeof password !== 'string' || typeof passwordHash !== 'string') {
      return false;
    }

    try {
      return await verify(passwordHash, password);
    } catch {
      return false;
    }
  }
}
