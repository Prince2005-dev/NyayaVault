import type { PrismaClient, DocumentVersion } from '@prisma/client';
import type {
  DocumentRepository,
  DocumentVersionRecord,
  DocumentStatus,
  BlockchainAnchorStatus,
} from '../sealing/sealing.types.js';

/**
 * Concrete PostgreSQL DocumentRepository implementation backed by Prisma ORM.
 *
 * Adheres strictly to the M2 DocumentRepository interface contract while providing
 * relational persistence, atomic multi-version support, and transactional safety.
 */
export interface DocumentItemRecord {
  id: string;
  caseId: string | null;
  name: string;
  documentType: string;
  version: number;
  mimeType: string;
  size: number;
  classification: string;
  status: string;
  integrityStatus: string;
  blockchainStatus: string;
  sha256: string;
  blockchainTxId: string;
  createdBy: {
    id: string;
    name: string;
  };
  createdAt: string;
  updatedAt?: string;
  description?: string;
}

export interface DocumentVersionResponse {
  id?: string;
  version: number;
  createdBy: {
    id: string;
    name: string;
  };
  createdAt: string;
  status: string;
  sha256: string;
  blockchainTxId?: string;
  isCurrent: boolean;
  size?: number;
  mimeType?: string;
  description?: string;
}

/**
 * Concrete PostgreSQL DocumentRepository implementation backed by Prisma ORM.
 *
 * Adheres strictly to the M2 DocumentRepository interface contract while providing
 * relational persistence, atomic multi-version support, and transactional safety.
 */
