import { keccak256, toUtf8Bytes, getAddress, isAddress } from 'ethers';
import {
  EVENT_DOCUMENT_SEALED_HASH,
  EVENT_DOCUMENT_SEALED_NAME,
} from './blockchain.types.js';
import {
  InvalidDocumentHashError,
  InvalidDocumentIdError,
} from '../errors/domain.errors.js';

/**
 * Deterministically converts an arbitrary application document ID string into a bytes32 hex string.
 *
 * Algorithm:
 * keccak256(toUtf8Bytes(documentId))
 *
 * Guarantees:
 * - Determinism: Identical strings always produce identical bytes32 values.
 * - Collision resistance: Different strings produce different bytes32 values.
 * - Uniformity: Supports any string length (UUIDs, case numbers, paths) without lossy truncation.
 *
 * @param documentId - Raw application document identifier.
 * @returns 0x-prefixed 32-byte (66-character) lowercase hexadecimal string.
 * @throws {InvalidDocumentIdError} If documentId is empty, whitespace, or not a string.
 */
export function encodeDocumentId(documentId: string): string {
  if (!documentId || typeof documentId !== 'string' || documentId.trim() === '') {
    throw new InvalidDocumentIdError(documentId, 'Document ID must be a non-empty string.');
  }

  return keccak256(toUtf8Bytes(documentId.trim()));
}

/**
 * Validates and formats a 64-character SHA-256 hexadecimal digest for Solidity bytes32 consumption.
 *
 * Requirements:
 * - Must be exactly 64 hexadecimal characters (or 66 with leading 0x).
 * - Characters must strictly be [0-9a-fA-F].
 *
 * @param hash - SHA-256 digest string.
 * @returns 0x-prefixed 64-character lowercase hexadecimal string (66 chars total).
 * @throws {InvalidDocumentHashError} If hash format is invalid.
 */
export function formatDocumentHash(hash: string): string {
  if (!hash || typeof hash !== 'string') {
    throw new InvalidDocumentHashError(String(hash), 'Hash must be a non-empty string.');
  }

  const trimmed = hash.trim();
  const cleanHex = trimmed.startsWith('0x') || trimmed.startsWith('0X') ? trimmed.slice(2) : trimmed;

  if (!/^[0-9a-fA-F]{64}$/.test(cleanHex)) {
    throw new InvalidDocumentHashError(
      trimmed,
      `Expected exactly 64 hexadecimal characters, got ${cleanHex.length}.`
    );
  }

  return `0x${cleanHex.toLowerCase()}`;
}

/**
 * Encodes lifecycle event type into the exact bytes32 format expected by DocumentIntegrityRegistry.sol.
 *
 * For DOCUMENT_SEALED:
 * Strictly produces keccak256("DOCUMENT_SEALED"), matching contract's EVENT_DOCUMENT_SEALED constant.
 *
 * @param eventType - Optional event type name or hex string (defaults to 'DOCUMENT_SEALED').
 * @returns 0x-prefixed 32-byte hexadecimal string.
 */
export function encodeEventType(eventType?: string): string {
  if (!eventType || eventType === EVENT_DOCUMENT_SEALED_NAME) {
    return EVENT_DOCUMENT_SEALED_HASH;
  }

  const trimmed = eventType.trim();

  // If already a 32-byte hex string, validate and normalize
  const cleanHex = trimmed.startsWith('0x') || trimmed.startsWith('0X') ? trimmed.slice(2) : trimmed;
  if (/^[0-9a-fA-F]{64}$/.test(cleanHex)) {
    return `0x${cleanHex.toLowerCase()}`;
  }

  // Otherwise compute deterministic keccak256 of the event type string
  return keccak256(toUtf8Bytes(trimmed));
}

/**
 * Validates and normalizes an Ethereum address.
 *
 * @param address - Raw address string.
 * @returns Checksummed Ethereum address string.
 * @throws {TypeError} If address is malformed.
 */
export function validateAndNormalizeAddress(address: string): string {
  if (!address || typeof address !== 'string' || !isAddress(address)) {
    throw new TypeError(`Invalid Ethereum address: "${address}".`);
  }
  return getAddress(address);
}

/**
 * Validates version identifier for Solidity uint256 consumption.
 *
 * @param versionId - Version number.
 * @returns BigInt representation.
 * @throws {RangeError} If versionId is not a positive integer >= 1.
 */
export function validateVersionId(versionId: number): bigint {
  if (
    typeof versionId !== 'number' ||
    !Number.isInteger(versionId) ||
    versionId < 1 ||
    !Number.isFinite(versionId)
  ) {
    throw new RangeError(
      `Invalid versionId: ${versionId}. Must be a positive integer greater than or equal to 1.`
    );
  }
  return BigInt(versionId);
}
