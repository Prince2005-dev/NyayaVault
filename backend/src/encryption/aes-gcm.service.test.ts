import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { AesGcmEncryptionService } from './aes-gcm.service.js';
import {
  parseAndValidateEncryptionKey,
} from '../config/encryption.config.js';
import {
  serializeEncryptedPayload,
  deserializeEncryptedPayload,
} from './encryption.types.js';

describe('Encryption Service: AesGcmEncryptionService', () => {
  // Deterministic 32-byte test key (never leaks real developer .env secrets)
  const testKey = Buffer.from('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', 'hex');
  const service = new AesGcmEncryptionService(testKey, 'v1');

  // Test 1: encrypt Buffer successfully
  it('should encrypt a Buffer successfully', async () => {
    const data = Buffer.from('Court Evidence File Content - State vs. Corp 2026', 'utf-8');
    const payload = await service.encrypt(data);

    assert.ok(payload);
    assert.ok(Buffer.isBuffer(payload.ciphertext));
    assert.ok(payload.ciphertext.length > 0);
    assert.equal(typeof payload.iv, 'string');
    assert.equal(typeof payload.authTag, 'string');
    assert.equal(payload.keyVersion, 'v1');
  });

  // Test 2: encrypt -> decrypt returns identical original bytes
  it('should encrypt and decrypt returning identical original bytes', async () => {
    const original = Buffer.from('Confidential Legal Evidence Payload \x00\x01\xfe\xff binary bytes', 'binary');
    const encrypted = await service.encrypt(original);
    const decrypted = await service.decrypt(encrypted);

    assert.deepEqual(decrypted, original);
  });

  // Test 3: encrypting same data twice produces different ciphertext and IV
  it('should generate fresh random IV and distinct ciphertext for identical plaintext inputs', async () => {
    const data = Buffer.from('Identical Document Content', 'utf-8');
    const enc1 = await service.encrypt(data);
    const enc2 = await service.encrypt(data);

    assert.notEqual(enc1.iv, enc2.iv, 'IVs must be uniquely generated per encryption call');
    assert.notEqual(
      enc1.ciphertext.toString('hex'),
      enc2.ciphertext.toString('hex'),
      'Ciphertext must differ due to fresh initialization vector'
    );
  });

  // Test 4: plaintext is not directly equal to ciphertext
  it('should ensure plaintext is not equal to ciphertext', async () => {
    const plaintext = Buffer.from('Highly Sensitive Plaintext Record', 'utf-8');
    const enc = await service.encrypt(plaintext);

    assert.notEqual(enc.ciphertext.toString('utf-8'), plaintext.toString('utf-8'));
    assert.ok(!enc.ciphertext.includes(plaintext));
  });

  // Test 5: auth tag is produced with expected length (16 bytes = 32 hex chars)
  it('should produce a valid 16-byte authentication tag encoded as 32 hex characters', async () => {
    const data = Buffer.from('Sample Document', 'utf-8');
    const enc = await service.encrypt(data);

    assert.equal(enc.authTag.length, 32);
    assert.match(enc.authTag, /^[0-9a-f]{32}$/i);
  });

  // Test 6: key version is present
  it('should include the key version identifier in the output payload', async () => {
    const customService = new AesGcmEncryptionService(testKey, 'v2-quantum');
    const enc = await customService.encrypt(Buffer.from('Data', 'utf-8'));

    assert.equal(enc.keyVersion, 'v2-quantum');
  });

  // Test 7: modified ciphertext causes decrypt failure (tamper detection)
  it('should throw an error if the ciphertext is modified (tamper detection)', async () => {
    const data = Buffer.from('Original Sealed Document', 'utf-8');
    const enc = await service.encrypt(data);

    // Tamper with one byte of the ciphertext
    const tamperedCiphertext = Buffer.from(enc.ciphertext);
    tamperedCiphertext[0] = tamperedCiphertext[0] ^ 0xff;

    await assert.rejects(
      async () => {
        await service.decrypt({
          ...enc,
          ciphertext: tamperedCiphertext,
        });
      },
      /Decryption failed/
    );
  });

  // Test 8: modified IV causes decrypt failure
  it('should throw an error if the IV is modified', async () => {
    const data = Buffer.from('Original Sealed Document', 'utf-8');
    const enc = await service.encrypt(data);

    // Replace IV with another valid-length hex string
    const tamperedIv = '000000000000000000000000';

    await assert.rejects(
      async () => {
        await service.decrypt({
          ...enc,
          iv: tamperedIv,
        });
      },
      /Decryption failed/
    );
  });

  // Test 9: modified authentication tag causes decrypt failure
  it('should throw an error if the authentication tag is modified', async () => {
    const data = Buffer.from('Original Sealed Document', 'utf-8');
    const enc = await service.encrypt(data);

    // Tamper with the auth tag
    const tamperedTag = enc.authTag.slice(0, 30) + 'ff';

    await assert.rejects(
      async () => {
        await service.decrypt({
          ...enc,
          authTag: tamperedTag,
        });
      },
      /Decryption failed/
    );
  });

  // Test 10: wrong key causes decrypt failure
  it('should throw an error if decrypted with a different 32-byte key', async () => {
    const data = Buffer.from('Evidence protected by key 1', 'utf-8');
    const enc = await service.encrypt(data);

    // Create a different service with a distinct key
    const differentKey = randomBytes(32);
    const otherService = new AesGcmEncryptionService(differentKey, 'v1');

    await assert.rejects(
      async () => {
        await otherService.decrypt(enc);
      },
      /Decryption failed/
    );
  });

  // Test 11: missing encryption key fails clearly
  it('should fail clearly when the encryption key is missing or undefined', () => {
    assert.throws(
      () => parseAndValidateEncryptionKey(undefined),
      /Missing required encryption key/
    );

    assert.throws(
      () => parseAndValidateEncryptionKey('   '),
      /Missing required encryption key/
    );
  });

  // Test 12: invalid key size or format fails clearly
  it('should fail clearly when the encryption key is malformed or not 32 bytes', () => {
    // 16 bytes base64 (too short for AES-256)
    const shortKeyBase64 = Buffer.alloc(16, 0xaa).toString('base64');
    assert.throws(
      () => parseAndValidateEncryptionKey(shortKeyBase64),
      /Malformed encryption key|Invalid encryption key length/
    );

    // Non-base64 string
    assert.throws(
      () => parseAndValidateEncryptionKey('this_is_not_valid_base64!'),
      /Malformed encryption key/
    );

    // Constructor validation for wrong Buffer length
    assert.throws(
      () => new AesGcmEncryptionService(Buffer.alloc(16)),
      /requires a 32-byte Buffer key/
    );
  });

  // Test 13: Payload serialization and deserialization roundtrip
  it('should serialize and deserialize an EncryptedPayload cleanly without data loss', async () => {
    const data = Buffer.from('Binary evidence stream to serialize', 'utf-8');
    const enc = await service.encrypt(data);

    const serializedBuffer = serializeEncryptedPayload(enc);
    assert.ok(Buffer.isBuffer(serializedBuffer));

    const deserialized = deserializeEncryptedPayload(serializedBuffer);
    assert.deepEqual(deserialized.ciphertext, enc.ciphertext);
    assert.equal(deserialized.iv, enc.iv);
    assert.equal(deserialized.authTag, enc.authTag);
    assert.equal(deserialized.keyVersion, enc.keyVersion);

    const decrypted = await service.decrypt(deserialized);
    assert.deepEqual(decrypted, data);
  });
});
