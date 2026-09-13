import type { Request, Response, NextFunction } from 'express';
import { getPrismaClient } from '../database/prisma.client.js';
import { PrismaDocumentRepository } from '../database/prisma-document.repository.js';
import { PrismaCaseRepository, type CaseRepository } from '../database/case.repository.js';
import { PrismaAuditRepository } from '../database/prisma-audit.repository.js';
import { CaseAuthorizationService } from '../services/case-authorization.service.js';
import { DocumentUploadService } from '../services/document-upload.service.js';
import { DocumentSealingService } from '../sealing/sealing.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AesGcmEncryptionService } from '../encryption/aes-gcm.service.js';
import { LocalEncryptedStorage } from '../storage/local-encrypted-storage.js';
import { EthersBlockchainService } from '../blockchain/ethers-blockchain.service.js';
import type { BlockchainService } from '../blockchain/blockchain.types.js';
import { loadEncryptionConfig, loadStorageConfig } from '../config/encryption.config.js';
import { DocumentVerificationService } from '../services/document-verification.service.js';
import type { StorageService } from '../storage/storage.types.js';
import {
  deserializeEncryptedPayload,
  type EncryptionService,
} from '../encryption/encryption.types.js';
import {
  CaseNotFoundError,
  DocumentNotFoundError,
  DocumentNotSealedError,
  BlockchainUnavailableError,
} from '../errors/domain.errors.js';

function createDefaultStorageService(): LocalEncryptedStorage {
  const storageConfig = loadStorageConfig();
  return new LocalEncryptedStorage(storageConfig.storageRootDir);
}

function createDefaultEncryptionService(): AesGcmEncryptionService {
  const encConfig = loadEncryptionConfig();
  return new AesGcmEncryptionService(encConfig.key, encConfig.keyVersion);
}

