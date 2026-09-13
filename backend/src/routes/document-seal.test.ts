import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import { JsonRpcProvider, Wallet, ContractFactory } from 'ethers';
import { createApp } from '../app.js';
import { initializeEnvironment, loadEncryptionConfig, loadStorageConfig } from '../config/encryption.config.js';
import { getPrismaClient } from '../database/prisma.client.js';
import { PrismaUserRepository } from '../database/prisma-user.repository.js';
import { PrismaCaseRepository } from '../database/case.repository.js';
import { PrismaDocumentRepository } from '../database/prisma-document.repository.js';
import { PrismaAuditRepository } from '../database/prisma-audit.repository.js';
import { AuditService } from '../audit/audit.service.js';
import { PasswordService } from '../services/password.service.js';
import { TokenService } from '../services/token.service.js';
import { calculateSha256 } from '../integrity/hash.service.js';
import { AesGcmEncryptionService } from '../encryption/aes-gcm.service.js';
import { LocalEncryptedStorage } from '../storage/local-encrypted-storage.js';
import { EthersBlockchainService } from '../blockchain/ethers-blockchain.service.js';
import { DocumentSealingService } from '../sealing/sealing.service.js';
import { DocumentUploadService } from '../services/document-upload.service.js';
import { DocumentController } from '../controllers/document.controller.js';
import { BlockchainUnavailableError } from '../errors/domain.errors.js';

