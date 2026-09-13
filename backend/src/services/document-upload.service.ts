import { randomUUID, randomBytes } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../database/prisma.client.js';
import { PrismaDocumentRepository, type DocumentItemRecord } from '../database/prisma-document.repository.js';
import { PrismaCaseRepository, type CaseRepository } from '../database/case.repository.js';
import { PrismaAuditRepository } from '../database/prisma-audit.repository.js';
import { AuditService } from '../audit/audit.service.js';
import { calculateSha256 } from '../integrity/hash.service.js';
import { AesGcmEncryptionService } from '../encryption/aes-gcm.service.js';
import { serializeEncryptedPayload, type EncryptionService } from '../encryption/encryption.types.js';
import { LocalEncryptedStorage } from '../storage/local-encrypted-storage.js';
import type { StorageService } from '../storage/storage.types.js';
import { CaseAuthorizationService, type AuthUserContext } from './case-authorization.service.js';
import { validateUploadedFile, type ValidatedFile } from './file-validator.js';
import { loadEncryptionConfig, loadStorageConfig } from '../config/encryption.config.js';
import {
  CaseNotFoundError,
  InvalidUploadRequestError,
  UploadAuditFailedError,
} from '../errors/domain.errors.js';

export interface UploadMetadataInput {
  title?: string;
  documentType?: string;
  classification?: string;
  description?: string;
}

export class DocumentUploadService {
  private prisma: PrismaClient;
  private docRepo: PrismaDocumentRepository;
  private caseRepo: CaseRepository;
  private auditService: AuditService;
  private encryptionService: EncryptionService;
  private storageService: StorageService;

  constructor(dependencies?: {
    prisma?: PrismaClient;
    docRepo?: PrismaDocumentRepository;
    caseRepo?: CaseRepository;
    auditService?: AuditService;
    encryptionService?: EncryptionService;
    storageService?: StorageService;
  }) {
    this.prisma = dependencies?.prisma ?? getPrismaClient();
    this.docRepo = dependencies?.docRepo ?? new PrismaDocumentRepository(this.prisma);
    this.caseRepo = dependencies?.caseRepo ?? new PrismaCaseRepository();
    this.auditService =
      dependencies?.auditService ??
      new AuditService(new PrismaAuditRepository(this.prisma));

    if (dependencies?.encryptionService) {
      this.encryptionService = dependencies.encryptionService;
    } else {
      const encConfig = loadEncryptionConfig();
      this.encryptionService = new AesGcmEncryptionService(
        encConfig.key,
        encConfig.keyVersion
      );
    }

    if (dependencies?.storageService) {
      this.storageService = dependencies.storageService;
    } else {
      const storageConfig = loadStorageConfig();
      this.storageService = new LocalEncryptedStorage(storageConfig.storageRootDir);
    }
  }

  /**
   * Executes the full secure document upload pipeline:
   * 1. Authenticate caller (req.user)
   * 2. Authorize parent case access (CaseAuthorizationService)
   * 3. Validate file (size, extension, MIME, magic bytes)
   * 4. Compute authoritative SHA-256 on raw file bytes
   * 5. Encrypt raw bytes with AES-256-GCM
   * 6. Persist encrypted payload to secure local storage
   * 7. Persist Document and DocumentVersion (v1, DRAFT) in PostgreSQL
   * 8. Append DOCUMENT_UPLOADED immutable audit event to hash chain
   * 9. Return safe frontend-compatible DocumentItemRecord
   */
  public async uploadDocument(
    caseId: string,
    file: Express.Multer.File | undefined,
    metadata: UploadMetadataInput,
    user: AuthUserContext
  ): Promise<DocumentItemRecord> {
    // 1. Authorize case access BEFORE file processing/cryptographic work
    const isAuthorized = await CaseAuthorizationService.canAccessCase(
      user,
      caseId,
      this.caseRepo
    );

    if (!isAuthorized) {
      throw new CaseNotFoundError(caseId);
    }

    const caseRecord = await this.caseRepo.findById(caseId);
    if (!caseRecord) {
      throw new CaseNotFoundError(caseId);
    }

    // 2. Validate uploaded file
    const validatedFile: ValidatedFile = validateUploadedFile(file);

    // 3. Validate metadata fields
    const title = (metadata.title || validatedFile.originalName).trim();
    if (!title || title.length < 2) {
      throw new InvalidUploadRequestError('Document title must be at least 2 characters long.');
    }

    const documentType = (metadata.documentType || 'FORENSIC_REPORT').trim();
    const classification = (
      metadata.classification ||
      caseRecord.classification ||
      'CONFIDENTIAL'
    ).trim();
    const description = metadata.description?.trim();

    // 4. Generate logical IDs and internal storage key
    const documentId = `doc_${randomUUID().replace(/-/g, '')}`;
    const versionId = `ver_${randomUUID().replace(/-/g, '')}`;
    const storageKey = `documents/${documentId}/v1/${randomBytes(16).toString('hex')}.bin`;

    // 5. Authoritative SHA-256 calculation on raw original bytes
    const sha256Hash = calculateSha256(validatedFile.buffer);

    // 6. Authenticated AES-256-GCM encryption
    const encryptedPayload = await this.encryptionService.encrypt(validatedFile.buffer);

    // 7. Store serialized encrypted payload in secure storage
    const serializedPayload = serializeEncryptedPayload(encryptedPayload);
    await this.storageService.put(storageKey, serializedPayload);

    // 8. Atomically persist Document & DocumentVersion in PostgreSQL
    try {
      await this.docRepo.createDocumentWithInitialVersion({
        documentId,
        caseId,
        title,
        versionId,
        storageKey,
        sha256Hash,
        createdBy: user.id,
      });
    } catch (dbError) {
      // Storage rollback guard: delete newly stored object if DB persistence fails
      try {
        await this.storageService.delete(storageKey);
      } catch {
        // Suppress secondary cleanup failure
      }
      throw dbError;
    }

    // 9. Append immutable DOCUMENT_UPLOADED audit event to hash chain
    try {
      await this.auditService.createEvent({
        eventType: 'DOCUMENT_UPLOADED',
        actorId: user.id,
        documentId,
        versionId,
        timestamp: new Date().toISOString(),
        metadata: {
          fileName: validatedFile.originalName,
          mimeType: validatedFile.mimeType,
          fileSizeBytes: validatedFile.sizeBytes,
          sha256Hash,
          documentType,
          classification,
          description,
        },
      });
    } catch (auditError) {
      // Rollback database record and storage if audit event creation fails
      try {
        await this.prisma.document.delete({ where: { id: documentId } });
      } catch {
        // Suppress secondary cleanup failure
      }
      try {
        await this.storageService.delete(storageKey);
      } catch {
        // Suppress secondary cleanup failure
      }
      throw new UploadAuditFailedError(
        documentId,
        (auditError as Error).message || 'Failed to create DOCUMENT_UPLOADED audit event.'
      );
    }

    // 10. Retrieve and return safe frontend-compatible document representation
    const createdDoc = await this.docRepo.findDocumentDetail(documentId);
    if (!createdDoc) {
      throw new Error(`Failed to retrieve newly created document "${documentId}".`);
    }

    return createdDoc;
  }
}
