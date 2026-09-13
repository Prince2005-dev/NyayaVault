import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { StorageService } from './storage.types.js';

export class LocalEncryptedStorage implements StorageService {
  private readonly rootDir: string;

  /**
   * Initializes the local secure encrypted storage adapter.
   *
   * @param rootDir - Root directory under which all encrypted artifacts reside.
   */
  constructor(rootDir: string) {
    if (!rootDir || typeof rootDir !== 'string' || rootDir.trim() === '') {
      throw new Error('LocalEncryptedStorage requires a non-empty rootDir path.');
    }
    this.rootDir = path.resolve(rootDir);
  }

  /**
   * Returns the configured absolute root directory.
   */
  public getRootDir(): string {
    return this.rootDir;
  }

  /**
   * Resolves a logical storage key to an absolute filesystem path,
   * enforcing strict path traversal boundaries.
   *
   * Security Rules:
   * - Rejects null bytes, empty keys, and whitespace.
   * - Rejects relative parent directory sequences ('..').
   * - Rejects absolute filesystem paths.
   * - Ensures the resolved path is strictly contained within the configured root.
   *
   * @param key - Logical storage key.
   * @returns Safe absolute path on the local filesystem.
   * @throws {Error} If key contains path traversal patterns or falls outside root.
   */
  private resolveSafePath(key: string): string {
    if (!key || typeof key !== 'string' || key.trim() === '') {
      throw new Error('Storage key must be a non-empty string.');
    }

    // Reject null byte injection
    if (key.includes('\0')) {
      throw new Error('Invalid storage key: Null byte sequence detected.');
    }

    // Normalize slashes for platform independence
    const normalizedKey = key.replace(/\\/g, '/');

    // Reject parent traversal and absolute path indicators in key
    const segments = normalizedKey.split('/');
    if (segments.includes('..') || segments.includes('.') || path.isAbsolute(key) || /^[a-zA-Z]:/.test(key)) {
      throw new Error(`Path traversal violation: Key "${key}" attempts to navigate outside storage root.`);
    }

    const resolved = path.resolve(this.rootDir, normalizedKey);
    const expectedPrefix = this.rootDir.endsWith(path.sep) ? this.rootDir : this.rootDir + path.sep;

    if (!resolved.startsWith(expectedPrefix)) {
      throw new Error(`Path traversal violation: Resolved target "${resolved}" escapes root directory.`);
    }

    return resolved;
  }

  /**
   * Atomically writes encrypted data bytes to local disk.
   *
   * Reliability Rule:
   * Data is written to a temporary sibling file and then renamed into place.
   * This guarantees that readers never observe partial or corrupted writes.
   *
   * @param key - Logical storage key.
   * @param data - Encrypted payload Buffer to store.
   */
  public async put(key: string, data: Buffer): Promise<void> {
    if (!Buffer.isBuffer(data)) {
      throw new TypeError('LocalEncryptedStorage.put requires a valid Buffer input.');
    }

    const targetPath = this.resolveSafePath(key);
    const parentDir = path.dirname(targetPath);

    // Ensure target directory exists
    await fs.promises.mkdir(parentDir, { recursive: true });

    // Generate unique temporary sibling file in the same directory for atomic rename
    const tempPath = `${targetPath}.tmp_${randomBytes(8).toString('hex')}`;

    try {
      await fs.promises.writeFile(tempPath, data);
      await fs.promises.rename(tempPath, targetPath);
    } catch (err) {
      // Clean up orphaned temp file if write or rename failed
      try {
        await fs.promises.unlink(tempPath);
      } catch {
        // Ignore cleanup error
      }
      throw err;
    }
  }

  /**
   * Reads stored encrypted bytes for the given key.
   *
   * @param key - Logical storage key.
   * @returns Exact stored Buffer.
   * @throws {Error} If key is missing or file does not exist.
   */
  public async get(key: string): Promise<Buffer> {
    const targetPath = this.resolveSafePath(key);

    try {
      return await fs.promises.readFile(targetPath);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'ENOENT') {
        throw new Error(`Storage object not found for key: "${key}"`);
      }
      throw err;
    }
  }

  /**
   * Removes stored encrypted data for the given key.
   *
   * Idempotency Rule:
   * If the file does not exist, the operation completes without error.
   *
   * @param key - Logical storage key.
   */
  public async delete(key: string): Promise<void> {
    const targetPath = this.resolveSafePath(key);

    try {
      await fs.promises.unlink(targetPath);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'ENOENT') {
        // Idempotent: already deleted or never existed
        return;
      }
      throw err;
    }
  }
}
