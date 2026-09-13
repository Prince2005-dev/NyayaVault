import type { BlockchainAnchor } from '../blockchain/blockchain.types.js';

/**
 * Sealing domain types and document repository contract for NyayaVault.
 */

export type DocumentStatus = 'DRAFT' | 'SEALED';

export type BlockchainAnchorStatus = 'NOT_ANCHORED' | 'ANCHORED' | 'PENDING' | 'FAILED';

export interface BlockchainResult {
  status: BlockchainAnchorStatus;
  anchor?: BlockchainAnchor;
  transactionHash?: string;
  error?: string;
}

export interface DocumentSealingResult {
  version: DocumentVersionRecord;
  blockchain: BlockchainResult;
}

export interface DocumentVersionRecord {
  /**
   * Unique identifier for this version record.
   */
  id: string;

  /**
   * Logical document identifier.
   */
  documentId: string;

  /**
   * Integer revision number (1, 2, 3...).
   */
  versionNumber: number;

  /**
   * Logical storage key pointing to the encrypted payload in storage.
   */
  storageKey: string;

  /**
   * Authoritative SHA-256 hash of the decrypted ORIGINAL file bytes.
   * Defined once status reaches SEALED.
   */
  sha256Hash?: string;

  /**
   * Current lifecycle state (DRAFT or SEALED).
   */
  status: DocumentStatus;

  /**
   * Timestamp when the document was sealed (ISO 8601 UTC).
   */
  sealedAt?: string;

  /**
   * Actor ID who sealed the document.
   */
  sealedBy?: string;

  /**
   * Actor ID who originally registered the document draft.
   */
  createdBy: string;

  /**
   * Timestamp when the document draft was created (ISO 8601 UTC).
   */
  createdAt: string;

  /**
   * Blockchain anchor status for this sealed version.
   */
  blockchainStatus?: BlockchainAnchorStatus;

  /**
   * Confirmed on-chain transaction hash for this sealed version.
   */
  blockchainTxHash?: string;
}

/**
 * Storage-neutral document repository interface.
 * To be implemented with PostgreSQL/Prisma by Member 3.
 */
export interface DocumentRepository {
  findById(documentId: string): Promise<DocumentVersionRecord | null>;
  save(record: DocumentVersionRecord): Promise<void>;
}