describe('Document Seal API & M2 Sealing Integration (M3-06)', () => {
  let server: Server;
  let baseUrl: string;
  const prisma = getPrismaClient();
  const userRepo = new PrismaUserRepository();
  const caseRepo = new PrismaCaseRepository();
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

  // Blockchain node configuration
  const RPC_URL = 'http://127.0.0.1:8546';
  const TEST_SIGNER_PRIVATE_KEY =
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

  let hardhatProcess: cp.ChildProcess | null = null;
  let realBlockchainService: EthersBlockchainService;
  let sealingService: DocumentSealingService;
  let uploadService: DocumentUploadService;

  const validPdfBytes = Buffer.from(
    '%PDF-1.4\n1 0 obj\n<<\n/Title (Autopsy Toxicology Final)\n>>\nendobj\ntrailer\n<<>>\n%%EOF\n',
    'utf-8'
  );

  let sealedDocumentId: string;
  const createdDocumentIds: string[] = [];

  async function isRpcReady(): Promise<boolean> {
    try {
      const res = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  before(async () => {
    initializeEnvironment();

    // 1. Check or start Hardhat local node on port 8546
    const alreadyRunning = await isRpcReady();
    if (!alreadyRunning) {
      const blockchainDir = path.resolve(process.cwd(), '../blockchain');
      const hardhatCli = path.resolve(blockchainDir, 'node_modules/hardhat/internal/cli/cli.js');

      hardhatProcess = cp.spawn('node', [hardhatCli, 'node', '--port', '8546'], {
        cwd: blockchainDir,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let ready = false;
      const startTime = Date.now();
      while (Date.now() - startTime < 15000) {
        if (await isRpcReady()) {
          ready = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 400));
      }

      if (!ready) {
        throw new Error('Failed to start local Hardhat JSON-RPC node within 15 seconds.');
      }
    }

    // 2. Setup ethers provider, signer, and deploy contract
    const provider = new JsonRpcProvider(RPC_URL);
    const signer = new Wallet(TEST_SIGNER_PRIVATE_KEY, provider);

    const blockchainDir = path.resolve(process.cwd(), '../blockchain');
    const artifactPath = path.resolve(
      blockchainDir,
      'artifacts/contracts/DocumentIntegrityRegistry.sol/DocumentIntegrityRegistry.json'
    );
    const artifact = JSON.parse(await fs.promises.readFile(artifactPath, 'utf-8'));

    const factory = new ContractFactory(artifact.abi, artifact.bytecode, signer);
    const contract = await factory.deploy();
    await contract.waitForDeployment();
    const deployedContractAddress = await contract.getAddress();

    // 3. Initialize real services
    realBlockchainService = new EthersBlockchainService({
      contractAddress: deployedContractAddress,
      runner: signer,
    });

    const encConfig = loadEncryptionConfig();
    const encryptionService = new AesGcmEncryptionService(encConfig.key, encConfig.keyVersion);
    const storageConfig = loadStorageConfig();
    const storageService = new LocalEncryptedStorage(storageConfig.storageRootDir);

    sealingService = new DocumentSealingService(
      docRepo,
      storageService,
      encryptionService,
      auditService,
      realBlockchainService
    );

    uploadService = new DocumentUploadService({
      prisma,
      docRepo,
      caseRepo,
      auditService,
      encryptionService,
      storageService,
    });

    const docController = new DocumentController(
      docRepo,
      caseRepo,
      auditRepo,
      uploadService,
      sealingService
    );

    const app = createApp({
      enableLogging: false,
      documentController: docController,
    });
    server = createServer(app);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });

    const pwdHash = await PasswordService.hashPassword('SealPass@123');

    // 4. Create test users
    const uMember = await userRepo.create({
      email: `seal-member-${testSuffix}@nyayavault.local`,
      name: 'Dr. Toxicology Expert',
      passwordHash: pwdHash,
      role: 'FORENSIC_OFFICER',
    });
    memberUserId = uMember.id;
    memberToken = TokenService.generateToken({
      sub: uMember.id,
      email: uMember.email,
      role: 'FORENSIC_OFFICER',
      name: uMember.name,
    });

    const uNonMember = await userRepo.create({
      email: `seal-nonmember-${testSuffix}@nyayavault.local`,
      name: 'Other Division Officer',
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
      email: `seal-admin-${testSuffix}@nyayavault.local`,
      name: 'Chief Legal Registrar',
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

    // 5. Create Case A and Case B
    const caseA = await prisma.case.create({
      data: {
        caseNumber: `CASE-SEAL-${testSuffix}-A`,
        firNumber: `FIR/SEAL/${testSuffix}/A`,
        title: 'Toxicology Investigation Matter',
        department: 'Forensic Science Laboratory',
        policeStation: 'Central Station',
        classification: 'HIGHLY_RESTRICTED',
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
        caseNumber: `CASE-SEAL-${testSuffix}-B`,
        firNumber: `FIR/SEAL/${testSuffix}/B`,
        title: 'Separate Foreign Case Matter',
        department: 'Special Branch',
        policeStation: 'South Station',
        classification: 'CONFIDENTIAL',
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
    if (hardhatProcess) {
      hardhatProcess.kill();
    }

    // Clean up created documents
    for (const docId of createdDocumentIds) {
      await prisma.blockchainAnchor.deleteMany({ where: { documentId: docId } });
      await prisma.auditEvent.deleteMany({ where: { documentId: docId } });
      await prisma.documentVersion.deleteMany({ where: { documentId: docId } });
      await prisma.document.deleteMany({ where: { id: docId } });
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

  // Helper to upload an authentic DRAFT document using real M3-05B upload pipeline
  async function uploadDraftDocument(caseId: string, token: string, title: string): Promise<string> {
    const formData = new FormData();
    const fileBlob = new Blob([validPdfBytes], { type: 'application/pdf' });
    formData.append('file', fileBlob, `${title.replace(/\s+/g, '_')}.pdf`);
    formData.append('title', title);
    formData.append('documentType', 'FORENSIC_REPORT');

    const res = await fetch(`${baseUrl}/api/cases/${caseId}/documents`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });

    assert.equal(res.status, 201);
    const data = (await res.json()) as { id: string };
    createdDocumentIds.push(data.id);
    return data.id;
  }

  // ==========================================
  // Section 1: Primary Success Path (Real Blockchain)
  // ==========================================
  describe('Primary Success Path with Real Blockchain Anchoring', () => {
    it('1. authenticated member can seal own uploaded case document (returns 200 OK)', async () => {
      // Step A: Upload authentic DRAFT document
      const docId = await uploadDraftDocument(caseAId, memberToken, 'Toxicology Autopsy Findings');
      sealedDocumentId = docId;

      // Step B: Seal document via POST /api/documents/:id/seal
      const res = await fetch(`${baseUrl}/api/documents/${docId}/seal`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${memberToken}`,
        },
      });

      assert.equal(res.status, 200);
      const data = (await res.json()) as {
        version: {
          id: string;
          documentId: string;
          versionNumber: number;
          status: string;
          sha256Hash: string;
          sealedAt: string;
          sealedBy: string;
          blockchainStatus: string;
          blockchainTxHash: string;
        };
        blockchain: {
          status: string;
          transactionHash: string;
          anchor: {
            documentId: string;
            versionId: number;
            documentHash: string;
            transactionId: string;
          };
        };
      };

      // 3. DRAFT becomes SEALED
      assert.equal(data.version.status, 'SEALED');
      // 4. sealedBy equals req.user.id
      assert.equal(data.version.sealedBy, memberUserId);
      // 5. sealedAt is recorded
      assert.ok(data.version.sealedAt);
      // 6. SHA-256 remains the original plaintext hash
      assert.equal(data.version.sha256Hash, calculateSha256(validPdfBytes));
      // 9. Real blockchain anchor succeeds
      assert.equal(data.blockchain.status, 'ANCHORED');
      // 10. Blockchain status is ANCHORED
      assert.equal(data.version.blockchainStatus, 'ANCHORED');
      // 11. Real transaction hash is persisted/returned
      assert.ok(data.blockchain.transactionHash.startsWith('0x'));
      assert.equal(data.version.blockchainTxHash, data.blockchain.transactionHash);
      // 12. Returned anchor hash matches document SHA-256
      assert.equal(data.blockchain.anchor.documentHash, calculateSha256(validPdfBytes));
      // Security: storageKey must NOT be present in API response
      assert.equal('storageKey' in data.version, false);
    });

    it('2. ADMIN can seal an authorized case document via global override (returns 200 OK)', async () => {
      // Step A: Upload authentic DRAFT in Case B (nonMember's case)
      const docId = await uploadDraftDocument(caseBId, nonMemberToken, 'Case B Admin Supervision Matter');

      // Step B: Admin seals Case B's document via global override
      const res = await fetch(`${baseUrl}/api/documents/${docId}/seal`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      assert.equal(res.status, 200);
      const data = (await res.json()) as {
        version: { status: string; sealedBy: string; blockchainStatus: string };
      };
      assert.equal(data.version.status, 'SEALED');
      assert.equal(data.version.sealedBy, adminUserId);
      assert.equal(data.version.blockchainStatus, 'ANCHORED');
    });

    it('3. final PostgreSQL state reflects SEALED, sha256Hash, and BlockchainAnchor row', async () => {
      const v1 = await prisma.documentVersion.findFirst({
        where: { documentId: sealedDocumentId },
        include: { blockchainAnchor: true },
      });

      assert.ok(v1);
      assert.equal(v1.status, 'SEALED');
      assert.equal(v1.sealedBy, memberUserId);
      assert.ok(v1.sealedAt);
      assert.equal(v1.sha256Hash, calculateSha256(validPdfBytes));
      assert.equal(v1.blockchainStatus, 'ANCHORED');
      assert.ok(v1.blockchainTxHash);

      // Verify synchronized BlockchainAnchor record
      const anchorRow = await prisma.blockchainAnchor.findUnique({
        where: {
          documentId_versionId: {
            documentId: sealedDocumentId,
            versionId: 1,
          },
        },
      });
      assert.ok(anchorRow, 'BlockchainAnchor table must be synchronized with on-chain anchor');
      assert.equal(anchorRow.documentHash, calculateSha256(validPdfBytes));
      assert.equal(anchorRow.transactionId, v1.blockchainTxHash);
      assert.equal(anchorRow.status, 'ANCHORED');
    });

    it('4. audit database contains DOCUMENT_UPLOADED followed by DOCUMENT_SEALED with valid hash chain', async () => {
      const events = await auditRepo.listByDocument(sealedDocumentId);
      assert.equal(events.length, 2, 'Must contain exactly 2 events: UPLOADED and SEALED');

      assert.equal(events[0].eventType, 'DOCUMENT_UPLOADED');
      assert.equal(events[0].previousEventHash, null);

      assert.equal(events[1].eventType, 'DOCUMENT_SEALED');
      assert.equal(events[1].previousEventHash, events[0].eventHash, 'DOCUMENT_SEALED must chain to predecessor');
      assert.equal(events[1].actorId, memberUserId);

      // Cryptographic verification of the complete chain
      const verification = await auditService.verifyAuditChain(sealedDocumentId);
      assert.equal(verification.valid, true, 'Audit hash chain must be cryptographically valid');
      assert.equal(verification.eventCount, 2);
    });
  });

  // ==========================================
  // Section 2: Authorization & Security Boundaries
  // ==========================================
  describe('Authorization & Security Boundaries', () => {
    it('5. unauthenticated caller gets 401 Unauthorized', async () => {
      const res = await fetch(`${baseUrl}/api/documents/${sealedDocumentId}/seal`, {
        method: 'POST',
      });

      assert.equal(res.status, 401);
      const data = (await res.json()) as { error: { code: string } };
      assert.equal(data.error.code, 'UNAUTHORIZED');
    });

    it('6. non-member gets 404 anti-enumeration policy when attempting to seal foreign document', async () => {
      // nonMemberToken only has access to Case B, cannot seal Case A's document
      const res = await fetch(`${baseUrl}/api/documents/${sealedDocumentId}/seal`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${nonMemberToken}`,
        },
      });

      assert.equal(res.status, 404);
      const data = (await res.json()) as { error: { code: string } };
      assert.equal(data.error.code, 'DOCUMENT_NOT_FOUND');
    });

    it('7. sealing non-existent document returns 404', async () => {
      const res = await fetch(`${baseUrl}/api/documents/doc_non_existent_999/seal`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${memberToken}`,
        },
      });

      assert.equal(res.status, 404);
    });

    it('8. changing any body identity field cannot spoof caller identity', async () => {
      const docId = await uploadDraftDocument(caseAId, memberToken, 'Spoof Protection Test');

      const res = await fetch(`${baseUrl}/api/documents/${docId}/seal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${memberToken}`,
        },
        body: JSON.stringify({
          actorId: 'usr_spoofed_hacker',
          sealedBy: 'usr_spoofed_admin',
          userId: 'usr_spoofed_user',
          createdBy: 'usr_spoofed_creator',
        }),
      });

      assert.equal(res.status, 200);
      const data = (await res.json()) as { version: { sealedBy: string } };
      assert.equal(
        data.version.sealedBy,
        memberUserId,
        'sealedBy MUST strictly equal req.user.id regardless of body contents'
      );
    });
  });

  // ==========================================
  // Section 3: State Machine & Idempotency
  // ==========================================
  describe('State Machine & Idempotency Rules', () => {
    it('9. already SEALED document returns 409 Conflict (DOCUMENT_ALREADY_SEALED)', async () => {
      const res = await fetch(`${baseUrl}/api/documents/${sealedDocumentId}/seal`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${memberToken}`,
        },
      });

      assert.equal(res.status, 409);
      const data = (await res.json()) as { error: { code: string } };
      assert.equal(data.error.code, 'DOCUMENT_ALREADY_SEALED');
    });

    it('10. second seal attempt does not create another audit event or mutate sealedAt', async () => {
      const versionBefore = await prisma.documentVersion.findFirst({
        where: { documentId: sealedDocumentId },
      });
      assert.ok(versionBefore);

      const eventsBefore = await auditRepo.listByDocument(sealedDocumentId);
      assert.equal(eventsBefore.length, 2);

      // Attempt second seal (fails with 409)
      await fetch(`${baseUrl}/api/documents/${sealedDocumentId}/seal`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${memberToken}` },
      });

      // Verify audit events unchanged
      const eventsAfter = await auditRepo.listByDocument(sealedDocumentId);
      assert.equal(eventsAfter.length, 2, 'Audit event count must not increase after rejected seal attempt');

      // Verify sealedAt timestamp unchanged
      const versionAfter = await prisma.documentVersion.findFirst({
        where: { documentId: sealedDocumentId },
      });
      assert.ok(versionAfter);
      assert.equal(versionAfter.sealedAt?.toISOString(), versionBefore.sealedAt?.toISOString());
    });
  });

  // ==========================================
  // Section 4: Blockchain Failure Resilience
  // ==========================================
  describe('Blockchain Failure Isolation & Resilience', () => {
    it('11. when blockchain is unavailable, document still becomes SEALED with FAILED status and no fake txHash', async () => {
      // Create separate controller with an unavailable blockchain service
      const failingBlockchainService = {
        anchorDocument: async () => {
          throw new BlockchainUnavailableError('RPC endpoint connection refused (simulated outage).');
        },
        verifyAnchor: () => false,
        getAnchor: async () => {
          throw new BlockchainUnavailableError('Unavailable');
        },
      };

      const encConfig = loadEncryptionConfig();
      const encryptionService = new AesGcmEncryptionService(encConfig.key, encConfig.keyVersion);
      const storageConfig = loadStorageConfig();
      const storageService = new LocalEncryptedStorage(storageConfig.storageRootDir);

      const failingSealingService = new DocumentSealingService(
        docRepo,
        storageService,
        encryptionService,
        auditService,
        failingBlockchainService
      );

      const failingDocController = new DocumentController(
        docRepo,
        caseRepo,
        auditRepo,
        uploadService,
        failingSealingService
      );

      const testApp = createApp({
        enableLogging: false,
        documentController: failingDocController,
      });

      const testServer = createServer(testApp);
      let testBaseUrl = '';
      await new Promise<void>((resolve) => {
        testServer.listen(0, '127.0.0.1', () => {
          const address = testServer.address() as AddressInfo;
          testBaseUrl = `http://127.0.0.1:${address.port}`;
          resolve();
        });
      });

      try {
        // Step A: Upload authentic DRAFT
        const docId = await uploadDraftDocument(caseAId, memberToken, 'Resilience Test Document');

        // Step B: Seal with failing blockchain
        const res = await fetch(`${testBaseUrl}/api/documents/${docId}/seal`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${memberToken}` },
        });

        assert.equal(res.status, 200);
        const data = (await res.json()) as {
          version: { status: string; blockchainStatus: string; blockchainTxHash?: string };
          blockchain: { status: string; error?: string };
        };

        // Document MUST be SEALED
        assert.equal(data.version.status, 'SEALED');
        // Blockchain status MUST be FAILED
        assert.equal(data.version.blockchainStatus, 'FAILED');
        assert.equal(data.blockchain.status, 'FAILED');
        assert.ok(data.blockchain.error?.includes('RPC endpoint connection refused'));
        // No fake transaction hash
        assert.equal(data.version.blockchainTxHash, undefined);

        // Verify DB state
        const dbVersion = await prisma.documentVersion.findFirst({
          where: { documentId: docId },
        });
        assert.ok(dbVersion);
        assert.equal(dbVersion.status, 'SEALED');
        assert.equal(dbVersion.blockchainStatus, 'FAILED');
        assert.equal(dbVersion.blockchainTxHash, null);

        // Verify audit event is still recorded
        const events = await auditRepo.listByDocument(docId);
        assert.equal(events.length, 2);
        assert.equal(events[1].eventType, 'DOCUMENT_SEALED');

        // Verify repeated seal attempt is still rejected as already sealed
        const secondRes = await fetch(`${testBaseUrl}/api/documents/${docId}/seal`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${memberToken}` },
        });
        assert.equal(secondRes.status, 409);
      } finally {
        await new Promise<void>((resolve, reject) => {
          testServer.close((err) => (err ? reject(err) : resolve()));
        });
      }
    });
  });

  // ==========================================
  // Section 5: Read API Regression
  // ==========================================
  describe('Read API Regression (M3-05A/B compatibility after sealing)', () => {
    it('12. GET /api/documents/:id reports SEALED, sha256Hash, and blockchainTxId', async () => {
      const res = await fetch(`${baseUrl}/api/documents/${sealedDocumentId}`, {
        headers: {
          Authorization: `Bearer ${memberToken}`,
        },
      });

      assert.equal(res.status, 200);
      const data = (await res.json()) as {
        status: string;
        integrityStatus: string;
        blockchainStatus: string;
        sha256: string;
        blockchainTxId: string;
      };

      assert.equal(data.status, 'SEALED');
      assert.equal(data.integrityStatus, 'VERIFIED');
      assert.equal(data.blockchainStatus, 'ANCHORED');
      assert.equal(data.sha256, calculateSha256(validPdfBytes));
      assert.ok(data.blockchainTxId.startsWith('0x'));
    });

    it('13. GET /api/documents/:id/versions reports sealed version correctly', async () => {
      const res = await fetch(`${baseUrl}/api/documents/${sealedDocumentId}/versions`, {
        headers: {
          Authorization: `Bearer ${memberToken}`,
        },
      });

      assert.equal(res.status, 200);
      const versions = (await res.json()) as Array<{
        version: number;
        status: string;
        sha256: string;
        blockchainTxId?: string;
        isCurrent: boolean;
      }>;

      assert.equal(versions.length, 1);
      assert.equal(versions[0].version, 1);
      assert.equal(versions[0].status, 'SEALED');
      assert.equal(versions[0].sha256, calculateSha256(validPdfBytes));
      assert.ok(versions[0].blockchainTxId?.startsWith('0x'));
      assert.equal(versions[0].isCurrent, true);
    });

    it('14. GET /api/documents/:id/audit contains DOCUMENT_UPLOADED and DOCUMENT_SEALED', async () => {
      const res = await fetch(`${baseUrl}/api/documents/${sealedDocumentId}/audit`, {
        headers: {
          Authorization: `Bearer ${memberToken}`,
        },
      });

      assert.equal(res.status, 200);
      const data = (await res.json()) as {
        events: Array<{ action: string; actor: { id: string } }>;
      };

      assert.equal(data.events.length, 2);
      assert.equal(data.events[0].action, 'DOCUMENT_UPLOADED');
      assert.equal(data.events[1].action, 'DOCUMENT_SEALED');
      assert.equal(data.events[1].actor.id, memberUserId);
    });
  });
});
