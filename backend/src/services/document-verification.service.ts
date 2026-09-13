import { calculateSha256 } from '../integrity/hash.service.js';
import { deserializeEncryptedPayload } from '../encryption/encryption.types.js';
import type { EncryptionService } from '../encryption/encryption.types.js';
import type { StorageService } from '../storage/storage.types.js';
import type { BlockchainService, BlockchainAnchor } from '../blockchain/blockchain.types.js';
import { EVENT_DOCUMENT_SEALED_HASH } from '../blockchain/blockchain.types.js';
import type { DocumentRepository } from '../sealing/sealing.types.js';
import {
  DocumentNotFoundError,
  DocumentNotSealedError,
} from '../errors/domain.errors.js';

export type VerificationStatus = 'VERIFIED' | 'MISMATCH' | 'ERROR';

export interface VerificationResult {
  status: VerificationStatus;
  originalHash: string;
  currentHash: string;
  blockchainHash: string;
  blockchainTxId: string;
  timestamp: string;
  message?: string;
}

/**
 * Service orchestrating server-side cryptographic audit and tamper detection.
 *
 * Primary verification pipeline:
 * 1. Locate trusted sealed version record in DocumentRepository.
 * 2. Verify document status is strictly SEALED (rejects DRAFT with DocumentNotSealedError).
 * 3. Retrieve encrypted artifact from LocalEncryptedStorage.
 * 4. Decrypt using AesGcmEncryptionService (detects storage corruption / auth tag failure).
 * 5. Compute SHA-256 directly from current decrypted plaintext bytes.
 * 6. Query on-chain anchor proof from BlockchainService (distinguishes RPC failure from mismatch).
 * 7. Validate 4-point blockchain proof (identity, version, eventType, hash).
 * 8. Return VERIFIED, MISMATCH, or ERROR with zero persistent state mutation.
 */
export class DocumentVerificationService {
  constructor(
    private readonly documentRepo: DocumentRepository,
    private readonly storageService: StorageService,
    private readonly encryptionService: EncryptionService,
    private readonly blockchainService: BlockchainService,
    private readonly clock: () => Date = () => new Date()
  ) {}

