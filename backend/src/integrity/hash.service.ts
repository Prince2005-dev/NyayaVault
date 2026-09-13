import { createHash } from 'node:crypto';
import type { Sha256Digest } from './integrity.types.js';

/**
 * Calculates a deterministic SHA-256 cryptographic digest directly from raw document bytes.
 *
 * Evidentiary Security Rule:
 * The hash MUST be computed strictly from the raw payload bytes of the document.
 * Metadata (filename, MIME type, database IDs, timestamp) MUST NOT be mixed into this digest.
 *
 * @param data - The raw document file content as a Node.js Buffer.
 * @returns Lowercase 64-character hexadecimal SHA-256 digest string.
 * @throws {TypeError} If the input is not an instance of Buffer.
 */
export function calculateSha256(data: Buffer): Sha256Digest {
  if (!Buffer.isBuffer(data)) {
    throw new TypeError('calculateSha256 requires a valid Node.js Buffer input containing raw document bytes.');
  }

  return createHash('sha256')
    .update(data)
    .digest('hex')
    .toLowerCase();
}
