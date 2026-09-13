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
import { serializeEncryptedPayload } from '../encryption/encryption.types.js';
import { LocalEncryptedStorage } from '../storage/local-encrypted-storage.js';
import { EthersBlockchainService } from '../blockchain/ethers-blockchain.service.js';
import { DocumentSealingService } from '../sealing/sealing.service.js';
import { DocumentUploadService } from '../services/document-upload.service.js';
import { DocumentVerificationService } from '../services/document-verification.service.js';
import { DocumentController } from '../controllers/document.controller.js';
import { BlockchainUnavailableError } from '../errors/domain.errors.js';
import type { BlockchainService, BlockchainAnchor } from '../blockchain/blockchain.types.js';
import { EVENT_DOCUMENT_SEALED_HASH } from '../blockchain/blockchain.types.js';

describe('Document Verification & Tamper Detection API (M3-07)', () => {
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
  let verificationService: DocumentVerificationService;
  let storageService: LocalEncryptedStorage;
  let encryptionService: AesGcmEncryptionService;

  const validPdfBytes = Buffer.from(
    '%PDF-1.4\n1 0 obj\n<<\n/Title (Autopsy Toxicology Final Analysis)\n>>\nendobj\ntrailer\n<<>>\n%%EOF\n',
    'utf-8'
  );

  let verifiedDocumentId: string;
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
    encryptionService = new AesGcmEncryptionService(encConfig.key, encConfig.keyVersion);
    const storageConfig = loadStorageConfig();
    storageService = new LocalEncryptedStorage(storageConfig.storageRootDir);

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

    verificationService = new DocumentVerificationService(
      docRepo,
      storageService,
      encryptionService,
      realBlockchainService
    );

    const docController = new DocumentController(
      docRepo,
      caseRepo,
      auditRepo,
      uploadService,
      sealingService,
      verificationService
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

    const pwdHash = await PasswordService.hashPassword('VerifyPass@123');

    // 4. Create test users
    const uMember = await userRepo.create({
      email: `verify-member-${testSuffix}@nyayavault.local`,
      name: 'Inspector Evidence Lead',
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
      email: `verify-nonmember-${testSuffix}@nyayavault.local`,
      name: 'Forensic Officer Foreign',
      passwordHash: pwdHash,
      role: 'FORENSIC_OFFICER',
    });
    nonMemberUserId = uNonMember.id;
    nonMemberToken = TokenService.generateToken({
      sub: uNonMember.id,
      email: uNonMember.email,
      role: 'FORENSIC_OFFICER',
      name: uNonMember.name,
    });

    const uAdmin = await userRepo.create({
      email: `verify-admin-${testSuffix}@nyayavault.local`,
      name: 'System Administrator Super',
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

    // 5. Create test cases
    const cA = await prisma.case.create({
      data: {
        caseNumber: `CRIME-VERIFY-A-${testSuffix}`,
        firNumber: `FIR-VA-${testSuffix}`,
        title: 'Active Case For Integrity Verification',
        department: 'Forensic Science Laboratory',
        policeStation: 'Central Station',
        classification: 'CONFIDENTIAL',
        status: 'ACTIVE',
        createdBy: memberUserId,
        members: {
          create: [{ userId: memberUserId, role: 'LEAD' }],
        },
      },
    });
    caseAId = cA.id;

    const cB = await prisma.case.create({
      data: {
        caseNumber: `CRIME-VERIFY-B-${testSuffix}`,
        firNumber: `FIR-VB-${testSuffix}`,
        title: 'Isolated Case For Security Barrier',
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
    caseBId = cB.id;
  });

  after(async () => {
    // 1. Cleanup created documents and their versions / audit / storage
    for (const docId of createdDocumentIds) {
      try {
        const versions = await prisma.documentVersion.findMany({ where: { documentId: docId } });
        for (const v of versions) {
          if (v.storageKey) {
            await storageService.delete(v.storageKey).catch(() => {});
          }
        }
        await prisma.blockchainAnchor.deleteMany({ where: { documentId: docId } });
        await prisma.auditEvent.deleteMany({ where: { documentId: docId } });
        await prisma.documentVersion.deleteMany({ where: { documentId: docId } });
        await prisma.document.deleteMany({ where: { id: docId } });
      } catch {}
    }

    // 2. Cleanup cases and members
    if (caseAId) {
      await prisma.caseMember.deleteMany({ where: { caseId: caseAId } });
      await prisma.case.deleteMany({ where: { id: caseAId } });
    }
    if (caseBId) {
      await prisma.caseMember.deleteMany({ where: { caseId: caseBId } });
      await prisma.case.deleteMany({ where: { id: caseBId } });
    }

    // 3. Cleanup test users
    const userIds = [memberUserId, nonMemberUserId, adminUserId].filter(Boolean);
    if (userIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }

    // 4. Close server
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    // 5. Terminate local Hardhat process if started by this suite
    if (hardhatProcess) {
      hardhatProcess.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 500));
      if (!hardhatProcess.killed) {
        hardhatProcess.kill('SIGKILL');
      }
    }
  });

  // Helper to upload a fresh PDF to caseA
  async function uploadTestDocument(title: string = 'Forensic Report'): Promise<string> {
    const formData = new FormData();
    const fileBlob = new Blob([validPdfBytes], { type: 'application/pdf' });
    formData.append('file', fileBlob, 'forensic-report.pdf');
    formData.append('title', title);
    formData.append('documentType', 'FORENSIC_REPORT');
    formData.append('classification', 'CONFIDENTIAL');

    const res = await fetch(`${baseUrl}/api/cases/${caseAId}/documents`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${memberToken}`,
      },
      body: formData,
    });

    assert.equal(res.status, 201, 'Upload must succeed with 201');
    const json = (await res.json()) as { id: string };
    createdDocumentIds.push(json.id);
    return json.id;
  }

  // Helper to seal a document
  async function sealTestDocument(docId: string, token: string = memberToken): Promise<void> {
    const res = await fetch(`${baseUrl}/api/documents/${docId}/seal`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    assert.equal(res.status, 200, 'Seal must succeed with 200');
  }

  // ==========================================================================
  // 1. Primary Success Path: Unchanged Sealed Document
  // ==========================================================================
  describe('Primary Success Path: Unchanged Sealed Document', () => {
    let docId: string;
    const expectedPlaintextSha256 = calculateSha256(validPdfBytes);

    before(async () => {
      docId = await uploadTestDocument('Primary Verified Forensic Report');
      verifiedDocumentId = docId;
      await sealTestDocument(docId);
    });

    it('1. returns 200 OK with status VERIFIED for an authentic sealed document', async () => {
      const res = await fetch(`${baseUrl}/api/documents/${docId}/verify`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${memberToken}`,
          'Content-Type': 'application/json',
        },
      });

      assert.equal(res.status, 200);
      const data = (await res.json()) as {
        status: string;
        originalHash: string;
        currentHash: string;
        blockchainHash: string;
        blockchainTxId: string;
        timestamp: string;
      };

      assert.equal(data.status, 'VERIFIED');
      assert.equal(data.originalHash, expectedPlaintextSha256);
      assert.equal(data.currentHash, expectedPlaintextSha256);
      assert.equal(data.blockchainHash, expectedPlaintextSha256);
      assert.ok(data.blockchainTxId && data.blockchainTxId.startsWith('0x'));
      assert.ok(data.timestamp);
    });

    it('2. confirms zero persistent mutation in PostgreSQL and storage after verification', async () => {
      const version = await prisma.documentVersion.findFirst({
        where: { documentId: docId },
        orderBy: { versionNumber: 'desc' },
      });

      assert.ok(version);
      assert.equal(version.status, 'SEALED');
      assert.equal(version.sha256Hash, expectedPlaintextSha256);
      assert.equal(version.blockchainStatus, 'ANCHORED');
      assert.ok(version.blockchainTxHash);
      assert.ok(version.sealedAt);
      assert.equal(version.sealedBy, memberUserId);

      // Verify blockchain_anchors table is intact
      const anchor = await prisma.blockchainAnchor.findFirst({
        where: { documentId: docId },
      });
      assert.ok(anchor);
      assert.equal(anchor.documentHash, expectedPlaintextSha256);
      assert.equal(anchor.transactionId, version.blockchainTxHash);
    });

    it('3. audit hash chain remains valid and unmodified after verification', async () => {
      const events = await auditRepo.listByDocument(docId);
      assert.equal(events.length, 2, 'Must have exactly DOCUMENT_UPLOADED and DOCUMENT_SEALED');
      assert.equal(events[0].eventType, 'DOCUMENT_UPLOADED');
      assert.equal(events[1].eventType, 'DOCUMENT_SEALED');

      const chainCheck = await auditService.verifyAuditChain(docId);
      assert.equal(chainCheck.valid, true);
    });
  });

  // ==========================================================================
  // 2. Tamper Detection & Immutability Proof
  // ==========================================================================
  describe('Tamper Detection & Immutability Proof', () => {
    let docId: string;
    let originalSha256: string;
    let tamperedSha256: string;

    before(async () => {
      docId = await uploadTestDocument('Tamper Test Evidence');
      await sealTestDocument(docId);

      const version = await prisma.documentVersion.findFirst({
        where: { documentId: docId },
        orderBy: { versionNumber: 'desc' },
      });
      assert.ok(version && version.storageKey && version.sha256Hash);
      originalSha256 = version.sha256Hash;

      // Tamper with the encrypted artifact on disk:
      // Decrypt or provide modified plaintext bytes, re-encrypt with valid AES-GCM, and overwrite stored file.
      // The database remains untouched!
      const tamperedPlaintext = Buffer.from(
        '%PDF-1.4\n1 0 obj\n<<\n/Title (FORGED TOXICOLOGY FINDINGS: ALTERED REPORT)\n>>\nendobj\ntrailer\n<<>>\n%%EOF\n',
        'utf-8'
      );
      tamperedSha256 = calculateSha256(tamperedPlaintext);

      const encPayload = await encryptionService.encrypt(tamperedPlaintext);
      const serialized = serializeEncryptedPayload(encPayload);
      await storageService.put(version.storageKey, serialized);
    });

    it('4. detects tampered storage bytes and returns 200 OK with status MISMATCH', async () => {
      const res = await fetch(`${baseUrl}/api/documents/${docId}/verify`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${memberToken}`,
          'Content-Type': 'application/json',
        },
      });

      assert.equal(res.status, 200);
      const data = (await res.json()) as {
        status: string;
        originalHash: string;
        currentHash: string;
        blockchainHash: string;
        blockchainTxId: string;
        message?: string;
      };

      assert.equal(data.status, 'MISMATCH');
      assert.equal(data.originalHash, originalSha256);
      assert.equal(data.currentHash, tamperedSha256);
      assert.notEqual(data.currentHash, data.originalHash);
      assert.ok(data.message && data.message.includes('Document bytes mismatch'));
    });

    it('5. asserts database trusted state is NOT mutated by tamper detection', async () => {
      const version = await prisma.documentVersion.findFirst({
        where: { documentId: docId },
        orderBy: { versionNumber: 'desc' },
      });

      assert.ok(version);
      // Trusted hash MUST remain the original sealed hash
      assert.equal(version.sha256Hash, originalSha256);
      assert.equal(version.status, 'SEALED');
      assert.equal(version.blockchainStatus, 'ANCHORED');

      // Assert no new audit events created
      const events = await auditRepo.listByDocument(docId);
      assert.equal(events.length, 2);
    });
  });

  // ==========================================================================
  // 3. Blockchain Inconsistency & Contradiction
  // ==========================================================================
  describe('Blockchain Inconsistency & Contradiction', () => {
    it('6. returns MISMATCH when blockchain anchor hash contradicts trusted sealed hash', async () => {
      const docId = await uploadTestDocument('Contradictory Blockchain Test Doc');
      await sealTestDocument(docId);

      const version = await prisma.documentVersion.findFirst({
        where: { documentId: docId },
        orderBy: { versionNumber: 'desc' },
      });
      assert.ok(version && version.sha256Hash);

      // Create a test double blockchain service that returns a contradictory anchor hash
      const contradictoryBlockchainService: BlockchainService = {
        anchorDocument: async () => {
          throw new Error('Not implemented in test double');
        },
        getAnchor: async (dId: string, vId: number): Promise<BlockchainAnchor | null> => {
          return {
            documentId: dId,
            versionId: vId,
            documentHash: '000000000000000000000000000000000000000000000000000000000000dead',
            eventType: EVENT_DOCUMENT_SEALED_HASH,
            actor: '0x1111111111111111111111111111111111111111',
            timestamp: Math.floor(Date.now() / 1000),
            transactionId: '0xcontradictorytxhash',
          };
        },
        verifyAnchor: (docHash: string, anchor: BlockchainAnchor): boolean => {
          return docHash.toLowerCase() === anchor.documentHash.toLowerCase();
        },
      };

      const customVerificationService = new DocumentVerificationService(
        docRepo,
        storageService,
        encryptionService,
        contradictoryBlockchainService
      );

      const result = await customVerificationService.verifyDocument(docId);
      assert.equal(result.status, 'MISMATCH');
      assert.equal(result.originalHash, version.sha256Hash);
      assert.equal(result.blockchainHash, '000000000000000000000000000000000000000000000000000000000000dead');
      assert.ok(result.message && result.message.includes('Blockchain anchor hash contradicts'));
    });

    it('7. returns MISMATCH when blockchain anchor is missing for a sealed document', async () => {
      const docId = await uploadTestDocument('Missing Anchor Test Doc');
      await sealTestDocument(docId);

      // Blockchain service that returns null anchor
      const missingAnchorBlockchainService: BlockchainService = {
        anchorDocument: async () => {
          throw new Error('Not implemented');
        },
        getAnchor: async (): Promise<BlockchainAnchor | null> => null,
        verifyAnchor: () => false,
      };

      const customVerificationService = new DocumentVerificationService(
        docRepo,
        storageService,
        encryptionService,
        missingAnchorBlockchainService
      );

      const result = await customVerificationService.verifyDocument(docId);
      assert.equal(result.status, 'MISMATCH');
      assert.ok(result.message && result.message.includes('Blockchain anchor proof missing'));
    });
  });

  // ==========================================================================
  // 4. Infrastructure Failures vs Tampering (Strict Classification)
  // ==========================================================================
  describe('Infrastructure Failures vs Tampering (Strict Classification)', () => {
    it('8. returns ERROR (never MISMATCH) when blockchain RPC is unavailable', async () => {
      const docId = await uploadTestDocument('RPC Down Test Doc');
      await sealTestDocument(docId);

      const failingBlockchainService: BlockchainService = {
        anchorDocument: async () => {
          throw new Error('Not implemented');
        },
        getAnchor: async () => {
          throw new BlockchainUnavailableError('Connection refused to JSON-RPC node on 127.0.0.1:8546');
        },
        verifyAnchor: () => false,
      };

      const customVerificationService = new DocumentVerificationService(
        docRepo,
        storageService,
        encryptionService,
        failingBlockchainService
      );

      const customDocController = new DocumentController(
        docRepo,
        caseRepo,
        auditRepo,
        uploadService,
        sealingService,
        customVerificationService
      );

      const customApp = createApp({
        enableLogging: false,
        documentController: customDocController,
      });
      const customServer = createServer(customApp);
      await new Promise<void>((r) => customServer.listen(0, '127.0.0.1', () => r()));
      const customPort = (customServer.address() as AddressInfo).port;

      try {
        const res = await fetch(`http://127.0.0.1:${customPort}/api/documents/${docId}/verify`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${memberToken}`,
            'Content-Type': 'application/json',
          },
        });

        assert.equal(res.status, 200);
        const data = (await res.json()) as { status: string; message?: string };
        assert.equal(data.status, 'ERROR');
        assert.ok(data.message && data.message.includes('Blockchain verification unavailable'));

        // Document MUST still remain SEALED in PostgreSQL
        const version = await prisma.documentVersion.findFirst({
          where: { documentId: docId },
        });
        assert.equal(version?.status, 'SEALED');
      } finally {
        await new Promise<void>((r) => customServer.close(() => r()));
      }
    });

    it('9. returns ERROR when encrypted storage is corrupted or authentication tag fails', async () => {
      const docId = await uploadTestDocument('Corrupted Storage Test Doc');
      await sealTestDocument(docId);

      const version = await prisma.documentVersion.findFirst({
        where: { documentId: docId },
      });
      assert.ok(version && version.storageKey);

      // Overwrite storage object with corrupted garbage bytes (invalid JSON / broken auth tag)
      await storageService.put(version.storageKey, Buffer.from('corrupted_garbage_bytes_not_valid_envelope'));

      const res = await fetch(`${baseUrl}/api/documents/${docId}/verify`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${memberToken}`,
          'Content-Type': 'application/json',
        },
      });

      assert.equal(res.status, 200);
      const data = (await res.json()) as { status: string; message?: string };
      assert.equal(data.status, 'ERROR');
      assert.ok(data.message && data.message.includes('Decryption failed'));

      // Assert DB state is unchanged
      const checkVersion = await prisma.documentVersion.findFirst({
        where: { documentId: docId },
      });
      assert.equal(checkVersion?.status, 'SEALED');
    });
  });

  // ==========================================================================
  // 5. State Machine: Unsealed DRAFT Verification Rejection
  // ==========================================================================
  describe('State Machine: Unsealed DRAFT Verification Rejection', () => {
    it('10. rejects verification on a DRAFT document with 409 Conflict (DOCUMENT_NOT_SEALED)', async () => {
      const draftDocId = await uploadTestDocument('Unsealed Draft Evidence File');

      const res = await fetch(`${baseUrl}/api/documents/${draftDocId}/verify`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${memberToken}`,
          'Content-Type': 'application/json',
        },
      });

      assert.equal(res.status, 409);
      const body = (await res.json()) as { error: { code: string; message: string } };
      assert.equal(body.error.code, 'DOCUMENT_NOT_SEALED');
      assert.ok(body.error.message.includes('Only SEALED documents can be verified'));
    });
  });

  // ==========================================================================
  // 6. Authorization & Anti-Enumeration Security
  // ==========================================================================
  describe('Authorization & Anti-Enumeration Security', () => {
    it('11. returns 401 Unauthorized for unauthenticated verification requests', async () => {
      const res = await fetch(`${baseUrl}/api/documents/${verifiedDocumentId}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      assert.equal(res.status, 401);
      const body = (await res.json()) as { error: { code: string } };
      assert.equal(body.error.code, 'UNAUTHORIZED');
    });

    it('12. returns 404 Not Found anti-enumeration policy when non-member verifies foreign document', async () => {
      const res = await fetch(`${baseUrl}/api/documents/${verifiedDocumentId}/verify`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${nonMemberToken}`,
          'Content-Type': 'application/json',
        },
      });

      assert.equal(res.status, 404);
      const body = (await res.json()) as { error: { code: string } };
      assert.equal(body.error.code, 'DOCUMENT_NOT_FOUND');
    });

    it('13. returns 404 Not Found for nonexistent document ID', async () => {
      const res = await fetch(`${baseUrl}/api/documents/nonexistent-doc-uuid/verify`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${memberToken}`,
          'Content-Type': 'application/json',
        },
      });

      assert.equal(res.status, 404);
      const body = (await res.json()) as { error: { code: string } };
      assert.equal(body.error.code, 'DOCUMENT_NOT_FOUND');
    });

    it('14. allows ADMIN to verify document via explicit global case override', async () => {
      const res = await fetch(`${baseUrl}/api/documents/${verifiedDocumentId}/verify`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
      });

      assert.equal(res.status, 200);
      const data = (await res.json()) as { status: string };
      assert.equal(data.status, 'VERIFIED');
    });

    it('15. ignores any identity fields passed in request body', async () => {
      const res = await fetch(`${baseUrl}/api/documents/${verifiedDocumentId}/verify`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${memberToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: 'spoofed_admin_id',
          actorId: 'spoofed_actor_id',
          verifiedBy: 'spoofed_name',
        }),
      });

      assert.equal(res.status, 200);
      const data = (await res.json()) as { status: string };
      assert.equal(data.status, 'VERIFIED');
    });
  });

  // ==========================================================================
  // 7. Secret Non-Exposure
  // ==========================================================================
  describe('Secret Non-Exposure', () => {
    it('16. verification response never leaks internal storage paths, encryption keys, IVs, or auth tags', async () => {
      const res = await fetch(`${baseUrl}/api/documents/${verifiedDocumentId}/verify`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${memberToken}`,
          'Content-Type': 'application/json',
        },
      });

      assert.equal(res.status, 200);
      const rawText = await res.text();

      assert.equal(rawText.includes('storageKey'), false);
      assert.equal(rawText.includes('.bin'), false);
      assert.equal(rawText.includes('iv'), false);
      assert.equal(rawText.includes('authTag'), false);
      assert.equal(rawText.includes('encryptionKey'), false);
      assert.equal(rawText.includes('AES_256_GCM'), false);
    });
  });

  // ==========================================================================
  // 8. Read API Regression
  // ==========================================================================
  describe('Read API Regression (M3-05A/B compatibility)', () => {
    it('17. GET /api/documents/:id continues to report SEALED with identical trusted hash after verification', async () => {
      const res = await fetch(`${baseUrl}/api/documents/${verifiedDocumentId}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${memberToken}`,
        },
      });

      assert.equal(res.status, 200);
      const body = (await res.json()) as { status: string; sha256: string; blockchainStatus: string };
      assert.equal(body.status, 'SEALED');
      assert.equal(body.sha256, calculateSha256(validPdfBytes));
      assert.equal(body.blockchainStatus, 'ANCHORED');
    });

    it('18. GET /api/documents/:id/versions reports unchanged version list', async () => {
      const res = await fetch(`${baseUrl}/api/documents/${verifiedDocumentId}/versions`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${memberToken}`,
        },
      });

      assert.equal(res.status, 200);
      const versions = (await res.json()) as Array<{ status: string; version: number }>;
      assert.equal(versions.length, 1);
      assert.equal(versions[0].status, 'SEALED');
      assert.equal(versions[0].version, 1);
    });

    it('19. GET /api/documents/:id/audit retains unbroken audit chain with original upload/seal events', async () => {
      const res = await fetch(`${baseUrl}/api/documents/${verifiedDocumentId}/audit`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${memberToken}`,
        },
      });

      assert.equal(res.status, 200);
      const body = (await res.json()) as { events: Array<{ action: string }> };
      assert.equal(body.events.length, 2);
      assert.equal(body.events[0].action, 'DOCUMENT_UPLOADED');
      assert.equal(body.events[1].action, 'DOCUMENT_SEALED');
    });
  });
});