export class PrismaDocumentRepository implements DocumentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Retrieves the current (highest version) DocumentVersionRecord for a documentId.
   *
   * @param documentId - Unique logical document identifier.
   * @returns DocumentVersionRecord or null if not found.
   */
  public async findById(documentId: string): Promise<DocumentVersionRecord | null> {
    const version = await this.prisma.documentVersion.findFirst({
      where: { documentId },
      orderBy: { versionNumber: 'desc' },
    });

    if (!version) return null;
    return this.mapToRecord(version);
  }

  /**
   * Retrieves a specific version record for a documentId and versionNumber.
   *
   * @param documentId - Logical document identifier.
   * @param versionNumber - Version integer (>= 1).
   */
  public async findByDocumentAndVersion(
    documentId: string,
    versionNumber: number
  ): Promise<DocumentVersionRecord | null> {
    const version = await this.prisma.documentVersion.findUnique({
      where: {
        documentId_versionNumber: {
          documentId,
          versionNumber,
        },
      },
    });

    if (!version) return null;
    return this.mapToRecord(version);
  }

  /**
   * Resolves the parent caseId for a given documentId.
   *
   * @param documentId - Logical document identifier.
   * @returns parent caseId or null if document or case association does not exist.
   */
  public async getCaseIdForDocument(documentId: string): Promise<string | null> {
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: { caseId: true },
    });
    return doc?.caseId ?? null;
  }

  /**
   * Retrieves full document metadata including latest version information.
   */
  public async findDocumentDetail(documentId: string): Promise<DocumentItemRecord | null> {
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
        },
        case: {
          select: { classification: true },
        },
        auditEvents: {
          where: { eventType: 'DOCUMENT_UPLOADED' },
          take: 1,
        },
      },
    });

    if (!doc) return null;
    return this.mapToDocumentItem(doc);
  }

  /**
   * Retrieves all documents belonging to an authorized case.
   */
  public async findByCaseId(caseId: string): Promise<DocumentItemRecord[]> {
    const docs = await this.prisma.document.findMany({
      where: { caseId },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
        },
        case: {
          select: { classification: true },
        },
        auditEvents: {
          where: { eventType: 'DOCUMENT_UPLOADED' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const items: DocumentItemRecord[] = [];
    for (const doc of docs) {
      items.push(await this.mapToDocumentItem(doc));
    }
    return items;
  }

  /**
   * Atomically creates a new Document and its initial DocumentVersion (v1, DRAFT).
   */
  public async createDocumentWithInitialVersion(data: {
    documentId: string;
    caseId: string;
    title: string;
    versionId: string;
    storageKey: string;
    sha256Hash: string;
    createdBy: string;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.document.create({
        data: {
          id: data.documentId,
          caseId: data.caseId,
          title: data.title,
        },
      });

      await tx.documentVersion.create({
        data: {
          id: data.versionId,
          documentId: data.documentId,
          versionNumber: 1,
          storageKey: data.storageKey,
          sha256Hash: data.sha256Hash,
          status: 'DRAFT',
          blockchainStatus: 'NOT_ANCHORED',
          createdBy: data.createdBy,
        },
      });
    });
  }

  /**
   * Retrieves all chronological version records for a document.
   */
  public async findVersionsByDocumentId(documentId: string): Promise<DocumentVersionResponse[]> {
    const versions = await this.prisma.documentVersion.findMany({
      where: { documentId },
      orderBy: { versionNumber: 'asc' },
    });

    if (versions.length === 0) return [];

    const latestVersionNumber = versions[versions.length - 1].versionNumber;

    const userIds = [...new Set(versions.map((v) => v.createdBy))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u.name]));

    return versions.map((v) => ({
      id: v.id,
      version: v.versionNumber,
      createdBy: {
        id: v.createdBy,
        name: userMap.get(v.createdBy) || v.createdBy,
      },
      createdAt: v.createdAt.toISOString(),
      status: v.status,
      sha256: v.sha256Hash || '',
      blockchainTxId: v.blockchainTxHash || undefined,
      isCurrent: v.versionNumber === latestVersionNumber,
      size: 0,
      mimeType: 'application/pdf',
    }));
  }

  /**
   * Atomically saves or updates a DocumentVersionRecord.
   * Ensures parent Document record exists prior to version insertion.
   *
   * @param record - Domain DocumentVersionRecord to persist.
   */
  public async save(record: DocumentVersionRecord): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // 1. Ensure parent Document container exists
      await tx.document.upsert({
        where: { id: record.documentId },
        update: {},
        create: { id: record.documentId },
      });

      // 2. Upsert DocumentVersion record
      await tx.documentVersion.upsert({
        where: { id: record.id },
        update: {
          sha256Hash: record.sha256Hash ?? null,
          status: record.status,
          sealedAt: record.sealedAt ? new Date(record.sealedAt) : null,
          sealedBy: record.sealedBy ?? null,
          blockchainStatus: record.blockchainStatus ?? null,
          blockchainTxHash: record.blockchainTxHash ?? null,
        },
        create: {
          id: record.id,
          documentId: record.documentId,
          versionNumber: record.versionNumber,
          storageKey: record.storageKey,
          sha256Hash: record.sha256Hash ?? null,
          status: record.status,
          sealedAt: record.sealedAt ? new Date(record.sealedAt) : null,
          sealedBy: record.sealedBy ?? null,
          createdBy: record.createdBy,
          createdAt: record.createdAt ? new Date(record.createdAt) : new Date(),
          blockchainStatus: record.blockchainStatus ?? null,
          blockchainTxHash: record.blockchainTxHash ?? null,
        },
      });

      // 3. If anchored on-chain with a real transaction hash, persist to blockchain_anchors table
      if (record.blockchainStatus === 'ANCHORED' && record.blockchainTxHash && record.sha256Hash) {
        await tx.blockchainAnchor.upsert({
          where: {
            documentId_versionId: {
              documentId: record.documentId,
              versionId: record.versionNumber,
            },
          },
          update: {
            transactionId: record.blockchainTxHash,
            documentHash: record.sha256Hash,
            status: 'ANCHORED',
          },
          create: {
            documentId: record.documentId,
            versionId: record.versionNumber,
            documentVersionId: record.id,
            documentHash: record.sha256Hash,
            eventType: 'DOCUMENT_SEALED',
            actor: record.sealedBy || record.createdBy,
            transactionId: record.blockchainTxHash,
            status: 'ANCHORED',
          },
        });
      }
    });
  }

  /**
   * Maps database entity to domain DocumentVersionRecord.
   */
  private mapToRecord(entity: DocumentVersion): DocumentVersionRecord {
    return {
      id: entity.id,
      documentId: entity.documentId,
      versionNumber: entity.versionNumber,
      storageKey: entity.storageKey,
      sha256Hash: entity.sha256Hash ?? undefined,
      status: entity.status as DocumentStatus,
      sealedAt: entity.sealedAt ? entity.sealedAt.toISOString() : undefined,
      sealedBy: entity.sealedBy ?? undefined,
      createdBy: entity.createdBy,
      createdAt: entity.createdAt.toISOString(),
      blockchainStatus: (entity.blockchainStatus as BlockchainAnchorStatus) ?? undefined,
      blockchainTxHash: entity.blockchainTxHash ?? undefined,
    };
  }

  /**
   * Maps Prisma document record with latest version to DocumentItemRecord.
   */
  private async mapToDocumentItem(doc: {
    id: string;
    caseId: string | null;
    title: string | null;
    createdAt: Date;
    updatedAt: Date;
    versions: DocumentVersion[];
    case?: { classification: string } | null;
    auditEvents?: Array<{ metadata: unknown }>;
  }): Promise<DocumentItemRecord> {
    const latestVersion = doc.versions[0];
    let creatorName = latestVersion?.createdBy || 'System';

    if (latestVersion?.createdBy) {
      const user = await this.prisma.user.findUnique({
        where: { id: latestVersion.createdBy },
        select: { name: true },
      });
      if (user?.name) creatorName = user.name;
    }

    const uploadMeta = (doc.auditEvents?.[0]?.metadata as Record<string, unknown>) || null;
    const documentType = (uploadMeta?.documentType as string) || 'FORENSIC_REPORT';
    const mimeType = (uploadMeta?.mimeType as string) || 'application/pdf';
    const size = typeof uploadMeta?.fileSizeBytes === 'number' ? uploadMeta.fileSizeBytes : 0;
    const description = (uploadMeta?.description as string) || undefined;
    const displayName = doc.title || (uploadMeta?.fileName as string) || `${doc.id}.pdf`;

    return {
      id: doc.id,
      caseId: doc.caseId,
      name: displayName,
      documentType,
      version: latestVersion ? latestVersion.versionNumber : 1,
      mimeType,
      size,
      classification: doc.case?.classification || 'CONFIDENTIAL',
      status: latestVersion ? latestVersion.status : 'DRAFT',
      integrityStatus: latestVersion?.status === 'SEALED' ? 'VERIFIED' : 'PENDING',
      blockchainStatus: latestVersion?.blockchainStatus || 'NOT_ANCHORED',
      sha256: latestVersion?.sha256Hash || '',
      blockchainTxId: latestVersion?.blockchainTxHash || '',
      createdBy: {
        id: latestVersion ? latestVersion.createdBy : 'system',
        name: creatorName,
      },
      createdAt: latestVersion ? latestVersion.createdAt.toISOString() : doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
      description,
    };
  }
}

