import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../app.js';
import { initializeEnvironment, loadEncryptionConfig, loadStorageConfig } from '../config/encryption.config.js';
import { getPrismaClient } from '../database/prisma.client.js';
import { PrismaUserRepository } from '../database/prisma-user.repository.js';
import { PrismaAuditRepository } from '../database/prisma-audit.repository.js';
import { PasswordService } from '../services/password.service.js';
import { TokenService } from '../services/token.service.js';
import { AesGcmEncryptionService } from '../encryption/aes-gcm.service.js';
import { LocalEncryptedStorage } from '../storage/local-encrypted-storage.js';
import { serializeEncryptedPayload } from '../encryption/encryption.types.js';

describe('Document Secure View & Download API (M3-10)', () => {
  let server: Server;
  let baseUrl: string;
  const prisma = getPrismaClient();
  const userRepo = new PrismaUserRepository();
  const auditRepo = new PrismaAuditRepository(getPrismaClient());

  const testSuffix = Date.now();

  let memberUserId: string;
  let nonMemberUserId: string;
  let memberToken: string;
  let nonMemberToken: string;

  let caseAId: string;
  let caseBId: string;

  let encryptionService: AesGcmEncryptionService;
  let storageService: LocalEncryptedStorage;

  // Documents
  const docDraftPdf = `doc_download_pdf_${testSuffix}`;
  const docSealedPng = `doc_download_png_${testSuffix}`;
  const docDraftDocx = `doc_download_docx_${testSuffix}`;
  const docMissingArtifact = `doc_download_missing_${testSuffix}`;
  const docCorrupted = `doc_download_corrupt_${testSuffix}`;
  const docSpecialName = `doc_download_special_${testSuffix}`;

  // Plaintext payloads
  const pdfPlaintext = Buffer.from(
    '%PDF-1.4\n1 0 obj\n<< /Title (Forensic Autopsy Report) >>\nendobj\ntrailer\n<<>>\n%%EOF\n',
    'utf-8'
  );

  const pngPlaintext = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89,
  ]);

  const docxPlaintext = Buffer.from([
    0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00, 0x08, 0x00, 0x00, 0x00, 0x21, 0x00, 0xaa, 0xbb,
  ]);

  const specialPlaintext = Buffer.from('Special name evidentiary record plaintext content.', 'utf-8');

  // Storage keys
  const pdfStorageKey = `documents/${docDraftPdf}/v1/payload.enc`;
  const pngStorageKey = `documents/${docSealedPng}/v1/payload.enc`;
  const docxStorageKey = `documents/${docDraftDocx}/v1/payload.enc`;
  const missingStorageKey = `documents/${docMissingArtifact}/v1/nonexistent.enc`;
  const corruptedStorageKey = `documents/${docCorrupted}/v1/corrupted.enc`;
  const specialStorageKey = `documents/${docSpecialName}/v1/payload.enc`;

  before(async () => {
    initializeEnvironment();

    const encConfig = loadEncryptionConfig();
    encryptionService = new AesGcmEncryptionService(encConfig.key, encConfig.keyVersion);
    const storageConfig = loadStorageConfig();
    storageService = new LocalEncryptedStorage(storageConfig.storageRootDir);

    const app = createApp({ enableLogging: false });
    server = createServer(app);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });

    const pwdHash = await PasswordService.hashPassword('DownloadPass@123');

    // 1. Create test users
    const uMember = await userRepo.create({
      email: `download-member-${testSuffix}@nyayavault.local`,
      name: 'Case A Assigned Investigator',
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
      email: `download-nonmember-${testSuffix}@nyayavault.local`,
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

    // 2. Create Case A and Case B
    const caseA = await prisma.case.create({
      data: {
        caseNumber: `CASE-DL-${testSuffix}-A`,
        firNumber: `FIR/DL/${testSuffix}/A`,
        title: 'Forensic Ballistics Matter DL-A',
        classification: 'RESTRICTED',
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
        caseNumber: `CASE-DL-${testSuffix}-B`,
        firNumber: `FIR/DL/${testSuffix}/B`,
        title: 'Unrelated Cyber Inquiry DL-B',
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

    // 3. Encrypt and store artifacts in LocalEncryptedStorage
    // Doc 1: PDF (DRAFT)
    const encPdf = await encryptionService.encrypt(pdfPlaintext);
    await storageService.put(pdfStorageKey, serializeEncryptedPayload(encPdf));

    await prisma.document.create({
      data: {
        id: docDraftPdf,
        caseId: caseAId,
        title: 'Ballistics_Analysis_Report.pdf',
        versions: {
          create: {
            id: `${docDraftPdf}_v1`,
            versionNumber: 1,
            storageKey: pdfStorageKey,
            status: 'DRAFT',
            createdBy: memberUserId,
          },
        },
      },
    });

    await auditRepo.append({
      id: `aud_dl_${testSuffix}_1`,
      eventType: 'DOCUMENT_UPLOADED',
      actorId: memberUserId,
      documentId: docDraftPdf,
      versionId: `${docDraftPdf}_v1`,
      timestamp: new Date().toISOString(),
      previousEventHash: null,
      eventHash: 'b81f92c10b7454839de848a91316b23d06e300183b102ef70d249f05f7ff72a1',
      metadata: {
        fileName: 'Ballistics_Analysis_Report.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: pdfPlaintext.length,
      },
    });

    // Doc 2: PNG (SEALED)
    const encPng = await encryptionService.encrypt(pngPlaintext);
    await storageService.put(pngStorageKey, serializeEncryptedPayload(encPng));

    await prisma.document.create({
      data: {
        id: docSealedPng,
        caseId: caseAId,
        title: 'Fingerprint_Ridge_Scan.png',
        versions: {
          create: {
            id: `${docSealedPng}_v1`,
            versionNumber: 1,
            storageKey: pngStorageKey,
            status: 'SEALED',
            sealedAt: new Date(),
            sealedBy: memberUserId,
            sha256Hash: 'c92a92c10b7454839de848a91316b23d06e300183b102ef70d249f05f7ff72a2',
            createdBy: memberUserId,
          },
        },
      },
    });

    await auditRepo.append({
      id: `aud_dl_${testSuffix}_2`,
      eventType: 'DOCUMENT_UPLOADED',
      actorId: memberUserId,
      documentId: docSealedPng,
      versionId: `${docSealedPng}_v1`,
      timestamp: new Date().toISOString(),
      previousEventHash: null,
      eventHash: 'c81f92c10b7454839de848a91316b23d06e300183b102ef70d249f05f7ff72a2',
      metadata: {
        fileName: 'Fingerprint_Ridge_Scan.png',
        mimeType: 'image/png',
        fileSizeBytes: pngPlaintext.length,
      },
    });

    // Doc 3: DOCX (DRAFT)
    const encDocx = await encryptionService.encrypt(docxPlaintext);
    await storageService.put(docxStorageKey, serializeEncryptedPayload(encDocx));

    await prisma.document.create({
      data: {
        id: docDraftDocx,
        caseId: caseAId,
        title: 'Witness_Deposition.docx',
        versions: {
          create: {
            id: `${docDraftDocx}_v1`,
            versionNumber: 1,
            storageKey: docxStorageKey,
            status: 'DRAFT',
            createdBy: memberUserId,
          },
        },
      },
    });

    await auditRepo.append({
      id: `aud_dl_${testSuffix}_3`,
      eventType: 'DOCUMENT_UPLOADED',
      actorId: memberUserId,
      documentId: docDraftDocx,
      versionId: `${docDraftDocx}_v1`,
      timestamp: new Date().toISOString(),
      previousEventHash: null,
      eventHash: 'd81f92c10b7454839de848a91316b23d06e300183b102ef70d249f05f7ff72a3',
      metadata: {
        fileName: 'Witness_Deposition.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        fileSizeBytes: docxPlaintext.length,
      },
    });

    // Doc 4: Missing Artifact on disk
    await prisma.document.create({
      data: {
        id: docMissingArtifact,
        caseId: caseAId,
        title: 'Missing_Artifact_Document.pdf',
        versions: {
          create: {
            id: `${docMissingArtifact}_v1`,
            versionNumber: 1,
            storageKey: missingStorageKey,
            status: 'DRAFT',
            createdBy: memberUserId,
          },
        },
      },
    });

    // Doc 5: Corrupted AES-GCM artifact (invalid ciphertext/tag)
    const corruptedPayloadBuffer = Buffer.from(
      JSON.stringify({
        v: 'v1',
        iv: '0123456789abcdef01234567',
        tag: '0123456789abcdef0123456789abcdef',
        ct: Buffer.from('TAMPERED_CIPHERTEXT_BYTES').toString('base64'),
      }),
      'utf-8'
    );
    await storageService.put(corruptedStorageKey, corruptedPayloadBuffer);

    await prisma.document.create({
      data: {
        id: docCorrupted,
        caseId: caseAId,
        title: 'Corrupted_Payload_Doc.pdf',
        versions: {
          create: {
            id: `${docCorrupted}_v1`,
            versionNumber: 1,
            storageKey: corruptedStorageKey,
            status: 'DRAFT',
            createdBy: memberUserId,
          },
        },
      },
    });

    // Doc 6: Document with traversal and CR/LF characters in title
    const encSpecial = await encryptionService.encrypt(specialPlaintext);
    await storageService.put(specialStorageKey, serializeEncryptedPayload(encSpecial));

    await prisma.document.create({
      data: {
        id: docSpecialName,
        caseId: caseAId,
        title: '../../secret\r\nInjected-Header: evil"quoted.pdf',
        versions: {
          create: {
            id: `${docSpecialName}_v1`,
            versionNumber: 1,
            storageKey: specialStorageKey,
            status: 'DRAFT',
            createdBy: memberUserId,
          },
        },
      },
    });
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    // Cleanup created storage files
    await storageService.delete(pdfStorageKey).catch(() => {});
    await storageService.delete(pngStorageKey).catch(() => {});
    await storageService.delete(docxStorageKey).catch(() => {});
    await storageService.delete(corruptedStorageKey).catch(() => {});
    await storageService.delete(specialStorageKey).catch(() => {});
  });

  // ========================================================
  // 1. Authorized member gets 200 and exact original bytes
  // ========================================================
  it('1. authorized member gets 200 and exact original plaintext bytes', async () => {
    const res = await fetch(`${baseUrl}/api/documents/${docDraftPdf}/download`, {
      headers: { Authorization: `Bearer ${memberToken}` },
    });

    assert.equal(res.status, 200);
    const downloadedBuffer = Buffer.from(await res.arrayBuffer());
    assert.deepEqual(downloadedBuffer, pdfPlaintext, 'Downloaded bytes must exactly match original plaintext');
  });

  // ========================================================
  // 2. Correct Content-Type
  // ========================================================
  it('2. returns correct original stored MIME Content-Type', async () => {
    const res = await fetch(`${baseUrl}/api/documents/${docDraftPdf}/download`, {
      headers: { Authorization: `Bearer ${memberToken}` },
    });

    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/pdf');
  });

  // ========================================================
  // 3. Correct Content-Disposition, Cache-Control, Pragma, Content-Length
  // ========================================================
  it('3. returns correct Content-Disposition (inline default and attachment with query param)', async () => {
    // Default disposition: inline
    const resInline = await fetch(`${baseUrl}/api/documents/${docDraftPdf}/download`, {
      headers: { Authorization: `Bearer ${memberToken}` },
    });
    assert.equal(resInline.status, 200);
    const inlineHeader = resInline.headers.get('content-disposition');
    assert.ok(inlineHeader?.startsWith('inline; filename="Ballistics_Analysis_Report.pdf"'));
    assert.equal(resInline.headers.get('cache-control'), 'private, no-cache, no-store, must-revalidate');
    assert.equal(resInline.headers.get('pragma'), 'no-cache');
    assert.equal(resInline.headers.get('content-length'), pdfPlaintext.length.toString());

    // Explicit attachment disposition
    const resAttachment = await fetch(`${baseUrl}/api/documents/${docDraftPdf}/download?disposition=attachment`, {
      headers: { Authorization: `Bearer ${memberToken}` },
    });
    assert.equal(resAttachment.status, 200);
    const attachmentHeader = resAttachment.headers.get('content-disposition');
    assert.ok(attachmentHeader?.startsWith('attachment; filename="Ballistics_Analysis_Report.pdf"'));

    // Explicit inline disposition
    const resExplicitInline = await fetch(`${baseUrl}/api/documents/${docDraftPdf}/download?disposition=inline`, {
      headers: { Authorization: `Bearer ${memberToken}` },
    });
    assert.equal(resExplicitInline.status, 200);
    assert.ok(resExplicitInline.headers.get('content-disposition')?.startsWith('inline; filename="Ballistics_Analysis_Report.pdf"'));
  });

  // ========================================================
  // 4. Unauthenticated -> 401
  // ========================================================
  it('4. unauthenticated request returns 401 Unauthorized', async () => {
    const res = await fetch(`${baseUrl}/api/documents/${docDraftPdf}/download`);
    assert.equal(res.status, 401);
    const data = (await res.json()) as { error: { code: string } };
    assert.equal(data.error.code, 'UNAUTHORIZED');
  });

  // ========================================================
  // 5. Non-member -> 404 (Anti-enumeration policy)
  // ========================================================
  it('5. non-member returns 404 Not Found (anti-enumeration policy)', async () => {
    const res = await fetch(`${baseUrl}/api/documents/${docDraftPdf}/download`, {
      headers: { Authorization: `Bearer ${nonMemberToken}` },
    });
    assert.equal(res.status, 404);
    const data = (await res.json()) as { error: { code: string } };
    assert.equal(data.error.code, 'DOCUMENT_NOT_FOUND');
  });

  // ========================================================
  // 6. Missing document -> 404
  // ========================================================
  it('6. missing document returns 404 Not Found', async () => {
    const res = await fetch(`${baseUrl}/api/documents/doc_nonexistent_99999/download`, {
      headers: { Authorization: `Bearer ${memberToken}` },
    });
    assert.equal(res.status, 404);
    const data = (await res.json()) as { error: { code: string } };
    assert.equal(data.error.code, 'DOCUMENT_NOT_FOUND');
  });

  // ========================================================
  // 7. Missing storage artifact -> safe error (>= 400)
  // ========================================================
  it('7. missing storage artifact returns safe error without exposing path', async () => {
    const res = await fetch(`${baseUrl}/api/documents/${docMissingArtifact}/download`, {
      headers: { Authorization: `Bearer ${memberToken}` },
    });
    assert.ok(res.status >= 400, 'Expected HTTP error status code');
    const data = (await res.json()) as { error: { code: string; message: string } };
    assert.equal(data.error.code, 'STORAGE_ARTIFACT_NOT_FOUND');
    assert.ok(!data.error.message.includes(missingStorageKey), 'Must not leak storageKey');
    assert.ok(!data.error.message.includes('nonexistent.enc'), 'Must not leak filename on disk');
  });

  // ========================================================
  // 8. AES-GCM corruption -> safe error
  // ========================================================
  it('8. AES-GCM corruption returns safe error without leaking crypto internals', async () => {
    const res = await fetch(`${baseUrl}/api/documents/${docCorrupted}/download`, {
      headers: { Authorization: `Bearer ${memberToken}` },
    });
    assert.ok(res.status >= 400, 'Expected HTTP error status code');
    const data = (await res.json()) as { error: { code: string; message: string } };
    assert.equal(data.error.code, 'DECRYPTION_FAILED');
    assert.ok(!data.error.message.includes(corruptedStorageKey), 'Must not leak storageKey');
  });

  // ========================================================
  // 9. No storage key / path / crypto secret leakage
  // ========================================================
  it('9. zero storage key, filesystem path, IV, auth tag, or secret leakage', async () => {
    const res = await fetch(`${baseUrl}/api/documents/${docDraftPdf}/download`, {
      headers: { Authorization: `Bearer ${memberToken}` },
    });
    assert.equal(res.status, 200);

    // Check all headers
    for (const [headerName, headerValue] of res.headers.entries()) {
      assert.ok(!headerValue.includes(pdfStorageKey), `Header ${headerName} leaked storageKey`);
      assert.ok(!headerValue.includes('.enc'), `Header ${headerName} leaked .enc path`);
      assert.ok(!headerValue.includes('documents/'), `Header ${headerName} leaked documents path`);
    }
  });

  // ========================================================
  // 10. PDF, PNG, and DOCX MIME handling
  // ========================================================
  it('10. handles PDF, PNG, and DOCX MIME types correctly with accurate bytes', async () => {
    // 10a. PDF
    const resPdf = await fetch(`${baseUrl}/api/documents/${docDraftPdf}/download`, {
      headers: { Authorization: `Bearer ${memberToken}` },
    });
    assert.equal(resPdf.status, 200);
    assert.equal(resPdf.headers.get('content-type'), 'application/pdf');
    assert.deepEqual(Buffer.from(await resPdf.arrayBuffer()), pdfPlaintext);

    // 10b. PNG
    const resPng = await fetch(`${baseUrl}/api/documents/${docSealedPng}/download`, {
      headers: { Authorization: `Bearer ${memberToken}` },
    });
    assert.equal(resPng.status, 200);
    assert.equal(resPng.headers.get('content-type'), 'image/png');
    assert.deepEqual(Buffer.from(await resPng.arrayBuffer()), pngPlaintext);

    // 10c. DOCX
    const resDocx = await fetch(`${baseUrl}/api/documents/${docDraftDocx}/download`, {
      headers: { Authorization: `Bearer ${memberToken}` },
    });
    assert.equal(resDocx.status, 200);
    assert.equal(
      resDocx.headers.get('content-type'),
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    assert.deepEqual(Buffer.from(await resDocx.arrayBuffer()), docxPlaintext);
  });

  // ========================================================
  // 11. DRAFT and SEALED documents work where authorization permits
  // ========================================================
  it('11. both DRAFT and SEALED documents can be downloaded by authorized member', async () => {
    // DRAFT doc
    const resDraft = await fetch(`${baseUrl}/api/documents/${docDraftPdf}/download`, {
      headers: { Authorization: `Bearer ${memberToken}` },
    });
    assert.equal(resDraft.status, 200);

    // SEALED doc
    const resSealed = await fetch(`${baseUrl}/api/documents/${docSealedPng}/download`, {
      headers: { Authorization: `Bearer ${memberToken}` },
    });
    assert.equal(resSealed.status, 200);
  });

  // ========================================================
  // 12. Filename sanitization against header injection & path traversal
  // ========================================================
  it('12. sanitizes filename preventing header injection and path traversal', async () => {
    const res = await fetch(`${baseUrl}/api/documents/${docSpecialName}/download`, {
      headers: { Authorization: `Bearer ${memberToken}` },
    });
    assert.equal(res.status, 200);

    const disposition = res.headers.get('content-disposition');
    assert.ok(disposition, 'Content-Disposition must be present');
    assert.ok(!disposition.includes('\r'), 'Must not contain CR');
    assert.ok(!disposition.includes('\n'), 'Must not contain LF');
    assert.ok(!disposition.includes('..'), 'Must not contain path traversal ..');
    assert.ok(!disposition.includes('/'), 'Must not contain directory slashes');
    assert.ok(!disposition.includes('\\'), 'Must not contain backslashes');

    const downloadedBytes = Buffer.from(await res.arrayBuffer());
    assert.deepEqual(downloadedBytes, specialPlaintext);
  });
});