  /**
   * Verifies the cryptographic integrity and blockchain anchoring of a sealed document.
   *
   * Pure read/compare operation:
   * - Does NOT alter sha256Hash, sealedAt, sealedBy, status, or version.
   * - Does NOT mutate stored encrypted bytes or reseal the document.
   * - Does NOT submit new blockchain transactions.
   *
   * @param documentId - Logical document identifier.
   * @returns VerificationResult containing status, hashes, transaction ID, and timestamp.
   */
  public async verifyDocument(documentId: string): Promise<VerificationResult> {
    if (!documentId || typeof documentId !== 'string' || documentId.trim() === '') {
      throw new DocumentNotFoundError(documentId);
    }

    const timestamp = this.clock().toISOString();

    // 1. Locate current document version record
    const doc = await this.documentRepo.findById(documentId);
    if (!doc) {
      throw new DocumentNotFoundError(documentId);
    }

    // 2. Immutability guard: only SEALED documents can be verified
    if (doc.status !== 'SEALED') {
      throw new DocumentNotSealedError(documentId, doc.status);
    }

    // 3. Extract authoritative trusted sealed SHA-256 hash
    const trustedHash = doc.sha256Hash;
    if (!trustedHash) {
      throw new DocumentNotSealedError(documentId, 'SEALED_WITHOUT_HASH');
    }

    // 4. Validate storage key exists
    if (!doc.storageKey) {
      return {
        status: 'ERROR',
        originalHash: trustedHash,
        currentHash: '',
        blockchainHash: '',
        blockchainTxId: doc.blockchainTxHash || '',
        timestamp,
        message: 'Document record has no associated storageKey.',
      };
    }

    // 5. Read stored encrypted bytes from storage adapter
    let encryptedBuffer: Buffer;
    try {
      encryptedBuffer = await this.storageService.get(doc.storageKey);
    } catch (err) {
      return {
        status: 'ERROR',
        originalHash: trustedHash,
        currentHash: '',
        blockchainHash: '',
        blockchainTxId: doc.blockchainTxHash || '',
        timestamp,
        message: `Storage artifact not found: ${(err as Error).message}`,
      };
    }

    // 6. Decrypt ciphertext into original plaintext bytes using AES-256-GCM
    let decryptedBytes: Buffer;
    try {
      const payload = deserializeEncryptedPayload(encryptedBuffer);
      decryptedBytes = await this.encryptionService.decrypt(payload);
    } catch (err) {
      return {
        status: 'ERROR',
        originalHash: trustedHash,
        currentHash: '',
        blockchainHash: '',
        blockchainTxId: doc.blockchainTxHash || '',
        timestamp,
        message: `Decryption failed: storage payload corrupted or authentication tag mismatch: ${
          (err as Error).message
        }`,
      };
    }

    // 7. Calculate authoritative SHA-256 from current decrypted plaintext bytes
    const currentHash = calculateSha256(decryptedBytes);

    // 8. Query blockchain anchor proof from BlockchainService
    let anchor: BlockchainAnchor | null = null;
    try {
      anchor = await this.blockchainService.getAnchor(doc.documentId, doc.versionNumber);
    } catch (err) {
      // Infrastructure / RPC failure must be classified as ERROR, never as MISMATCH
      return {
        status: 'ERROR',
        originalHash: trustedHash,
        currentHash,
        blockchainHash: '',
        blockchainTxId: doc.blockchainTxHash || '',
        timestamp,
        message: `Blockchain verification unavailable: RPC or network provider unreachable: ${
          (err as Error).message
        }`,
      };
    }

    // 9. Compare current plaintext SHA-256 against trusted sealed SHA-256
    const bytesMatch = currentHash.toLowerCase() === trustedHash.toLowerCase();
    if (!bytesMatch) {
      return {
        status: 'MISMATCH',
        originalHash: trustedHash,
        currentHash,
        blockchainHash: anchor?.documentHash || '',
        blockchainTxId: doc.blockchainTxHash || anchor?.transactionId || '',
        timestamp,
        message: 'Document bytes mismatch: current plaintext does not match trusted sealed fingerprint.',
      };
    }

    // 10. Complete 4-Point Blockchain Proof Validation
    // A. Anchor must exist on-chain
    if (!anchor) {
      return {
        status: 'MISMATCH',
        originalHash: trustedHash,
        currentHash,
        blockchainHash: '',
        blockchainTxId: doc.blockchainTxHash || '',
        timestamp,
        message: 'Blockchain anchor proof missing for sealed document version.',
      };
    }

    // B. Document identifier must match
    if (anchor.documentId !== doc.documentId) {
      return {
        status: 'MISMATCH',
        originalHash: trustedHash,
        currentHash,
        blockchainHash: anchor.documentHash,
        blockchainTxId: doc.blockchainTxHash || anchor.transactionId || '',
        timestamp,
        message: `Blockchain anchor documentId mismatch: expected "${doc.documentId}", found "${anchor.documentId}".`,
      };
    }

    // C. Version number must match
    if (anchor.versionId !== doc.versionNumber) {
      return {
        status: 'MISMATCH',
        originalHash: trustedHash,
        currentHash,
        blockchainHash: anchor.documentHash,
        blockchainTxId: doc.blockchainTxHash || anchor.transactionId || '',
        timestamp,
        message: `Blockchain anchor versionId mismatch: expected ${doc.versionNumber}, found ${anchor.versionId}.`,
      };
    }

    // D. Event type must match DOCUMENT_SEALED
    const cleanEventType = anchor.eventType.trim().toLowerCase();
    const isEventTypeValid =
      cleanEventType === EVENT_DOCUMENT_SEALED_HASH.toLowerCase() ||
      cleanEventType === 'document_sealed';
    if (!isEventTypeValid) {
      return {
        status: 'MISMATCH',
        originalHash: trustedHash,
        currentHash,
        blockchainHash: anchor.documentHash,
        blockchainTxId: doc.blockchainTxHash || anchor.transactionId || '',
        timestamp,
        message: `Blockchain anchor event type mismatch: expected DOCUMENT_SEALED, found "${anchor.eventType}".`,
      };
    }

    // E. Anchor hash must match trusted sealed hash
    const isAnchorHashValid = this.blockchainService.verifyAnchor(trustedHash, anchor);
    if (!isAnchorHashValid) {
      return {
        status: 'MISMATCH',
        originalHash: trustedHash,
        currentHash,
        blockchainHash: anchor.documentHash,
        blockchainTxId: doc.blockchainTxHash || anchor.transactionId || '',
        timestamp,
        message: 'Blockchain anchor hash contradicts trusted sealed document hash.',
      };
    }

    // 11. All cryptographic and blockchain checks verified
    return {
      status: 'VERIFIED',
      originalHash: trustedHash,
      currentHash,
      blockchainHash: anchor.documentHash,
      blockchainTxId: doc.blockchainTxHash || anchor.transactionId || '',
      timestamp,
    };
  }
}