function sanitizeFilename(input: string): string {
  if (!input || typeof input !== 'string') {
    return 'document.bin';
  }
  // Strip path traversal / directory components
  let name = input.replace(/\\/g, '/');
  name = name.split('/').pop() || 'document.bin';

  // Remove CR, LF, null bytes, and control characters (header injection prevention)
  name = name.replace(/[\r\n\t\0-\x1f\x7f]/g, '');

  // Replace quotes and semicolons to prevent Content-Disposition header injection
  name = name.replace(/["';]/g, '_');

  // Strip leading/trailing dots and whitespace
  name = name.trim().replace(/^\.+/, '');

  if (!name) {
    return 'document.bin';
  }

  return name;
}

function createDefaultSealingService(): DocumentSealingService {
  const prisma = getPrismaClient();
  const docRepo = new PrismaDocumentRepository(prisma);
  const auditRepo = new PrismaAuditRepository(prisma);
  const auditService = new AuditService(auditRepo);
  const encConfig = loadEncryptionConfig();
  const encryptionService = new AesGcmEncryptionService(encConfig.key, encConfig.keyVersion);
  const storageConfig = loadStorageConfig();
  const storageService = new LocalEncryptedStorage(storageConfig.storageRootDir);

  let blockchainService: BlockchainService;
  try {
    blockchainService = EthersBlockchainService.fromConfig();
  } catch {
    blockchainService = {
      anchorDocument: async () => {
        throw new BlockchainUnavailableError('Blockchain provider or contract address is not configured.');
      },
      verifyAnchor: () => false,
      getAnchor: async () => {
        throw new BlockchainUnavailableError('Not configured');
      },
    };
  }

  return new DocumentSealingService(
    docRepo,
    storageService,
    encryptionService,
    auditService,
    blockchainService
  );
}

function createDefaultVerificationService(): DocumentVerificationService {
  const prisma = getPrismaClient();
  const docRepo = new PrismaDocumentRepository(prisma);
  const encConfig = loadEncryptionConfig();
  const encryptionService = new AesGcmEncryptionService(encConfig.key, encConfig.keyVersion);
  const storageConfig = loadStorageConfig();
  const storageService = new LocalEncryptedStorage(storageConfig.storageRootDir);

  let blockchainService: BlockchainService;
  try {
    blockchainService = EthersBlockchainService.fromConfig();
  } catch {
    blockchainService = {
      anchorDocument: async () => {
        throw new BlockchainUnavailableError('Blockchain provider or contract address is not configured.');
      },
      verifyAnchor: () => false,
      getAnchor: async () => {
        throw new BlockchainUnavailableError('Not configured');
      },
    };
  }

  return new DocumentVerificationService(
    docRepo,
    storageService,
    encryptionService,
    blockchainService
  );
}

export class DocumentController {
  private prisma = getPrismaClient();

  constructor(
    private docRepo: PrismaDocumentRepository = new PrismaDocumentRepository(getPrismaClient()),
    private caseRepo: CaseRepository = new PrismaCaseRepository(),
    private auditRepo: PrismaAuditRepository = new PrismaAuditRepository(getPrismaClient()),
    private uploadService: DocumentUploadService = new DocumentUploadService(),
    private sealingService: DocumentSealingService = createDefaultSealingService(),
    private verificationService: DocumentVerificationService = createDefaultVerificationService(),
    private storageService: StorageService = createDefaultStorageService(),
    private encryptionService: EncryptionService = createDefaultEncryptionService()
  ) {}

  /**
   * POST /api/documents/:id/seal
   *
   * Seals an existing DRAFT document, renders it immutable, computes authoritative SHA-256,
   * logs DOCUMENT_SEALED into the audit hash chain, and anchors the cryptographic proof on-chain.
   */
  public seal = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required.',
          },
        });
        return;
      }

      const rawId = req.params.id;
      const id = typeof rawId === 'string' ? rawId : Array.isArray(rawId) ? rawId[0] : '';
      if (!id) {
        throw new DocumentNotFoundError('unknown');
      }

      // 1. Resolve document's parent caseId
      const caseId = await this.docRepo.getCaseIdForDocument(id);
      if (!caseId) {
        // Missing document or orphaned document follows anti-enumeration policy
        throw new DocumentNotFoundError(id);
      }

      // 2. Authorize caller against the parent case
      const isAuthorized = await CaseAuthorizationService.canAccessCase(
        req.user,
        caseId,
        this.caseRepo
      );

      if (!isAuthorized) {
        // Anti-enumeration policy: return 404 Not Found rather than leaking existence
        throw new DocumentNotFoundError(id);
      }

      // 3. Invoke M2-06 DocumentSealingService using authoritative caller ID from req.user.id
      const result = await this.sealingService.sealDocument(id, req.user.id);

      // 4. Return safe response matching M2-06 DocumentSealingResult without exposing storageKey
      const safeVersion = {
        id: result.version.id,
        documentId: result.version.documentId,
        versionNumber: result.version.versionNumber,
        status: result.version.status,
        sha256Hash: result.version.sha256Hash,
        sealedAt: result.version.sealedAt,
        sealedBy: result.version.sealedBy,
        createdBy: result.version.createdBy,
        createdAt: result.version.createdAt,
        blockchainStatus: result.version.blockchainStatus,
        blockchainTxHash: result.version.blockchainTxHash,
      };

      res.status(200).json({
        version: safeVersion,
        blockchain: result.blockchain,
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/cases/:caseId/documents
   *
   * Multipart file upload endpoint.
   * Securely ingests, hashes, encrypts, and stores document metadata under an authorized case matter.
   */
  public upload = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required.',
          },
        });
        return;
      }

      const rawCaseId = req.params.caseId;
      const caseId = typeof rawCaseId === 'string' ? rawCaseId : Array.isArray(rawCaseId) ? rawCaseId[0] : '';
      if (!caseId) {
        throw new CaseNotFoundError('unknown');
      }

      const body = req.body || {};
      const metadata = {
        title: typeof body.title === 'string' ? body.title : undefined,
        documentType: typeof body.documentType === 'string' ? body.documentType : undefined,
        classification: typeof body.classification === 'string' ? body.classification : undefined,
        description: typeof body.description === 'string' ? body.description : undefined,
      };

      const document = await this.uploadService.uploadDocument(
        caseId,
        req.file,
        metadata,
        req.user
      );

      res.status(201).json(document);
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/cases/:caseId/documents
   *
   * Retrieves document metadata list belonging to an authorized case matter.
   */
  public listByCase = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required.',
          },
        });
        return;
      }

      const rawCaseId = req.params.caseId;
      const caseId = typeof rawCaseId === 'string' ? rawCaseId : Array.isArray(rawCaseId) ? rawCaseId[0] : '';
      if (!caseId) {
        throw new CaseNotFoundError('unknown');
      }

      // 1. Authorize case access
      const isAuthorized = await CaseAuthorizationService.canAccessCase(
        req.user,
        caseId,
        this.caseRepo
      );

      if (!isAuthorized) {
        throw new CaseNotFoundError(caseId);
      }

      // 2. Verify case exists
      const caseRecord = await this.caseRepo.findById(caseId);
      if (!caseRecord) {
        throw new CaseNotFoundError(caseId);
      }

      // 3. Retrieve documents scoped strictly to authorized caseId
      const documents = await this.docRepo.findByCaseId(caseId);

      res.status(200).json(documents);
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/documents/:id
   *
   * Retrieves safe metadata for a specific document.
   * Inherits authorization boundary from parent case.
   */
  public getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required.',
          },
        });
        return;
      }

      const rawId = req.params.id;
      const id = typeof rawId === 'string' ? rawId : Array.isArray(rawId) ? rawId[0] : '';
      if (!id) {
        throw new DocumentNotFoundError('unknown');
      }

      // 1. Resolve parent caseId
      const caseId = await this.docRepo.getCaseIdForDocument(id);
      if (!caseId) {
        // Document missing or orphaned without a case cannot be authorized
        throw new DocumentNotFoundError(id);
      }

      // 2. Authorize via parent case membership / ADMIN override
      const isAuthorized = await CaseAuthorizationService.canAccessCase(
        req.user,
        caseId,
        this.caseRepo
      );

      if (!isAuthorized) {
        // Anti-enumeration policy: 404 Not Found
        throw new DocumentNotFoundError(id);
      }

      // 3. Retrieve metadata
      const documentDetail = await this.docRepo.findDocumentDetail(id);
      if (!documentDetail) {
        throw new DocumentNotFoundError(id);
      }

      res.status(200).json(documentDetail);
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/documents/:id/versions
   *
   * Retrieves chronological version lineage for a document.
   */
  public getVersions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required.',
          },
        });
        return;
      }

      const rawId = req.params.id;
      const id = typeof rawId === 'string' ? rawId : Array.isArray(rawId) ? rawId[0] : '';
      if (!id) {
        throw new DocumentNotFoundError('unknown');
      }

      // 1. Resolve parent caseId
      const caseId = await this.docRepo.getCaseIdForDocument(id);
      if (!caseId) {
        throw new DocumentNotFoundError(id);
      }

      // 2. Authorize via parent case
      const isAuthorized = await CaseAuthorizationService.canAccessCase(
        req.user,
        caseId,
        this.caseRepo
      );

      if (!isAuthorized) {
        throw new DocumentNotFoundError(id);
      }

      // 3. Retrieve version records
      const versions = await this.docRepo.findVersionsByDocumentId(id);

      res.status(200).json(versions);
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/documents/:id/audit
   *
   * Retrieves immutable audit trail events for a document.
   */
  public getAudit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required.',
          },
        });
        return;
      }

      const rawId = req.params.id;
      const id = typeof rawId === 'string' ? rawId : Array.isArray(rawId) ? rawId[0] : '';
      if (!id) {
        throw new DocumentNotFoundError('unknown');
      }

      // 1. Resolve parent caseId
      const caseId = await this.docRepo.getCaseIdForDocument(id);
      if (!caseId) {
        throw new DocumentNotFoundError(id);
      }

      // 2. Authorize via parent case
      const isAuthorized = await CaseAuthorizationService.canAccessCase(
        req.user,
        caseId,
        this.caseRepo
      );

      if (!isAuthorized) {
        throw new DocumentNotFoundError(id);
      }

      // 3. Read audit events
      const events = await this.auditRepo.listByDocument(id);

      // Resolve actor names
      const actorIds = [...new Set(events.map((e) => e.actorId))];
      const users = await this.prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, name: true },
      });
      const userMap = new Map(users.map((u) => [u.id, u.name]));

      const formattedEvents = events.map((e) => ({
        id: e.id,
        action: e.eventType,
        actor: {
          id: e.actorId,
          name: userMap.get(e.actorId) || e.actorId,
        },
        timestamp: e.timestamp,
        details:
          e.metadata && typeof e.metadata === 'object' && 'details' in e.metadata
            ? String((e.metadata as Record<string, unknown>).details)
            : undefined,
      }));

      res.status(200).json({ events: formattedEvents });
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/documents/:id/verify
   *
   * Cryptographically verifies whether a stored document matches its trusted sealed
   * hash and blockchain anchor proof.
   */
  public verify = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required.',
          },
        });
        return;
      }

      const rawId = req.params.id;
      const id = typeof rawId === 'string' ? rawId : Array.isArray(rawId) ? rawId[0] : '';
      if (!id) {
        throw new DocumentNotFoundError('unknown');
      }

      // 1. Resolve document's parent caseId
      const caseId = await this.docRepo.getCaseIdForDocument(id);
      if (!caseId) {
        throw new DocumentNotFoundError(id);
      }

      // 2. Authorize caller against parent case (anti-enumeration 404 policy)
      const isAuthorized = await CaseAuthorizationService.canAccessCase(
        req.user,
        caseId,
        this.caseRepo
      );

      if (!isAuthorized) {
        throw new DocumentNotFoundError(id);
      }

      // 3. Delegate to DocumentVerificationService
      const result = await this.verificationService.verifyDocument(id);

      // 4. Return safe 200 OK VerificationResult
      res.status(200).json(result);
    } catch (err: unknown) {
      if (err instanceof DocumentNotFoundError) {
        res.status(404).json({
          error: {
            code: err.code,
            message: err.message,
          },
        });
        return;
      }

      if (err instanceof DocumentNotSealedError) {
        res.status(409).json({
          error: {
            code: err.code,
            message: err.message,
          },
        });
        return;
      }

      next(err);
    }
  };

  /**
   * GET /api/documents/:id/download
   *
   * Securely streams decrypted document content bytes for viewing or download.
   * Enforces JWT authentication, case-level membership authorization,
   * anti-enumeration 404 policies, in-memory AES-GCM decryption,
   * safe header sanitization, and strict secret protection.
   */
  public download = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required.',
          },
        });
        return;
      }

      const rawId = req.params.id;
      const id = typeof rawId === 'string' ? rawId : Array.isArray(rawId) ? rawId[0] : '';
      if (!id) {
        throw new DocumentNotFoundError('unknown');
      }

      // 1. Resolve document's parent caseId
      const caseId = await this.docRepo.getCaseIdForDocument(id);
      if (!caseId) {
        throw new DocumentNotFoundError(id);
      }

      // 2. Authorize caller against parent case (anti-enumeration 404 policy)
      const isAuthorized = await CaseAuthorizationService.canAccessCase(
        req.user,
        caseId,
        this.caseRepo
      );

      if (!isAuthorized) {
        throw new DocumentNotFoundError(id);
      }

      // 3. Resolve latest document version to get storageKey
      const versionRecord = await this.docRepo.findById(id);
      if (!versionRecord || !versionRecord.storageKey) {
        throw new DocumentNotFoundError(id);
      }

      // 4. Resolve document metadata for filename and MIME type
      const documentDetail = await this.docRepo.findDocumentDetail(id);
      const mimeType = documentDetail?.mimeType || 'application/octet-stream';
      const rawFilename = documentDetail?.name || `${id}.bin`;
      const safeFilename = sanitizeFilename(rawFilename);

      // 5. Read encrypted artifact through LocalEncryptedStorage
      let encryptedBuffer: Buffer;
      try {
        encryptedBuffer = await this.storageService.get(versionRecord.storageKey);
      } catch {
        // Safe error: Never expose storageKey, filesystem path, or stack trace
        res.status(500).json({
          error: {
            code: 'STORAGE_ARTIFACT_NOT_FOUND',
            message: 'Stored document artifact could not be retrieved from secure vault storage.',
          },
        });
        return;
      }

      // 6. Deserialize payload and decrypt ciphertext in memory using AES-256-GCM
      let decryptedBytes: Buffer;
      try {
        const payload = deserializeEncryptedPayload(encryptedBuffer);
        decryptedBytes = await this.encryptionService.decrypt(payload);
      } catch {
        // Safe error: Never leak IV, auth tag, key, or internal details
        res.status(422).json({
          error: {
            code: 'DECRYPTION_FAILED',
            message: 'Failed to decrypt document artifact: payload integrity check failed.',
          },
        });
        return;
      }

      // 7. Determine Content-Disposition (inline for preview, attachment for download)
      const dispositionParam = typeof req.query.disposition === 'string'
        ? req.query.disposition.toLowerCase().trim()
        : '';
      const dispositionType = dispositionParam === 'attachment' ? 'attachment' : 'inline';
      const contentDisposition = `${dispositionType}; filename="${safeFilename}"`;

      // 8. Set response headers and send original plaintext bytes
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', contentDisposition);
      res.setHeader('Content-Length', decryptedBytes.length.toString());
      res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');

      res.status(200).send(decryptedBytes);
    } catch (err: unknown) {
      if (err instanceof DocumentNotFoundError) {
        res.status(404).json({
          error: {
            code: err.code,
            message: err.message,
          },
        });
        return;
      }

      next(err);
    }
  };
}
