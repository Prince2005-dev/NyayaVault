/**
 * Types and interfaces for the NyayaVault Blockchain Service layer.
 */

export const EVENT_DOCUMENT_SEALED_NAME = 'DOCUMENT_SEALED';

/**
 * Standard bytes32 hash representation of the DOCUMENT_SEALED event type,
 * strictly matching keccak256("DOCUMENT_SEALED") in DocumentIntegrityRegistry.sol:
 * 0x075038a8db53194dff85c85039c9039b8a05ecd78d2c6f4e6f6eceb5d5969197
 */
export const EVENT_DOCUMENT_SEALED_HASH =
  '0x075038a8db53194dff85c85039c9039b8a05ecd78d2c6f4e6f6eceb5d5969197';

export interface AnchorDocumentInput {
  /** Logical document identifier (e.g. 'doc_001', UUID, or case identifier). */
  documentId: string;
  /** Monotonically increasing revision number (>= 1). */
  versionId: number;
  /** 64-character hexadecimal SHA-256 digest of original plaintext bytes. */
  documentHash: string;
  /** Lifecycle event type name or bytes32 hex (defaults to 'DOCUMENT_SEALED'). */
  eventType?: string;
  /** Recording actor identifier or Ethereum address (optional; defaults to signer address). */
  actorAddress?: string;
}

export interface BlockchainAnchor {
  /** Original application document ID. */
  documentId: string;
  /** Document version number. */
  versionId: number;
  /** 64-character lowercase hexadecimal SHA-256 digest (without 0x prefix). */
  documentHash: string;
  /** 32-byte hex string representing the on-chain event type. */
  eventType: string;
  /** Ethereum address of the recording actor/signer. */
  actor: string;
  /** Authoritative block timestamp (Unix timestamp in seconds) derived from EVM block.timestamp. */
  timestamp: number;
  /** 0x-prefixed transaction hash confirming on-chain inclusion. */
  transactionId: string;
  /** Block number containing the anchor transaction (if available). */
  blockNumber?: number;
}

export interface BlockchainService {
  /**
   * Anchors an immutable document cryptographic proof to the blockchain.
   *
   * @param input - Document ID, version ID, SHA-256 hash, event type, and actor.
   * @returns Confirmed on-chain BlockchainAnchor proof.
   * @throws {InvalidDocumentHashError} If documentHash is not a valid 64-char SHA-256.
   * @throws {InvalidDocumentIdError} If documentId is empty or invalid.
   * @throws {BlockchainAnchorAlreadyExistsError} If this document version is already anchored.
   * @throws {BlockchainUnavailableError} If RPC connection cannot be established.
   * @throws {BlockchainTransactionFailedError} If transaction fails or reverts on-chain.
   */
  anchorDocument(input: AnchorDocumentInput): Promise<BlockchainAnchor>;

  /**
   * Retrieves an existing immutable anchor proof from the blockchain.
   *
   * @param documentId - Logical document identifier.
   * @param versionId - Monotonically increasing version number.
   * @returns The BlockchainAnchor if found, or null if unanchored.
   * @throws {BlockchainUnavailableError} If RPC connection fails.
   */
  getAnchor(documentId: string, versionId: number): Promise<BlockchainAnchor | null>;

  /**
   * Pure comparison: verifies whether a candidate document SHA-256 hash matches
   * the hash stored in an on-chain anchor proof.
   *
   * @param documentHash - Candidate SHA-256 hash string (with or without 0x).
   * @param anchor - BlockchainAnchor record retrieved from chain.
   * @returns true if hashes match identically (case-insensitively), false otherwise.
   */
  verifyAnchor(documentHash: string, anchor: BlockchainAnchor): boolean;
}
