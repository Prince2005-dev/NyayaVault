import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { EncryptedPayload, EncryptionService } from './encryption.types.js';

const GCM_IV_LENGTH_BYTES = 12; // 96-bit IV recommended for AES-GCM
const GCM_TAG_LENGTH_BYTES = 16; // 128-bit authentication tag

export class AesGcmEncryptionService implements EncryptionService {
  private readonly key: Buffer;
  private readonly keyVersion: string;

  /**
   * Initializes the AES-256-GCM encryption service.
   *
   * @param key - Exactly 32 bytes (256 bits) of cryptographic key material.
   * @param keyVersion - Version identifier associated with this key (defaults to 'v1').
   */
  constructor(key: Buffer, keyVersion = 'v1') {
    if (!Buffer.isBuffer(key) || key.length !== 32) {
      throw new Error(
        `AesGcmEncryptionService requires a 32-byte Buffer key. Provided length: ${
          Buffer.isBuffer(key) ? key.length : typeof key
        }`
      );
    }
    this.key = key;
    this.keyVersion = keyVersion;
  }

  /**
   * Encrypts raw document bytes using AES-256-GCM with a fresh random 12-byte IV.
   *
   * Security Rule:
   * Document bytes are processed directly without converting to UTF-8 strings.
   *
   * @param data - The raw document file content as a Buffer.
   * @returns Promise resolving to the EncryptedPayload.
   */
  public async encrypt(data: Buffer): Promise<EncryptedPayload> {
    if (!Buffer.isBuffer(data)) {
      throw new TypeError('AesGcmEncryptionService.encrypt requires a valid Buffer input.');
    }

    // Generate fresh, cryptographically secure 12-byte IV for every encryption call
    const iv = randomBytes(GCM_IV_LENGTH_BYTES);

    const cipher = createCipheriv('aes-256-gcm', this.key, iv);

    const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return {
      ciphertext,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      keyVersion: this.keyVersion,
    };
  }

  /**
   * Decrypts an authenticated EncryptedPayload, verifying ciphertext integrity and authenticity.
   *
   * Security Rule:
   * If any byte of the ciphertext, IV, or authentication tag was modified,
   * or if the decryption key does not match, decryption strictly fails.
   *
   * @param payload - EncryptedPayload containing ciphertext, hex IV, hex authTag, and keyVersion.
   * @returns Promise resolving to the original decrypted Buffer.
   * @throws {Error} If authentication verification fails or payload is malformed.
   */
  public async decrypt(payload: EncryptedPayload): Promise<Buffer> {
    if (!payload || typeof payload !== 'object') {
      throw new TypeError('AesGcmEncryptionService.decrypt requires a valid EncryptedPayload object.');
    }

    if (!Buffer.isBuffer(payload.ciphertext)) {
      throw new TypeError('Invalid payload: ciphertext must be a Buffer.');
    }

    if (typeof payload.iv !== 'string' || !/^[0-9a-f]{24}$/i.test(payload.iv)) {
      throw new Error('Invalid payload: IV must be a 24-character hexadecimal string (12 bytes).');
    }

    if (typeof payload.authTag !== 'string' || !/^[0-9a-f]{32}$/i.test(payload.authTag)) {
      throw new Error('Invalid payload: authTag must be a 32-character hexadecimal string (16 bytes).');
    }

    const ivBuffer = Buffer.from(payload.iv, 'hex');
    const authTagBuffer = Buffer.from(payload.authTag, 'hex');

    if (ivBuffer.length !== GCM_IV_LENGTH_BYTES) {
      throw new Error(`Invalid IV length: expected ${GCM_IV_LENGTH_BYTES} bytes, got ${ivBuffer.length}.`);
    }

    if (authTagBuffer.length !== GCM_TAG_LENGTH_BYTES) {
      throw new Error(`Invalid authTag length: expected ${GCM_TAG_LENGTH_BYTES} bytes, got ${authTagBuffer.length}.`);
    }

    try {
      const decipher = createDecipheriv('aes-256-gcm', this.key, ivBuffer);
      decipher.setAuthTag(authTagBuffer);

      const plaintext = Buffer.concat([
        decipher.update(payload.ciphertext),
        decipher.final(),
      ]);

      return plaintext;
    } catch {
      // Node.js crypto throws when authTag does not match or ciphertext was tampered with
      throw new Error('Decryption failed: Authentication tag verification failed or key mismatch.');
    }
  }
}
