import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { LocalEncryptedStorage } from './local-encrypted-storage.js';

describe('Storage Adapter: LocalEncryptedStorage', () => {
  // Use isolated temporary directory outside public path
  const testStorageDir = path.join(os.tmpdir(), `nyayavault_test_storage_${Date.now()}`);
  let storage: LocalEncryptedStorage;

  before(async () => {
    await fs.promises.mkdir(testStorageDir, { recursive: true });
    storage = new LocalEncryptedStorage(testStorageDir);
  });

  after(async () => {
    // Clean up temporary test directory
    try {
      await fs.promises.rm(testStorageDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  // Test 1: put -> get returns identical encrypted bytes
  it('should put and get returning identical binary bytes', async () => {
    const key = 'documents/doc_001/payload.enc';
    const originalBytes = Buffer.from('AES-GCM-Encrypted-Binary-Bytes-\x00\x01\x02\xff', 'binary');

    await storage.put(key, originalBytes);
    const retrieved = await storage.get(key);

    assert.deepEqual(retrieved, originalBytes);
  });

  // Test 2: file actually exists under storage root
  it('should physically create the file on disk under the configured root directory', async () => {
    const key = 'cases/case_001/evidence.bin';
    const data = Buffer.from('Stored on filesystem', 'utf-8');

    await storage.put(key, data);

    const expectedDiskPath = path.join(testStorageDir, 'cases', 'case_001', 'evidence.bin');
    assert.ok(fs.existsSync(expectedDiskPath), `File must exist at ${expectedDiskPath}`);

    const directFileContent = await fs.promises.readFile(expectedDiskPath);
    assert.deepEqual(directFileContent, data);
  });

  // Test 3: missing key produces expected failure
  it('should fail clearly when getting a non-existent key', async () => {
    await assert.rejects(
      async () => {
        await storage.get('non_existent/file.bin');
      },
      /Storage object not found for key/
    );
  });

  // Test 4: delete removes stored object
  it('should delete a stored object so subsequent get fails', async () => {
    const key = 'temporary/to_delete.bin';
    await storage.put(key, Buffer.from('Delete Me', 'utf-8'));

    // Confirm it exists
    const beforeDelete = await storage.get(key);
    assert.ok(beforeDelete);

    // Delete
    await storage.delete(key);

    // Verify it is gone
    await assert.rejects(
      async () => {
        await storage.get(key);
      },
      /Storage object not found/
    );

    // Deleting an already-deleted object should succeed idempotently
    await storage.delete(key);
  });

  // Test 5: duplicate overwrite behavior is explicit
  it('should safely overwrite an existing file when put is called with the same key', async () => {
    const key = 'versioned/document.bin';
    const version1 = Buffer.from('Version 1 encrypted content', 'utf-8');
    const version2 = Buffer.from('Version 2 encrypted content updated', 'utf-8');

    await storage.put(key, version1);
    assert.deepEqual(await storage.get(key), version1);

    await storage.put(key, version2);
    assert.deepEqual(await storage.get(key), version2);
  });

  // Test 6: path traversal attempts are rejected
  it('should strictly reject path traversal attacks', async () => {
    const maliciousKeys = [
      '../../etc/passwd',
      '..\\..\\windows\\system32',
      'documents/../../../secret.key',
      'documents/../outside.bin',
      '/absolute/path/file.bin',
      'C:\\Windows\\win.ini',
      'documents/\0/nullbyte.bin',
      './relative/file.bin',
      '',
    ];

    for (const key of maliciousKeys) {
      await assert.rejects(
        async () => {
          await storage.put(key, Buffer.from('Attack', 'utf-8'));
        },
        /Path traversal|Invalid storage key|must be a non-empty/i,
        `Expected rejection for key: "${key}"`
      );

      await assert.rejects(
        async () => {
          await storage.get(key);
        },
        /Path traversal|Invalid storage key|must be a non-empty/i,
        `Expected rejection for get with key: "${key}"`
      );

      await assert.rejects(
        async () => {
          await storage.delete(key);
        },
        /Path traversal|Invalid storage key|must be a non-empty/i,
        `Expected rejection for delete with key: "${key}"`
      );
    }
  });

  // Test 7: nested logical storage key works
  it('should support deep nested logical storage keys (documents/doc_001/ver_001/random-id.bin)', async () => {
    const nestedKey = 'documents/doc_001/ver_001/uuid_987654321.bin';
    const data = Buffer.from('Deeply nested document data', 'utf-8');

    await storage.put(nestedKey, data);
    const retrieved = await storage.get(nestedKey);

    assert.deepEqual(retrieved, data);
  });

  // Test 8: atomic write integrity
  it('should not leave partial temporary files on disk when write completes', async () => {
    const key = 'atomic/clean_test.bin';
    const data = Buffer.from('Atomic write test', 'utf-8');

    await storage.put(key, data);

    const dir = path.join(testStorageDir, 'atomic');
    const files = await fs.promises.readdir(dir);

    // The only file should be clean_test.bin; no lingering .tmp_* files
    assert.equal(files.length, 1);
    assert.equal(files[0], 'clean_test.bin');
  });
});
