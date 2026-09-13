import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../app.js';
import { initializeEnvironment } from '../config/encryption.config.js';
import { getPrismaClient } from '../database/prisma.client.js';
import { PrismaUserRepository } from '../database/prisma-user.repository.js';
import { PrismaAuditRepository } from '../database/prisma-audit.repository.js';
import { PasswordService } from '../services/password.service.js';
import { TokenService } from '../services/token.service.js';

describe('Document Read APIs & Case Authorization (M3-05A)', () => {
  let server: Server;
  let baseUrl: string;
  const prisma = getPrismaClient();
  const userRepo = new PrismaUserRepository();
  const auditRepo = new PrismaAuditRepository(getPrismaClient());

  const testSuffix = Date.now();

  let memberUserId: string;
  let nonMemberUserId: string;
  let adminUserId: string;

  let memberToken: string;
  let nonMemberToken: string;
  let adminToken: string;

  let caseAId: string;
  let caseBId: string;

  const docInCaseA = `doc_case_a_${testSuffix}`;
  const docInCaseB = `doc_case_b_${testSuffix}`;
  const docOrphaned = `doc_orphaned_${testSuffix}`;

  before(async () => {
    initializeEnvironment();

    const app = createApp({ enableLogging: false });
    server = createServer(app);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });

    const pwdHash = await PasswordService.hashPassword('DocTestPass@123');

    // 1. Create test users
    const uMember = await userRepo.create({
      email: `doc-member-${testSuffix}@nyayavault.local`,
      name: 'Case A Lead Inspector',
      passwordHash: pwdHash,
      role: 'INSPECTOR',
    });
    memberUserId = uMember.id;
    memberToken = TokenService.generateToken({
      sub: uMember.id,
      email: uMember.email,
      role: 'INSPECTOR',
      name: uMember.name,
    });

    const uNonMember = await userRepo.create({
      email: `doc-nonmember-${testSuffix}@nyayavault.local`,
      name: 'Case B Separate Inspector',
      passwordHash: pwdHash,
      role: 'INSPECTOR',
    });
    nonMemberUserId = uNonMember.id;
    nonMemberToken = TokenService.generateToken({
      sub: uNonMember.id,
      email: uNonMember.email,
      role: 'INSPECTOR',
      name: uNonMember.name,
    });

    const uAdmin = await userRepo.create({
      email: `doc-admin-${testSuffix}@nyayavault.local`,
      name: 'Document Test Admin',
      passwordHash: pwdHash,
      role: 'ADMIN',
    });
    adminUserId = uAdmin.id;
    adminToken = TokenService.generateToken({
      sub: uAdmin.id,
      email: uAdmin.email,
      role: 'ADMIN',
      name: uAdmin.name,
    });

    // 2. Create Case A and Case B
    const caseA = await prisma.case.create({
      data: {
        caseNumber: `CASE-${testSuffix}-A`,
        firNumber: `FIR/${testSuffix}/A`,
        title: 'Forensic Ballistics Matter A',
        classification: 'HIGHLY_RESTRICTED',
        status: 'ACTIVE',
        createdBy: memberUserId,
        members: {
          create: {
            userId: memberUserId,
            role: 'LEAD',
          },
        },
      },
    });
    caseAId = caseA.id;

    const caseB = await prisma.case.create({
      data: {
        caseNumber: `CASE-${testSuffix}-B`,
        firNumber: `FIR/${testSuffix}/B`,
        title: 'Cyber Intrusion Matter B',
        classification: 'CONFIDENTIAL',
        status: 'ACTIVE',
        createdBy: nonMemberUserId,
        members: {
          create: {
            userId: nonMemberUserId,
            role: 'LEAD',
          },
        },
      },
    });
    caseBId = caseB.id;

    // 3. Seed documents in Case A
    await prisma.document.create({
      data: {
        id: docInCaseA,
        caseId: caseAId,
        title: 'Ballistics_Analysis_Report.pdf',
        versions: {
          create: [
            {
              id: `${docInCaseA}_v1`,
              versionNumber: 1,
              storageKey: `documents/${docInCaseA}/v1/payload.enc`,
              sha256Hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
              status: 'DRAFT',
              createdBy: memberUserId,
            },
            {
              id: `${docInCaseA}_v2`,
              versionNumber: 2,
              storageKey: `documents/${docInCaseA}/v2/payload.enc`,
              sha256Hash: 'a81f92c10b7454839de848a91316b23d06e300183b102ef70d249f05f7ff72a1',
              status: 'SEALED',
              sealedAt: new Date(),
              sealedBy: memberUserId,
              createdBy: memberUserId,
              blockchainStatus: 'ANCHORED',
              blockchainTxHash: '0x82ab692e847c1b0179d639b98ec349a888c3a1005b8cfbf4df629c4883d690a2',
            },
          ],
        },
      },
    });

    // Seed audit events for docInCaseA
    await auditRepo.append({
      id: `aud_${testSuffix}_1`,
      eventType: 'DOCUMENT_UPLOADED',
      actorId: memberUserId,
      documentId: docInCaseA,
      versionId: `${docInCaseA}_v1`,
      timestamp: new Date().toISOString(),
      previousEventHash: null,
      eventHash: 'b81f92c10b7454839de848a91316b23d06e300183b102ef70d249f05f7ff72a1',
      metadata: { details: 'Original draft uploaded' },
    });

    await auditRepo.append({
      id: `aud_${testSuffix}_2`,
      eventType: 'DOCUMENT_SEALED',
      actorId: memberUserId,
      documentId: docInCaseA,
      versionId: `${docInCaseA}_v2`,
      timestamp: new Date().toISOString(),
      previousEventHash: 'b81f92c10b7454839de848a91316b23d06e300183b102ef70d249f05f7ff72a1',
      eventHash: 'c81f92c10b7454839de848a91316b23d06e300183b102ef70d249f05f7ff72a1',
      metadata: { details: 'Evidence sealed and anchored to blockchain' },
    });

    // 4. Seed document in Case B
    await prisma.document.create({
      data: {
        id: docInCaseB,
        caseId: caseBId,
        title: 'Intrusion_Logs.pdf',
        versions: {
          create: {
            id: `${docInCaseB}_v1`,
            versionNumber: 1,
            storageKey: `documents/${docInCaseB}/v1/payload.enc`,
            sha256Hash: 'd81f92c10b7454839de848a91316b23d06e300183b102ef70d249f05f7ff72a1',
            status: 'SEALED',
            createdBy: nonMemberUserId,
          },
        },
      },
    });

    // 5. Seed orphaned document (no caseId)
    await prisma.document.create({
      data: {
        id: docOrphaned,
        caseId: null,
        title: 'Unassigned_Draft.pdf',
        versions: {
          create: {
            id: `${docOrphaned}_v1`,
            versionNumber: 1,
            storageKey: `documents/${docOrphaned}/v1/payload.enc`,
            status: 'DRAFT',
            createdBy: memberUserId,
          },
        },
      },
    });
  });

  after(async () => {
    // Clean up test documents & versions & audit events
    await prisma.auditEvent.deleteMany({
      where: { documentId: { in: [docInCaseA, docInCaseB, docOrphaned] } },
    });
    await prisma.documentVersion.deleteMany({
      where: { documentId: { in: [docInCaseA, docInCaseB, docOrphaned] } },
    });
    await prisma.document.deleteMany({
      where: { id: { in: [docInCaseA, docInCaseB, docOrphaned] } },
    });

    // Clean up cases and members
    await prisma.caseMember.deleteMany({
      where: { caseId: { in: [caseAId, caseBId] } },
    });
    await prisma.case.deleteMany({
      where: { id: { in: [caseAId, caseBId] } },
    });

    // Clean up users
    await prisma.user.deleteMany({
      where: { id: { in: [memberUserId, nonMemberUserId, adminUserId] } },
    });

    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  // ========================================================
  // 1. Case Document Listing (GET /api/cases/:caseId/documents)
  // ========================================================
  describe('Case Document Listing (GET /api/cases/:caseId/documents)', () => {
    it('1. authenticated case member can list that cases documents', async () => {
      const res = await fetch(`${baseUrl}/api/cases/${caseAId}/documents`, {
        headers: { Authorization: `Bearer ${memberToken}` },
      });

      assert.equal(res.status, 200);
      const docs = await res.json() as { id: string; name: string; status: string; sha256: string }[];
      assert.ok(Array.isArray(docs));
      const found = docs.find((d) => d.id === docInCaseA);
      assert.ok(found, 'Document must be present in case document listing');
      assert.equal(found.name, 'Ballistics_Analysis_Report.pdf');
      assert.equal(found.status, 'SEALED');
      assert.equal(found.sha256, 'a81f92c10b7454839de848a91316b23d06e300183b102ef70d249f05f7ff72a1');
    });

    it('2. non-member receives no protected documents (404 policy)', async () => {
      // Non-member (Case B inspector) requests Case A documents
      const res = await fetch(`${baseUrl}/api/cases/${caseAId}/documents`, {
        headers: { Authorization: `Bearer ${nonMemberToken}` },
      });

      assert.equal(res.status, 404, 'Unauthorized case document query must return 404');
      const data = await res.json() as { error: { code: string } };
      assert.equal(data.error.code, 'CASE_NOT_FOUND');
    });

    it('3. ADMIN can list documents for an accessible case via global override', async () => {
      const res = await fetch(`${baseUrl}/api/cases/${caseAId}/documents`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      assert.equal(res.status, 200);
      const docs = await res.json() as { id: string }[];
      const found = docs.some((d) => d.id === docInCaseA);
      assert.equal(found, true, 'Admin must see case documents via override');
    });
  });

  // ========================================================
  // 2. Document Detail (GET /api/documents/:id)
  // ========================================================
  describe('Document Detail (GET /api/documents/:id)', () => {
    it('4. authorized member can retrieve document detail', async () => {
      const res = await fetch(`${baseUrl}/api/documents/${docInCaseA}`, {
        headers: { Authorization: `Bearer ${memberToken}` },
      });

      assert.equal(res.status, 200);
      const doc = await res.json() as {
        id: string;
        name: string;
        caseId: string;
        version: number;
        status: string;
        blockchainStatus: string;
        blockchainTxId: string;
        sha256: string;
        classification: string;
      };

      assert.equal(doc.id, docInCaseA);
      assert.equal(doc.caseId, caseAId);
      assert.equal(doc.version, 2, 'Latest version (v2) must be represented');
      assert.equal(doc.status, 'SEALED');
      assert.equal(doc.blockchainStatus, 'ANCHORED');
      assert.ok(doc.blockchainTxId.startsWith('0x82ab'));
      assert.equal(doc.classification, 'HIGHLY_RESTRICTED');
    });

    it('5. non-member cannot retrieve foreign document (receives 404 anti-enumeration)', async () => {
      const res = await fetch(`${baseUrl}/api/documents/${docInCaseA}`, {
        headers: { Authorization: `Bearer ${nonMemberToken}` },
      });

      assert.equal(res.status, 404);
      const data = await res.json() as { error: { code: string } };
      assert.equal(data.error.code, 'DOCUMENT_NOT_FOUND');
    });

    it('6. unauthorized document detail follows 404 anti-enumeration policy', async () => {
      // Querying an unknown document vs an unauthorized document returns identical 404
      const resRealUnauthorized = await fetch(`${baseUrl}/api/documents/${docInCaseA}`, {
        headers: { Authorization: `Bearer ${nonMemberToken}` },
      });
      const resFake = await fetch(`${baseUrl}/api/documents/non_existent_doc_999`, {
        headers: { Authorization: `Bearer ${nonMemberToken}` },
      });

      assert.equal(resRealUnauthorized.status, 404);
      assert.equal(resFake.status, 404);
      const data1 = await resRealUnauthorized.json() as { error: { code: string } };
      const data2 = await resFake.json() as { error: { code: string } };
      assert.equal(data1.error.code, data2.error.code);
    });

    it('7. unauthenticated document request returns 401', async () => {
      const res = await fetch(`${baseUrl}/api/documents/${docInCaseA}`);
      assert.equal(res.status, 401);
      const data = await res.json() as { error: { code: string } };
      assert.equal(data.error.code, 'UNAUTHORIZED');
    });

    it('8. changing the caseId in the URL cannot bypass authorization', async () => {
      // Non-member points to their own caseB in the URL, but requests docInCaseA
      // The case document list endpoint queries where caseId === caseBId, so docInCaseA is never returned
      const res = await fetch(`${baseUrl}/api/cases/${caseBId}/documents`, {
        headers: { Authorization: `Bearer ${nonMemberToken}` },
      });

      assert.equal(res.status, 200);
      const docs = await res.json() as { id: string }[];
      const leaked = docs.some((d) => d.id === docInCaseA);
      assert.equal(leaked, false, 'Document from Case A must not leak in Case B list');
    });

    it('9. changing document ID cannot bypass authorization', async () => {
      // Trying various document IDs without membership in parent case
      const res = await fetch(`${baseUrl}/api/documents/${docInCaseB}`, {
        headers: { Authorization: `Bearer ${memberToken}` }, // member of A, not B
      });

      assert.equal(res.status, 404);
    });

    it('10. document response does not expose encryption/storage secrets', async () => {
      const res = await fetch(`${baseUrl}/api/documents/${docInCaseA}`, {
        headers: { Authorization: `Bearer ${memberToken}` },
      });

      assert.equal(res.status, 200);
      const rawText = await res.text();

      // Must not contain sensitive secrets
      assert.equal(rawText.includes('storageKey'), false, 'storageKey must not be exposed');
      assert.equal(rawText.includes('.enc'), false, 'filesystem paths must not be exposed');
      assert.equal(rawText.includes('DOCUMENT_ENCRYPTION_KEY'), false);
      assert.equal(rawText.includes('JWT_SECRET'), false);
      assert.equal(rawText.includes('passwordHash'), false);
    });
  });

  // ========================================================
  // 3. Document Versions (GET /api/documents/:id/versions)
  // ========================================================
  describe('Document Versions (GET /api/documents/:id/versions)', () => {
    it('11. versions are accessible only through authorized case access', async () => {
      // Member can view version history
      const memberRes = await fetch(`${baseUrl}/api/documents/${docInCaseA}/versions`, {
        headers: { Authorization: `Bearer ${memberToken}` },
      });

      assert.equal(memberRes.status, 200);
      const versions = await memberRes.json() as {
        version: number;
        status: string;
        isCurrent: boolean;
        sha256: string;
        blockchainTxId?: string;
      }[];

      assert.equal(versions.length, 2);
      assert.equal(versions[0].version, 1);
      assert.equal(versions[0].status, 'DRAFT');
      assert.equal(versions[0].isCurrent, false);

      assert.equal(versions[1].version, 2);
      assert.equal(versions[1].status, 'SEALED');
      assert.equal(versions[1].isCurrent, true);
      assert.ok(versions[1].blockchainTxId);

      // Non-member receives 404
      const nonMemberRes = await fetch(`${baseUrl}/api/documents/${docInCaseA}/versions`, {
        headers: { Authorization: `Bearer ${nonMemberToken}` },
      });
      assert.equal(nonMemberRes.status, 404);
    });
  });

  // ========================================================
  // 4. Document Audit Trail (GET /api/documents/:id/audit)
  // ========================================================
  describe('Document Audit Trail (GET /api/documents/:id/audit)', () => {
    it('12. audit is accessible only through authorized case access', async () => {
      // Member can view audit trail
      const memberRes = await fetch(`${baseUrl}/api/documents/${docInCaseA}/audit`, {
        headers: { Authorization: `Bearer ${memberToken}` },
      });

      assert.equal(memberRes.status, 200);
      const data = await memberRes.json() as {
        events: { id: string; action: string; actor: { id: string; name: string }; timestamp: string }[];
      };

      assert.ok(Array.isArray(data.events));
      assert.equal(data.events.length, 2);
      assert.equal(data.events[0].action, 'DOCUMENT_UPLOADED');
      assert.equal(data.events[1].action, 'DOCUMENT_SEALED');
      assert.equal(data.events[0].actor.id, memberUserId);

      // Non-member receives 404
      const nonMemberRes = await fetch(`${baseUrl}/api/documents/${docInCaseA}/audit`, {
        headers: { Authorization: `Bearer ${nonMemberToken}` },
      });
      assert.equal(nonMemberRes.status, 404);
    });
  });

  // ========================================================
  // 5. Blockchain Metadata & Orphaned Documents
  // ========================================================
  describe('Blockchain Metadata & Orphaned Documents', () => {
    it('13. blockchain metadata embedded in document response is accessible only through authorized case access', async () => {
      // Authorized member sees blockchain status and txId
      const res = await fetch(`${baseUrl}/api/documents/${docInCaseA}`, {
        headers: { Authorization: `Bearer ${memberToken}` },
      });
      assert.equal(res.status, 200);
      const doc = await res.json() as { blockchainStatus: string; blockchainTxId: string };
      assert.equal(doc.blockchainStatus, 'ANCHORED');
      assert.ok(doc.blockchainTxId.startsWith('0x82ab'));

      // Non-member is blocked (404)
      const blockedRes = await fetch(`${baseUrl}/api/documents/${docInCaseA}`, {
        headers: { Authorization: `Bearer ${nonMemberToken}` },
      });
      assert.equal(blockedRes.status, 404);
    });

    it('14. orphaned documents without a caseId cannot be accessed by non-admin users', async () => {
      const res = await fetch(`${baseUrl}/api/documents/${docOrphaned}`, {
        headers: { Authorization: `Bearer ${memberToken}` },
      });

      assert.equal(res.status, 404, 'Documents without caseId must be rejected with 404');
    });
  });
});
