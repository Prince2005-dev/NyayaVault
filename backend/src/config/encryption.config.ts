import path from 'node:path';

/**
 * Attempts to load environment variables from .env file using native Node.js support.
 * Does not throw if .env is missing (e.g. in containerized or CI/CD test environments).
 */
export function initializeEnvironment(): void {
  try {
    if (typeof process.loadEnvFile === 'function') {
      process.loadEnvFile();
    }
  } catch {
    // Non-fatal: environment variables may already be set in process.env
  }
}

/**
 * Validates and decodes the 256-bit AES encryption key from an environment variable.
 *
 * Requirements:
 * - Must be provided and non-empty.
 * - Must be a valid Base64 string.
 * - Decoded binary length must be exactly 32 bytes (256 bits).
 *
 * Security Note:
 * This function NEVER logs, prints, or exposes the key value.
 *
 * @param rawKey - Raw Base64 string from environment configuration.
 * @returns 32-byte Buffer containing cryptographic key material.
 * @throws {Error} If key is missing, malformed, or invalid length.
 */
export function parseAndValidateEncryptionKey(rawKey?: string): Buffer {
  if (!rawKey || typeof rawKey !== 'string' || rawKey.trim() === '') {
    throw new Error(
      'Missing required encryption key: DOCUMENT_ENCRYPTION_KEY environment variable is not defined.'
    );
  }

  const trimmed = rawKey.trim();

  // Validate Base64 formatting: 32 bytes in Base64 is always 44 chars ending in '='
  const base64Pattern = /^[A-Za-z0-9+/]{43}=$/;
  if (!base64Pattern.test(trimmed)) {
    throw new Error(
      'Malformed encryption key: DOCUMENT_ENCRYPTION_KEY must be a valid 44-character Base64 string.'
    );
  }

  const keyBuffer = Buffer.from(trimmed, 'base64');

  if (keyBuffer.length !== 32) {
    throw new Error(
      `Invalid encryption key length: Expected exactly 32 bytes (256 bits), but got ${keyBuffer.length} bytes.`
    );
  }

  return keyBuffer;
}

export interface EncryptionConfig {
  key: Buffer;
  keyVersion: string;
}

export type StorageProvider = 'local' | 's3';

export interface StorageConfig {
  provider: StorageProvider;
  storageRootDir: string;
  bucketName?: string;
  region?: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

/**
 * Loads and validates active encryption configuration from process environment.
 */
export function loadEncryptionConfig(): EncryptionConfig {
  initializeEnvironment();
  const rawKey = process.env.DOCUMENT_ENCRYPTION_KEY;
  const key = parseAndValidateEncryptionKey(rawKey);
  const keyVersion = process.env.DOCUMENT_ENCRYPTION_KEY_VERSION || 'v1';

  return { key, keyVersion };
}

/**
 * Loads active secure storage configuration from process environment.
 */
export function loadStorageConfig(): StorageConfig {
  initializeEnvironment();

  const provider = process.env.STORAGE_PROVIDER === 's3' ? 's3' : 'local';
  const rawDir = process.env.STORAGE_ROOT_DIR || './storage';
  const storageRootDir = path.resolve(rawDir);

  return {
    provider,
    storageRootDir,
    bucketName: process.env.AWS_S3_BUCKET_NAME,
    region: process.env.AWS_REGION,
    endpoint: process.env.AWS_S3_ENDPOINT,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  };
}
