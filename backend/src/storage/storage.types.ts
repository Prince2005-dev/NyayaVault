/**
 * Vendor-neutral storage service interface for encrypted document bytes.
 *
 * Designed to remain uncoupled from underlying storage implementations
 * (local filesystem, S3, MinIO, IPFS, etc.).
 */
export interface StorageService {
  /**
   * Persists binary data atomically under the given logical storage key.
   *
   * @param key - Logical storage key (e.g. "documents/doc_001/ver_001/random-id.bin").
   * @param data - The encrypted binary Buffer to persist.
   */
  put(key: string, data: Buffer): Promise<void>;

  /**
   * Retrieves stored binary data for the given logical storage key.
   *
   * @param key - Logical storage key.
   * @returns The exact stored Buffer.
   * @throws {Error} If the object does not exist or cannot be read.
   */
  get(key: string): Promise<Buffer>;

  /**
   * Removes stored binary data for the given logical storage key.
   *
   * Idempotent: Completes successfully if the key is already absent.
   *
   * @param key - Logical storage key.
   */
  delete(key: string): Promise<void>;
}
