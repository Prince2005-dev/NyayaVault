import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateSha256 } from './hash.service.js';

describe('Integrity Service: calculateSha256', () => {
  // Test 1: Known SHA-256 test vector ("hello")
  it('should match known SHA-256 test vector for "hello"', () => {
    const input = Buffer.from('hello', 'utf-8');
    const expected = '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824';
    const result = calculateSha256(input);

    assert.equal(result, expected);
  });

  // Test 1b: Secondary NIST test vector ("The quick brown fox jumps over the lazy dog")
  it('should match known NIST test vector for "The quick brown fox jumps over the lazy dog"', () => {
    const input = Buffer.from('The quick brown fox jumps over the lazy dog', 'utf-8');
    const expected = 'd7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592';
    const result = calculateSha256(input);

    assert.equal(result, expected);
  });

  // Test 2: Empty Buffer test vector
  it('should match standard SHA-256 digest for an empty buffer', () => {
    const emptyBuffer = Buffer.alloc(0);
    const expected = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    const result = calculateSha256(emptyBuffer);

    assert.equal(result, expected);
  });

  // Test 3: Same content -> same hash (determinism)
  it('should be deterministic (identical input produces identical hash across multiple calls)', () => {
    const data = Buffer.from('NyayaVault Judicial Evidence Document 2026', 'utf-8');
    const hash1 = calculateSha256(data);
    const hash2 = calculateSha256(data);
    const hash3 = calculateSha256(Buffer.from('NyayaVault Judicial Evidence Document 2026', 'utf-8'));

    assert.equal(hash1, hash2);
    assert.equal(hash2, hash3);
  });

  // Test 4: Different content -> different hash
  it('should produce different hashes for different byte content (collision resistance)', () => {
    const original = Buffer.from('Evidence Report: Tamper Proof', 'utf-8');
    const modified = Buffer.from('Evidence Report: Tamper-Proof', 'utf-8');

    const hashOriginal = calculateSha256(original);
    const hashModified = calculateSha256(modified);

    assert.notEqual(hashOriginal, hashModified);
  });

  // Test 5: Result is lowercase hexadecimal
  it('should strictly return lowercase hexadecimal characters (0-9, a-f)', () => {
    const input = Buffer.from('Testing Hex Characters Case', 'utf-8');
    const result = calculateSha256(input);

    assert.match(result, /^[0-9a-f]{64}$/);
    assert.equal(result, result.toLowerCase());
  });

  // Test 6: Result length is exactly 64 characters
  it('should return a string of exactly 64 characters in length', () => {
    const input = Buffer.from('Short', 'utf-8');
    const result = calculateSha256(input);

    assert.equal(result.length, 64);
  });

  // Test 7: Rejection of non-Buffer input
  it('should throw TypeError when input is not a Buffer', () => {
    // @ts-expect-error - testing runtime type safety against non-Buffer inputs
    assert.throws(() => calculateSha256('string-input'), {
      name: 'TypeError',
      message: 'calculateSha256 requires a valid Node.js Buffer input containing raw document bytes.',
    });

    // @ts-expect-error - testing runtime type safety
    assert.throws(() => calculateSha256(null), {
      name: 'TypeError',
    });

    // @ts-expect-error - testing runtime type safety
    assert.throws(() => calculateSha256({ filename: 'test.pdf' }), {
      name: 'TypeError',
    });
  });
});
