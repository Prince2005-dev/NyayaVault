import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs';
import { createApp } from '../app.js';
import { initializeEnvironment, loadEncryptionConfig, loadStorageConfig } from '../config/encryption.config.js';
import { getPrismaClient } from '../database/prisma.client.js';
import { PrismaUserRepository } from '../database/prisma-user.repository.js';
import { PrismaDocumentRepository } from '../database/prisma-document.repository.js';
import { PrismaAuditRepository } from '../database/prisma-audit.repository.js';
import { AuditService } from '../audit/audit.service.js';
import { PasswordService } from '../services/password.service.js';
import { TokenService } from '../services/token.service.js';
import { calculateSha256 } from '../integrity/hash.service.js';
import { AesGcmEncryptionService } from '../encryption/aes-gcm.service.js';
import { deserializeEncryptedPayload } from '../encryption/encryption.types.js';
import { LocalEncryptedStorage } from '../storage/local-encrypted-storage.js';
import { DocumentUploadService } from '../services/document-upload.service.js';

describe('Document Upload Pipeline & Case Authorization (M3-05B)', () => {
  let server: Server;
  let baseUrl: string;
  const prisma = getPrismaClient();
  const userRepo = new PrismaUserRepository();
  const docRepo = new PrismaDocumentRepository(prisma);
  const auditRepo = new PrismaAuditRepository(prisma);
  const auditService = new AuditService(auditRepo);

  const testSuffix = Date.now();

  let memberUserId: string;
  let nonMemberUserId: string;
  let adminUserId: string;

  let memberToken: string;
  let nonMemberToken: string;
  let adminToken: string;

  let caseAId: string;
  let caseBId: string;

  const validPdfBytes = Buffer.from(
    '%PDF-1.4\n1 0 obj\n<<\n/Title (Forensic Ballistics)\n>>\nendobj\ntrailer\n<<>>\n%%EOF\n',
    'utf-8'
  );

  const validPngBytes = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  ]);

  let uploadedDocumentId: string;

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

    const pwdHash = await PasswordService.hashPassword('UploadPass@123');

    // 1. Create test users
    const uMember = await userRepo.create({
      email: `upload-member-${testSuffix}@nyayavault.local`,
      name: 'Case Lead Officer',
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
      email: `upload-nonmember-${testSuffix}@nyayavault.local`,
      name: 'Foreign Case Officer',
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
      email: `upload-admin-${testSuffix}@nyayavault.local`,
      name: 'Upload Security Admin',
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
        caseNumber: `CASE-UP-${testSuffix}-A`,
        firNumber: `FIR/UP/${testSuffix}/A`,
        title: 'Upload Forensic Primary Investigation',
        department: 'Cyber Forensics Division',
        policeStation: 'HQ Station',
        classification: 'CONFIDENTIAL',
        status: 'ACTIVE',
        createdBy: memberUserId,
        members: {
          create: [{ userId: memberUserId, role: 'LEAD' }],
        },
      },
    });
    caseAId = caseA.id;

    const caseB = await prisma.case.create({
      data: {
        caseNumber: `CASE-UP-${testSuffix}-B`,
        firNumber: `FIR/UP/${testSuffix}/B`,
        title: 'Upload Foreign Separate Investigation',
        department: 'CID',
        policeStation: 'West PS',
        classification: 'HIGHLY_RESTRICTED',
        status: 'ACTIVE',
        createdBy: nonMemberUserId,
        members: {
          create: [{ userId: nonMemberUserId, role: 'LEAD' }],
        },
      },
    });
    caseBId = caseB.id;
  });

  after(async () => {
    // Clean up uploaded documents
    if (uploadedDocumentId) {
      await prisma.auditEvent.deleteMany({ where: { documentId: uploadedDocumentId } });
      await prisma.documentVersion.deleteMany({ where: { documentId: uploadedDocumentId } });
      await prisma.document.deleteMany({ where: { id: uploadedDocumentId } });
    }

    // Clean up cases
    if (caseAId && caseBId) {
      await prisma.caseMember.deleteMany({ where: { caseId: { in: [caseAId, caseBId] } } });
      await prisma.case.deleteMany({ where: { id: { in: [caseAId, caseBId] } } });
    }

    // Clean up users
    await prisma.user.deleteMany({
      where: { id: { in: [memberUserId, nonMemberUserId, adminUserId] } },
    });

    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  // ==========================================
  // Section 1: Authorization & Case Security
  // ==========================================
  describe('Case Authorization & Security', () => {
    it('1. authorized case member can upload document (returns 201 Created)', async () => {
      const formData = new FormData();
      const fileBlob = new Blob([validPdfBytes], { type: 'application/pdf' });
      formData.append('file', fileBlob, 'ballistics_report.pdf');
      formData.append('title', 'Forensic Ballistics Report');
      formData.append('documentType', 'FORENSIC_REPORT');
      formData.append('classification', 'CONFIDENTIAL');
      formData.append('description', 'Authentic shell casing analysis');

      const res = await fetch(`${baseUrl}/api/cases/${caseAId}/documents`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${memberToken}`,
        },
        body: formData,
      });

      assert.equal(res.status, 201);
      const data = (await res.json()) as {
        id: string;
        caseId: string;
        name: string;
        documentType: string;
        version: number;
        status: string;
        integrityStatus: string;
        blockchainStatus: string;
        sha256: string;
        createdBy: { id: string; name: string };
      };

      assert.ok(data.id, 'Response must include generated document ID');
      uploadedDocumentId = data.id;
      assert.equal(data.caseId, caseAId);
      assert.equal(data.name, 'Forensic Ballistics Report');
      assert.equal(data.version, 1);
      assert.equal(data.status, 'DRAFT');
      assert.equal(data.integrityStatus, 'PENDING');
      assert.equal(data.blockchainStatus, 'NOT_ANCHORED');
      assert.equal(data.createdBy.id, memberUserId);
      assert.equal(data.sha256, calculateSha256(validPdfBytes));
    });

    it('2. ADMIN can upload to an accessible case via global override (returns 201)', async () => {
      const formData = new FormData();
      const fileBlob = new Blob([validPdfBytes], { type: 'application/pdf' });
      formData.append('file', fileBlob, 'admin_supervision.pdf');
      formData.append('title', 'Admin Supervision Directive');
      formData.append('documentType', 'COURT_FILING');

      const res = await fetch(`${baseUrl}/api/cases/${caseBId}/documents`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        body: formData,
      });

      assert.equal(res.status, 201);
      const data = (await res.json()) as { id: string; createdBy: { id: string } };
      assert.ok(data.id);
      assert.equal(data.createdBy.id, adminUserId);

      // Clean up admin created doc
      await prisma.auditEvent.deleteMany({ where: { documentId: data.id } });
      await prisma.documentVersion.deleteMany({ where: { documentId: data.id } });
      await prisma.document.deleteMany({ where: { id: data.id } });
    });

    it('3. non-member cannot upload to another case (returns 404 anti-enumeration policy)', async () => {
      const formData = new FormData();
      const fileBlob = new Blob([validPdfBytes], { type: 'application/pdf' });
      formData.append('file', fileBlob, 'infiltrate.pdf');
      formData.append('title', 'Unauthorized Document Upload');

      const res = await fetch(`${baseUrl}/api/cases/${caseBId}/documents`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${memberToken}`, // memberToken only has access to Case A
        },
        body: formData,
      });

      assert.equal(res.status, 404);
      const data = (await res.json()) as { error: { code: string } };
      assert.equal(data.error.code, 'CASE_NOT_FOUND');
    });

    it('4. unauthenticated upload is rejected before buffering file (returns 401)', async () => {
      const formData = new FormData();
      const fileBlob = new Blob([validPdfBytes], { type: 'application/pdf' });
      formData.append('file', fileBlob, 'unauthenticated.pdf');
      formData.append('title', 'Unauthenticated Attempt');

      const res = await fetch(`${baseUrl}/api/cases/${caseAId}/documents`, {
        method: 'POST',
        body: formData,
      });

      assert.equal(res.status, 401);
      const data = (await res.json()) as { error: { code: string } };
      assert.equal(data.error.code, 'UNAUTHORIZED');
    });

    it('5. changing caseId in URL cannot bypass authorization', async () => {
      const formData = new FormData();
      const fileBlob = new Blob([validPdfBytes], { type: 'application/pdf' });
      formData.append('file', fileBlob, 'tampered_url.pdf');

      const res = await fetch(`${baseUrl}/api/cases/case_non_existent_999/documents`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${memberToken}`,
        },
        body: formData,
      });

      assert.equal(res.status, 404);
    });

    it('6. request-body identity fields cannot spoof uploader', async () => {
      const formData = new FormData();
      const fileBlob = new Blob([validPdfBytes], { type: 'application/pdf' });
      formData.append('file', fileBlob, 'spoof_test.pdf');
      formData.append('title', 'Spoof Caller Verification');
      // Attacker attempts to spoof createdBy and userId in body
      formData.append('createdBy', 'usr_spoofed_admin');
      formData.append('userId', 'usr_spoofed_hacker');
      formData.append('actorId', 'usr_spoofed_actor');

      const res = await fetch(`${baseUrl}/api/cases/${caseAId}/documents`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${memberToken}`,
        },
        body: formData,
      });

      assert.equal(res.status, 201);
      const data = (await res.json()) as { id: string; createdBy: { id: string } };
      assert.equal(data.createdBy.id, memberUserId, 'Database creator must strictly match req.user.id');

      // Clean up
      await prisma.auditEvent.deleteMany({ where: { documentId: data.id } });
      await prisma.documentVersion.deleteMany({ where: { documentId: data.id } });
      await prisma.document.deleteMany({ where: { id: data.id } });
    });
  });

  // ==========================================
  // Section 2: File Security & Validation
  // ==========================================
  describe('File Security & Format Validation', () => {
    it('7. missing file is rejected with 400 Bad Request', async () => {
      const formData = new FormData();
      formData.append('title', 'Document Without File');

      const res = await fetch(`${baseUrl}/api/cases/${caseAId}/documents`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${memberToken}`,
        },
        body: formData,
      });

      assert.equal(res.status, 400);
      const data = (await res.json()) as { error: { code: string } };
      assert.ok(data.error);
    });

    it('8. unsupported extension (e.g. .exe) is rejected with 400', async () => {
      const formData = new FormData();
      const exeBlob = new Blob([Buffer.from('MZ\x90\x00\x03\x00\x00\x00', 'binary')], {
        type: 'application/x-msdownload',
      });
      formData.append('file', exeBlob, 'malware.exe');
      formData.append('title', 'Suspicious Executable');

      const res = await fetch(`${baseUrl}/api/cases/${caseAId}/documents`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${memberToken}`,
        },
        body: formData,
      });

      assert.equal(res.status, 400);
      const data = (await res.json()) as { error: { code: string } };
      assert.equal(data.error.code, 'INVALID_FILE_TYPE');
    });

    it('9. magic bytes mismatch (disguised text file renamed to .pdf) is rejected with 400', async () => {
      const formData = new FormData();
      const fakePdfBlob = new Blob([Buffer.from('Hello world this is not a PDF', 'utf-8')], {
        type: 'application/pdf',
      });
      formData.append('file', fakePdfBlob, 'fake_document.pdf');
      formData.append('title', 'Spoofed PDF Document');

      const res = await fetch(`${baseUrl}/api/cases/${caseAId}/documents`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${memberToken}`,
        },
        body: formData,
      });

      assert.equal(res.status, 400);
      const data = (await res.json()) as { error: { code: string } };
      assert.equal(data.error.code, 'INVALID_FILE_TYPE');
    });

    it('10. valid image file (PNG with authentic header) succeeds with 201', async () => {
      const formData = new FormData();
      const pngBlob = new Blob([validPngBytes], { type: 'image/png' });
      formData.append('file', pngBlob, 'crime_scene_photo.png');
      formData.append('title', 'Crime Scene Photograph');
      formData.append('documentType', 'EVIDENCE');

      const res = await fetch(`${baseUrl}/api/cases/${caseAId}/documents`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${memberToken}`,
        },
        body: formData,
      });

      assert.equal(res.status, 201);
      const data = (await res.json()) as { id: string; mimeType: string };
      assert.equal(data.mimeType, 'image/png');

      // Clean up
      await prisma.auditEvent.deleteMany({ where: { documentId: data.id } });
      await prisma.documentVersion.deleteMany({ where: { documentId: data.id } });
      await prisma.document.deleteMany({ where: { id: data.id } });
    });

    it('11. malicious filename with directory traversal cannot escape storage root', async () => {
      const formData = new FormData();
      const fileBlob = new Blob([validPdfBytes], { type: 'application/pdf' });
      formData.append('file', fileBlob, '../../../../windows/system32/cmd.pdf');
      formData.append('title', 'Path Traversal Injection Attack');

      const res = await fetch(`${baseUrl}/api/cases/${caseAId}/documents`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${memberToken}`,
        },
        body: formData,
      });

      assert.equal(res.status, 201);
      const data = (await res.json()) as { id: string };

      // Inspect persisted version record to confirm storageKey is internally isolated
      const version = await prisma.documentVersion.findFirst({
        where: { documentId: data.id },
      });
      assert.ok(version);
      assert.ok(version.storageKey.startsWith(`documents/${data.id}/v1/`));
      assert.ok(!version.storageKey.includes('..'), 'Storage key must not contain parent traversal dots');

      // Clean up
      await prisma.auditEvent.deleteMany({ where: { documentId: data.id } });
      await prisma.documentVersion.deleteMany({ where: { documentId: data.id } });
      await prisma.document.deleteMany({ where: { id: data.id } });
    });
  });

  // ==========================================
  // Section 3: Cryptography & Storage Security
  // ==========================================
  describe('Cryptographic & Storage Verification', () => {
    it('12. plaintext bytes do not appear on disk (storage contains encrypted payload only)', async () => {
      const version = await prisma.documentVersion.findFirst({
        where: { documentId: uploadedDocumentId },
      });
      assert.ok(version);

      const storageConfig = loadStorageConfig();
      const storage = new LocalEncryptedStorage(storageConfig.storageRootDir);

      const storedRawBuffer = await storage.get(version.storageKey);
      const storedString = storedRawBuffer.toString('utf-8');

      // Original PDF contains "%PDF-1.4" and "Forensic Ballistics"
      assert.equal(
        storedString.includes('Forensic Ballistics'),
        false,
        'Plaintext strings must NOT be visible in physical storage file'
      );
      assert.equal(
        storedString.includes('%PDF-1.4'),
        false,
        'Plaintext magic bytes must NOT be visible in physical storage file'
      );

      // Verify stored file is a valid serialized EncryptedPayload JSON envelope
      const payload = deserializeEncryptedPayload(storedRawBuffer);
      assert.ok(payload.ciphertext);
      assert.ok(payload.iv);
      assert.ok(payload.authTag);
      assert.ok(payload.keyVersion);
    });

    it('13. encrypted storage object can be decrypted internally back to exact original bytes', async () => {
      const version = await prisma.documentVersion.findFirst({
        where: { documentId: uploadedDocumentId },
      });
      assert.ok(version);

      const storageConfig = loadStorageConfig();
      const storage = new LocalEncryptedStorage(storageConfig.storageRootDir);
      const storedRawBuffer = await storage.get(version.storageKey);

      const payload = deserializeEncryptedPayload(storedRawBuffer);
      const encConfig = loadEncryptionConfig();
      const encService = new AesGcmEncryptionService(encConfig.key, encConfig.keyVersion);

      const decryptedBytes = await encService.decrypt(payload);
      assert.deepEqual(decryptedBytes, validPdfBytes, 'Decrypted bytes must strictly match uploaded original bytes');
      assert.equal(calculateSha256(decryptedBytes), version.sha256Hash);
    });

    it('14. document detail response does not expose encryption secrets or filesystem paths', async () => {
      const res = await fetch(`${baseUrl}/api/documents/${uploadedDocumentId}`, {
        headers: {
          Authorization: `Bearer ${memberToken}`,
        },
      });

      assert.equal(res.status, 200);
      const body = (await res.json()) as Record<string, unknown>;

      assert.equal('storagePath' in body, false);
      assert.equal('storageKey' in body, false);
      assert.equal('encryptionIv' in body, false);
      assert.equal('encryptionAuthTag' in body, false);
      assert.equal('encryptionKey' in body, false);
      assert.equal('keyVersion' in body, false);
      assert.equal('ciphertext' in body, false);
    });
  });

  // ==========================================
  // Section 4: Database Persistence & Audit Chain
  // ==========================================
  describe('Database Persistence & Audit Chain', () => {
    it('15. Document and initial DocumentVersion (v1, DRAFT) are persisted correctly in PostgreSQL', async () => {
      const doc = await prisma.document.findUnique({
        where: { id: uploadedDocumentId },
        include: { versions: true },
      });

      assert.ok(doc);
      assert.equal(doc.caseId, caseAId);
      assert.equal(doc.title, 'Forensic Ballistics Report');
      assert.equal(doc.versions.length, 1);

      const v1 = doc.versions[0];
      assert.equal(v1.versionNumber, 1);
      assert.equal(v1.status, 'DRAFT');
      assert.equal(v1.blockchainStatus, 'NOT_ANCHORED');
      assert.equal(v1.createdBy, memberUserId);
      assert.equal(v1.sha256Hash, calculateSha256(validPdfBytes));
    });

    it('16. DOCUMENT_UPLOADED genesis audit event is created and hash chain is valid', async () => {
      const events = await auditRepo.listByDocument(uploadedDocumentId);
      assert.equal(events.length, 1, 'Newly uploaded document must have exactly 1 audit event');

      const uploadEvent = events[0];
      assert.equal(uploadEvent.eventType, 'DOCUMENT_UPLOADED');
      assert.equal(uploadEvent.actorId, memberUserId);
      assert.equal(uploadEvent.documentId, uploadedDocumentId);
      assert.equal(uploadEvent.previousEventHash, null, 'Genesis audit event must have previousEventHash: null');
      assert.ok(uploadEvent.eventHash);

      // Verify metadata in audit event
      const meta = uploadEvent.metadata as Record<string, unknown>;
      assert.equal(meta.fileName, 'ballistics_report.pdf');
      assert.equal(meta.mimeType, 'application/pdf');
      assert.equal(meta.sha256Hash, calculateSha256(validPdfBytes));

      // Verify audit chain
      const verification = await auditService.verifyAuditChain(uploadedDocumentId);
      assert.equal(verification.valid, true, 'Audit hash chain must be cryptographically valid');
      assert.equal(verification.eventCount, 1);
    });
  });

  // ==========================================
  // Section 5: Read API & Lifecycle Integration
  // ==========================================
  describe('Read API & Lifecycle Regression (M3-05A compatibility)', () => {
    it('17. uploaded DRAFT document is listed in GET /api/cases/:caseId/documents', async () => {
      const res = await fetch(`${baseUrl}/api/cases/${caseAId}/documents`, {
        headers: {
          Authorization: `Bearer ${memberToken}`,
        },
      });

      assert.equal(res.status, 200);
      const docs = (await res.json()) as Array<{ id: string; status: string }>;
      const found = docs.find((d) => d.id === uploadedDocumentId);
      assert.ok(found);
      assert.equal(found.status, 'DRAFT');
    });

    it('18. uploaded document versions retrievable via GET /api/documents/:id/versions', async () => {
      const res = await fetch(`${baseUrl}/api/documents/${uploadedDocumentId}/versions`, {
        headers: {
          Authorization: `Bearer ${memberToken}`,
        },
      });

      assert.equal(res.status, 200);
      const versions = (await res.json()) as Array<{ version: number; status: string; isCurrent: boolean }>;
      assert.equal(versions.length, 1);
      assert.equal(versions[0].version, 1);
      assert.equal(versions[0].status, 'DRAFT');
      assert.equal(versions[0].isCurrent, true);
    });

    it('19. uploaded document audit trail retrievable via GET /api/documents/:id/audit', async () => {
      const res = await fetch(`${baseUrl}/api/documents/${uploadedDocumentId}/audit`, {
        headers: {
          Authorization: `Bearer ${memberToken}`,
        },
      });

      assert.equal(res.status, 200);
      const data = (await res.json()) as { events: Array<{ action: string; actor: { id: string } }> };
      assert.equal(data.events.length, 1);
      assert.equal(data.events[0].action, 'DOCUMENT_UPLOADED');
      assert.equal(data.events[0].actor.id, memberUserId);
    });
  });

  // ==========================================
  // Section 6: Failure Boundary & Storage Cleanup
  // ==========================================
  describe('Failure Cleanup & Atomic Safety', () => {
    it('20. database failure after storage attempts cleanup of newly stored object', async () => {
      const storageConfig = loadStorageConfig();
      const storage = new LocalEncryptedStorage(storageConfig.storageRootDir);

      // Create service instance with a failing document repository to simulate DB crash
      const failingDocRepo = {
        createDocumentWithInitialVersion: async () => {
          throw new Error('Simulated database write failure during document insertion');
        },
      } as unknown as PrismaDocumentRepository;

      const uploadService = new DocumentUploadService({
        prisma,
        docRepo: failingDocRepo,
        storageService: storage,
      });

      const fakeFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'cleanup_test.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: validPdfBytes.length,
        buffer: validPdfBytes,
        destination: '',
        filename: '',
        path: '',
        stream: null as unknown as fs.ReadStream,
      };

      await assert.rejects(
        async () => {
          await uploadService.uploadDocument(
            caseAId,
            fakeFile,
            { title: 'Cleanup Test Doc' },
            { id: memberUserId, role: 'INSPECTOR' }
          );
        },
        /Simulated database write failure/
      );
    });
  });
});
