import { calculateSha256 } from '../integrity/hash.service.js';
import { deserializeEncryptedPayload } from '../encryption/encryption.types.js';
import type { EncryptionService } from '../encryption/encryption.types.js';
import type { StorageService } from '../storage/storage.types.js';
import type { AuditService } from '../audit/audit.service.js';
import type { BlockchainService } from '../blockchain/blockchain.types.js';
import type {
  DocumentRepository,
  DocumentVersionRecord,
  DocumentSealingResult,
  BlockchainResult,
} from './sealing.types.js';
import {
  DocumentNotFoundError,
  DocumentAlreadySealedError,
  FileNotFoundError,
  DecryptionFailedError,
  InvalidDocumentStateError,
} from '../errors/domain.errors.js';

export class DocumentSealingService {
  constructor(
    private readonly documentRepo: DocumentRepository,
    private readonly storageService: StorageService,
    private readonly encryptionService: EncryptionService,
    private readonly auditService: AuditService,
    private readonly blockchainService: BlockchainService,
    private readonly clock: () => Date = () => new Date()
  ) {}

  /**
   * Authoritatively seals a document draft, rendering it immutable, recording its
   * cryptographic integrity identity in the audit trail, and anchoring its proof on-chain.
   *
   * Core Lifecycle Pipeline:
   * 1. Validate inputs (actorId).
   * 2. Locate document draft in repository.
   * 3. Immutability guard: if already SEALED, reject with DocumentAlreadySealedError.
   * 4. Retrieve stored encrypted bytes from storage adapter.
   * 5. Decrypt ciphertext into original document bytes using AES-256-GCM.
   * 6. Compute authoritative SHA-256 digest directly from original decrypted plaintext bytes.
   * 7. Transition status to SEALED and record sealedAt / sealedBy.
   * 8. Persist SEALED state to repository.
   * 9. Emit immutable DOCUMENT_SEALED event into the audit hash-chain.
   * 10. Anchor cryptographic proof (documentId, versionNumber, SHA-256) via BlockchainService.
   * 11. Return sealed DocumentVersionRecord and BlockchainResult.
   *
   * Failure Isolation:
   * If blockchain anchoring fails (network unavailable, RPC timeout, contract failure),
   * the document remains securely stored and SEALED with its audit event intact.
   * The returned blockchain status is explicitly marked as FAILED with error details,
   * preserving core document security without rollback.
   *
   * @param documentId - Unique logical document identifier.
   * @param actorId - Authorized legal officer or investigator identifier.
   * @returns DocumentSealingResult containing sealed DocumentVersionRecord and BlockchainResult.
   */
  public async sealDocument(
    documentId: string,
    actorId: string
  ): Promise<DocumentSealingResult> {
    if (!actorId || typeof actorId !== 'string' || actorId.trim() === '') {
      throw new TypeError('actorId is required to seal a document.');
    }

    // 1. Locate target document
    const doc = await this.documentRepo.findById(documentId);
    if (!doc) {
      throw new DocumentNotFoundError(documentId);
    }

    // 2. Immutability guard: already sealed versions cannot be resealed
    if (doc.status === 'SEALED') {
      throw new DocumentAlreadySealedError(documentId);
    }

    // 3. Confirm DRAFT status
    if (doc.status !== 'DRAFT') {
      throw new InvalidDocumentStateError(documentId, doc.status, 'DRAFT');
    }

    // 4. Confirm storage key
    if (!doc.storageKey) {
      throw new FileNotFoundError(documentId, 'Document record has no associated storageKey.');
    }

    // 5. Read stored encrypted bytes
    let encryptedBuffer: Buffer;
    try {
      encryptedBuffer = await this.storageService.get(doc.storageKey);
    } catch (err) {
      throw new FileNotFoundError(doc.storageKey, (err as Error).message);
    }

    // 6. Decrypt payload using AES-256-GCM
    let originalBytes: Buffer;
    try {
      const payload = deserializeEncryptedPayload(encryptedBuffer);
      originalBytes = await this.encryptionService.decrypt(payload);
    } catch (err) {
      throw new DecryptionFailedError(documentId, (err as Error).message);
    }

    // 7. Calculate authoritative SHA-256 from ORIGINAL plaintext bytes
    const sha256Hash = calculateSha256(originalBytes);

    // 8. Apply immutable sealed status
    const sealedAt = this.clock().toISOString();
    doc.status = 'SEALED';
    doc.sha256Hash = sha256Hash;
    doc.sealedAt = sealedAt;
    doc.sealedBy = actorId;

    // 9. Persist updated document record before blockchain call
    await this.documentRepo.save(doc);

    // 10. Append DOCUMENT_SEALED event to audit hash-chain
    await this.auditService.createEvent({
      eventType: 'DOCUMENT_SEALED',
      actorId,
      documentId: doc.documentId,
      versionId: doc.id,
      timestamp: sealedAt,
      metadata: {
        versionNumber: doc.versionNumber,
        sha256Hash,
      },
    });

    // 11. Attempt blockchain anchor
    let blockchainResult: BlockchainResult;
    try {
      const anchor = await this.blockchainService.anchorDocument({
        documentId: doc.documentId,
        versionId: doc.versionNumber,
        documentHash: sha256Hash,
        eventType: 'DOCUMENT_SEALED',
      });

      blockchainResult = {
        status: 'ANCHORED',
        anchor,
        transactionHash: anchor.transactionId,
      };

      // Record successful anchor metadata on document version
      doc.blockchainStatus = 'ANCHORED';
      doc.blockchainTxHash = anchor.transactionId;
      await this.documentRepo.save(doc);
    } catch (err: unknown) {
      // CRITICAL: Document remains SEALED, audit event remains recorded.
      // We do NOT rollback to DRAFT, do NOT delete document, do NOT delete audit event.
      const errorMessage = err instanceof Error ? err.message : String(err);
      blockchainResult = {
        status: 'FAILED',
        error: errorMessage,
      };

      doc.blockchainStatus = 'FAILED';
      await this.documentRepo.save(doc);
    }

    return {
      version: doc,
      blockchain: blockchainResult,
    };
  }
}

