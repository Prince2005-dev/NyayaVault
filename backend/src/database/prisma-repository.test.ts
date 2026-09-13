import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { initializeEnvironment } from '../config/encryption.config.js';
import { PrismaDocumentRepository } from './prisma-document.repository.js';
import { PrismaAuditRepository } from './prisma-audit.repository.js';
import type { DocumentVersionRecord } from '../sealing/sealing.types.js';
import type { AuditEvent } from '../audit/audit.types.js';

describe('Prisma Repositories: PostgreSQL Persistence (M3-02)', () => {
  let prisma: PrismaClient;
  let docRepo: PrismaDocumentRepository;
  let auditRepo: PrismaAuditRepository;

  before(async () => {
    initializeEnvironment();
    prisma = new PrismaClient({
      log: ['error'],
    });

    // Verify live PostgreSQL connection
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    docRepo = new PrismaDocumentRepository(prisma);
    auditRepo = new PrismaAuditRepository(prisma);
  });

  after(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  // Architectural contract tests (always executed)
  describe('Repository Contract & Interface Validation', () => {
    it('should implement DocumentRepository contract methods without breaking abstractions', () => {
      const dummyClient = {} as PrismaClient;
      const repository = new PrismaDocumentRepository(dummyClient);
      assert.equal(typeof repository.findById, 'function');
      assert.equal(typeof repository.save, 'function');
      assert.equal(typeof repository.findByDocumentAndVersion, 'function');
    });

    it('should implement AuditRepository append-only contract without mutation methods', () => {
      const dummyClient = {} as PrismaClient;
      const repository = new PrismaAuditRepository(dummyClient);
      assert.equal(typeof repository.append, 'function');
      assert.equal(typeof repository.listByDocument, 'function');
      assert.equal(typeof repository.getLatest, 'function');

      // Crucial: strictly verify append-only immutability (no update or delete methods)
      assert.equal((repository as unknown as Record<string, unknown>).updateEvent, undefined);
      assert.equal((repository as unknown as Record<string, unknown>).deleteEvent, undefined);
      assert.equal((repository as unknown as Record<string, unknown>).removeEvent, undefined);
    });
  });

  // Live PostgreSQL tests (executed against real PostgreSQL)
  describe('Live PostgreSQL Persistence Integration', () => {
    it('should persist and retrieve document versions across lifecycle states on real PostgreSQL', async () => {
      const documentId = `doc_prisma_test_${Date.now()}`;
      const docV1: DocumentVersionRecord = {
        id: `ver_${documentId}_1`,
        documentId,
        versionNumber: 1,
        storageKey: `documents/${documentId}/v1/payload.enc`,
        status: 'DRAFT',
        createdBy: 'usr_investigator_1',
        createdAt: new Date().toISOString(),
      };

      // 1. Save initial DRAFT
      await docRepo.save(docV1);

      // 2. Find DRAFT
      const retrieved = await docRepo.findById(documentId);
      assert.ok(retrieved);
      assert.equal(retrieved.id, docV1.id);
      assert.equal(retrieved.status, 'DRAFT');
      assert.equal(retrieved.versionNumber, 1);

      // 3. Update to SEALED state
      const sealedAt = new Date().toISOString();
      const sha256 = '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824';
      const txHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

      retrieved.status = 'SEALED';
      retrieved.sha256Hash = sha256;
      retrieved.sealedAt = sealedAt;
      retrieved.sealedBy = 'usr_judge_singh';
      retrieved.blockchainStatus = 'ANCHORED';
      retrieved.blockchainTxHash = txHash;

      await docRepo.save(retrieved);

      // 4. Verify updated state persisted
      const sealedRetrieved = await docRepo.findById(documentId);
      assert.ok(sealedRetrieved);
      assert.equal(sealedRetrieved.status, 'SEALED');
      assert.equal(sealedRetrieved.sha256Hash, sha256);
      assert.equal(sealedRetrieved.blockchainStatus, 'ANCHORED');
      assert.equal(sealedRetrieved.blockchainTxHash, txHash);
      assert.equal(sealedRetrieved.sealedBy, 'usr_judge_singh');

      // 5. Multi-version support: append V2 for the same document
      const docV2: DocumentVersionRecord = {
        id: `ver_${documentId}_2`,
        documentId,
        versionNumber: 2,
        storageKey: `documents/${documentId}/v2/payload.enc`,
        status: 'DRAFT',
        createdBy: 'usr_investigator_1',
        createdAt: new Date().toISOString(),
      };
      await docRepo.save(docV2);

      // findById returns highest version
      const latest = await docRepo.findById(documentId);
      assert.ok(latest);
      assert.equal(latest.versionNumber, 2);

      // findByDocumentAndVersion returns specific version
      const v1 = await docRepo.findByDocumentAndVersion(documentId, 1);
      assert.ok(v1);
      assert.equal(v1.versionNumber, 1);
      assert.equal(v1.status, 'SEALED');

      // Cleanup
      await prisma.document.delete({ where: { id: documentId } });
    });

    it('should append, list, and retrieve hash-chained audit events on real PostgreSQL', async () => {
      const documentId = `doc_audit_test_${Date.now()}`;
      const versionId = `ver_${documentId}_1`;

      // 0. Ensure document draft version exists
      await docRepo.save({
        id: versionId,
        documentId,
        versionNumber: 1,
        storageKey: `documents/${documentId}/v1/payload.enc`,
        status: 'DRAFT',
        createdBy: 'usr_clerk_1',
        createdAt: new Date().toISOString(),
      });

      const genesisEvent: AuditEvent = {
        id: `aud_${Date.now()}_1`,
        eventType: 'DOCUMENT_UPLOADED',
        actorId: 'usr_clerk_1',
        documentId,
        versionId,
        timestamp: new Date().toISOString(),
        metadata: { filename: 'charge_sheet.pdf', size: 1048576 },
        previousEventHash: null,
        eventHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      };

      const secondEvent: AuditEvent = {
        id: `aud_${Date.now()}_2`,
        eventType: 'DOCUMENT_SEALED',
        actorId: 'usr_magistrate_1',
        documentId,
        versionId,
        timestamp: new Date(Date.now() + 1000).toISOString(),
        metadata: { sha256Hash: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824' },
        previousEventHash: genesisEvent.eventHash,
        eventHash: 'a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e',
      };

      // 1. Append genesis event
      await auditRepo.append(genesisEvent);

      // 2. Append second event
      await auditRepo.append(secondEvent);

      // 3. List events by document
      const list = await auditRepo.listByDocument(documentId);
      assert.equal(list.length, 2);
      assert.equal(list[0].id, genesisEvent.id);
      assert.equal(list[0].previousEventHash, null);
      assert.equal(list[1].id, secondEvent.id);
      assert.equal(list[1].previousEventHash, genesisEvent.eventHash);

      // 4. Retrieve latest event
      const latest = await auditRepo.getLatest(documentId);
      assert.ok(latest);
      assert.equal(latest.id, secondEvent.id);
      assert.equal(latest.eventHash, secondEvent.eventHash);

      // Cleanup
      await prisma.document.delete({ where: { id: documentId } });
    });
  });
});
