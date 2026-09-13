/**
 * Integrity module type definitions for NyayaVault.
 */

/**
 * 64-character lowercase hexadecimal SHA-256 digest string.
 */
export type Sha256Digest = string;

/**
 * Service contract for cryptographic hash calculation over raw evidence bytes.
 */
export interface IntegrityHashService {
  calculateSha256(data: Buffer): Sha256Digest;
}
