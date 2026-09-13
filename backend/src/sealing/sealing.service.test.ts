import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import cp from 'node:child_process';
import { JsonRpcProvider, Wallet, ContractFactory } from 'ethers';
import { DocumentSealingService } from './sealing.service.js';
import { InMemoryDocumentRepository } from './in-memory-document.repository.js';
import { AuditService } from '../audit/audit.service.js';
import { InMemoryAuditRepository } from '../audit/in-memory-audit.repository.js';
import { AesGcmEncryptionService } from '../encryption/aes-gcm.service.js';
import { serializeEncryptedPayload } from '../encryption/encryption.types.js';
import { LocalEncryptedStorage } from '../storage/local-encrypted-storage.js';
import { calculateSha256 } from '../integrity/hash.service.js';
import { EthersBlockchainService } from '../blockchain/ethers-blockchain.service.js';
import type { BlockchainService } from '../blockchain/blockchain.types.js';
import {
  DocumentNotFoundError,
  DocumentAlreadySealedError,
  FileNotFoundError,
  DecryptionFailedError,
  BlockchainUnavailableError,
} from '../errors/domain.errors.js';
import type { DocumentVersionRecord } from './sealing.types.js';

describe('Sealing Service: DocumentSealingService with Real Blockchain Anchoring', () => {
  const RPC_URL = 'http://127.0.0.1:8546';
  const TEST_SIGNER_PRIVATE_KEY =
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

  // Test storage root
  const testStorageDir = path.join(os.tmpdir(), `nyayavault_seal_test_${Date.now()}`);

  // 32-byte deterministic test key
  const testKey = Buffer.from('abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789', 'hex');

  let hardhatProcess: cp.ChildProcess | null = null;
  let provider: JsonRpcProvider;
  let signer: Wallet;
  let deployedContractAddress: string;
  let realBlockchainService: EthersBlockchainService;

  let documentRepo: InMemoryDocumentRepository;
  let auditRepo: InMemoryAuditRepository;
  let auditService: AuditService;
  let encryptionService: AesGcmEncryptionService;
  let storageService: LocalEncryptedStorage;
  let sealingService: DocumentSealingService;

  const mockTime = new Date('2026-09-12T12:00:00.000Z');

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
    await fs.promises.mkdir(testStorageDir, { recursive: true });

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


    // 2. Setup provider and signer
    provider = new JsonRpcProvider(RPC_URL);
    signer = new Wallet(TEST_SIGNER_PRIVATE_KEY, provider);

    // 3. Deploy a fresh disposable DocumentIntegrityRegistry instance
    const blockchainDir = path.resolve(process.cwd(), '../blockchain');
    const artifactPath = path.resolve(
      blockchainDir,
      'artifacts/contracts/DocumentIntegrityRegistry.sol/DocumentIntegrityRegistry.json'
    );
    const artifact = JSON.parse(await fs.promises.readFile(artifactPath, 'utf-8'));

    const factory = new ContractFactory(artifact.abi, artifact.bytecode, signer);
    const contract = await factory.deploy();
    await contract.waitForDeployment();
    deployedContractAddress = await contract.getAddress();

    // 4. Initialize real EthersBlockchainService
    realBlockchainService = new EthersBlockchainService({
      contractAddress: deployedContractAddress,
      runner: signer,
    });
  });

  after(async () => {
    if (hardhatProcess) {
      hardhatProcess.kill();
    }
    try {
      await fs.promises.rm(testStorageDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  beforeEach(() => {
    documentRepo = new InMemoryDocumentRepository();
    auditRepo = new InMemoryAuditRepository();
    auditService = new AuditService(auditRepo);
    encryptionService = new AesGcmEncryptionService(testKey, 'v1');
    storageService = new LocalEncryptedStorage(testStorageDir);
    sealingService = new DocumentSealingService(
      documentRepo,
      storageService,
      encryptionService,
      auditService,
      realBlockchainService,
      () => mockTime
    );
  });

  // Helper to store an encrypted document artifact and register DRAFT version
  async function setupDraftDocument(
    documentId: string,
    plaintext: Buffer,
    versionNumber: number = 1
  ): Promise<{ doc: DocumentVersionRecord; expectedSha256: string }> {
    const expectedSha256 = calculateSha256(plaintext);
    const encryptedPayload = await encryptionService.encrypt(plaintext);
    const storageKey = `documents/${documentId}/v${versionNumber}/payload.enc`;

    // Persist encrypted payload
    await storageService.put(storageKey, serializeEncryptedPayload(encryptedPayload));

    // Register initial DRAFT version in repository
    const doc: DocumentVersionRecord = {
      id: `ver_${documentId}_${versionNumber}`,
      documentId,
      versionNumber,
      storageKey,
      status: 'DRAFT',
      createdBy: 'usr_investigator_1',
      createdAt: '2026-09-12T11:00:00.000Z',
    };
    await documentRepo.save(doc);

    // Initial DOCUMENT_UPLOADED audit event
    await auditService.createEvent({
      eventType: 'DOCUMENT_UPLOADED',
      actorId: 'usr_investigator_1',
      documentId,
      versionId: doc.id,
      timestamp: '2026-09-12T11:00:00.000Z',
    });

    return { doc, expectedSha256 };
  }

  // ==========================================================================
  // SECTION 1: SUCCESS TESTS (Assertions 1-12)
  // ==========================================================================
  describe('Primary Success Path with Real Hardhat Blockchain Integration', () => {
    it('should seal a DRAFT document, calculate SHA-256 from plaintext, create audit event, and anchor on-chain', async () => {
      const documentId = 'doc_primary_success_001';
      const originalPlaintext = Buffer.from(
        'Forensic Laboratory Ballistics Report - Case 8842 Verified',
        'utf-8'
      );

      const { expectedSha256 } = await setupDraftDocument(documentId, originalPlaintext);

      // Execute Sealing with Real Blockchain Anchor
      const result = await sealingService.sealDocument(documentId, 'usr_inspector_sharma');

      // 1. DRAFT document seals successfully
      assert.ok(result);

      // 2. SHA-256 is calculated from original plaintext bytes
      assert.equal(result.version.sha256Hash, expectedSha256);

      // 3. Document status becomes SEALED
      assert.equal(result.version.status, 'SEALED');

      // 4. sealedAt is recorded
      assert.equal(result.version.sealedAt, mockTime.toISOString());

      // 5. sealedBy is recorded
      assert.equal(result.version.sealedBy, 'usr_inspector_sharma');

      // 6. DOCUMENT_SEALED audit event is created
      const events = await auditService.listEvents(documentId);
      assert.equal(events.length, 2);
      assert.equal(events[1].eventType, 'DOCUMENT_SEALED');
      assert.equal(events[1].actorId, 'usr_inspector_sharma');
      assert.equal(events[1].metadata?.sha256Hash, expectedSha256);

      // 7. BlockchainService receives the exact sealed SHA-256
      // 8. Real blockchain anchor is created
      assert.ok(result.blockchain.anchor);
      assert.equal(result.blockchain.anchor.documentId, documentId);
      assert.equal(result.blockchain.anchor.versionId, 1);

      // 9. Returned transaction hash is present
      assert.ok(result.blockchain.transactionHash);
      assert.match(result.blockchain.transactionHash, /^0x[0-9a-fA-F]{64}$/);
      assert.equal(result.version.blockchainTxHash, result.blockchain.transactionHash);

      // 10. Blockchain status becomes ANCHORED
      assert.equal(result.blockchain.status, 'ANCHORED');
      assert.equal(result.version.blockchainStatus, 'ANCHORED');

      // 11. Returned anchor hash matches sealed hash
      assert.equal(result.blockchain.anchor.documentHash, expectedSha256);

      // Also verify on-chain getAnchor matches
      const onChainAnchor = await realBlockchainService.getAnchor(documentId, 1);
      assert.ok(onChainAnchor);
      assert.equal(onChainAnchor.documentHash, expectedSha256);

      // 12. Audit chain remains valid
      const chainVerification = await auditService.verifyAuditChain(documentId);
      assert.equal(chainVerification.valid, true);
    });
  });

  // ==========================================================================
  // SECTION 2: FAILURE TESTS (Assertions 13-17)
  // ==========================================================================
  describe('Blockchain Failure Isolation & Resilience', () => {
    it('should keep document SEALED and audit trail intact when blockchain is unavailable', async () => {
      const documentId = 'doc_failure_resilience_001';
      const originalPlaintext = Buffer.from('Confidential Witness Statement - Crime Branch', 'utf-8');

      const { expectedSha256 } = await setupDraftDocument(documentId, originalPlaintext);

      // Create a sealing service wired to an unreachable blockchain endpoint
      const unreachableProvider = new JsonRpcProvider('http://127.0.0.1:59999', 31337n, {
        staticNetwork: true,
        batchMaxCount: 1,
      });
      const failingBlockchainService = new EthersBlockchainService({
        contractAddress: deployedContractAddress,
        runner: unreachableProvider,
      });

      const resilientSealingService = new DocumentSealingService(
        documentRepo,
        storageService,
        encryptionService,
        auditService,
        failingBlockchainService,
        () => mockTime
      );

      try {
        const result = await resilientSealingService.sealDocument(documentId, 'usr_officer_verma');

        // 13. Blockchain unavailable does NOT destroy the document
        const persistedDoc = await documentRepo.findById(documentId);
        assert.ok(persistedDoc, 'Document record must still exist in repository');

        // 14. Document remains SEALED if blockchain anchoring fails
        assert.equal(result.version.status, 'SEALED');
        assert.equal(persistedDoc.status, 'SEALED');
        assert.equal(result.version.sha256Hash, expectedSha256);

        // 15. Audit event remains present if blockchain anchoring fails
        const events = await auditService.listEvents(documentId);
        assert.equal(events.length, 2);
        assert.equal(events[1].eventType, 'DOCUMENT_SEALED');
        assert.equal(events[1].actorId, 'usr_officer_verma');

        // 16. Blockchain status is explicitly FAILED
        assert.equal(result.blockchain.status, 'FAILED');
        assert.equal(persistedDoc.blockchainStatus, 'FAILED');
        assert.ok(result.blockchain.error, 'Error details must be present');

        // 17. No fake transaction hash is returned
        assert.equal(result.blockchain.transactionHash, undefined);
        assert.equal(result.blockchain.anchor, undefined);
        assert.equal(persistedDoc.blockchainTxHash, undefined);

        // Audit chain integrity remains cryptographically valid
        const auditVerification = await auditService.verifyAuditChain(documentId);
        assert.equal(auditVerification.valid, true);
      } finally {
        unreachableProvider.destroy();
      }
    });

    it('should handle custom blockchain transaction errors cleanly without rolling back document', async () => {
      const documentId = 'doc_tx_failure_002';
      const originalPlaintext = Buffer.from('Financial Ledger Seizure - Bank Accounts', 'utf-8');

      await setupDraftDocument(documentId, originalPlaintext);

      // Create a mock BlockchainService that throws BlockchainUnavailableError
      const stubService: BlockchainService = {
        async anchorDocument() {
          throw new BlockchainUnavailableError('Simulated network connection dropped.');
        },
        async getAnchor() {
          return null;
        },
        verifyAnchor() {
          return false;
        },
      };

      const customSealingService = new DocumentSealingService(
        documentRepo,
        storageService,
        encryptionService,
        auditService,
        stubService,
        () => mockTime
      );

      const result = await customSealingService.sealDocument(documentId, 'usr_investigator');

      assert.equal(result.version.status, 'SEALED');
      assert.equal(result.blockchain.status, 'FAILED');
      assert.match(result.blockchain.error || '', /Simulated network connection dropped/);
      assert.equal(result.blockchain.transactionHash, undefined);

      const auditVerification = await auditService.verifyAuditChain(documentId);
      assert.equal(auditVerification.valid, true);
    });
  });

  // ==========================================================================
  // SECTION 3: IMMUTABILITY & DUPLICATE ANCHOR TESTS (Assertions 18-20)
  // ==========================================================================
  describe('Immutability and Duplicate Seal Prevention', () => {
    it('should reject a second seal attempt on an already sealed document (DocumentAlreadySealedError)', async () => {
      const documentId = 'doc_already_sealed_immutability';
      const plaintext = Buffer.from('Immutability Test Forensic Data', 'utf-8');

      await setupDraftDocument(documentId, plaintext);
      await sealingService.sealDocument(documentId, 'usr_inspector_1');

      const eventsBefore = await auditService.listEvents(documentId);

      // 18. Second seal attempt still produces DocumentAlreadySealedError
      await assert.rejects(
        async () => {
          await sealingService.sealDocument(documentId, 'usr_inspector_2');
        },
        (err: unknown) => {
          assert.ok(err instanceof DocumentAlreadySealedError);
          assert.equal((err as DocumentAlreadySealedError).code, 'DOCUMENT_ALREADY_SEALED');
          return true;
        }
      );

      // 19. Second seal attempt does not create another audit event
      const eventsAfter = await auditService.listEvents(documentId);
      assert.equal(eventsAfter.length, eventsBefore.length);

      // 20. Second seal attempt does not create another blockchain anchor
      const onChainAnchor = await realBlockchainService.getAnchor(documentId, 1);
      assert.ok(onChainAnchor);
      assert.equal(onChainAnchor.versionId, 1);
    });

    it('should reject a second seal attempt even if the first seal experienced a blockchain failure', async () => {
      const documentId = 'doc_failed_blockchain_no_reseal';
      const plaintext = Buffer.from('Chain of Custody Log Entry', 'utf-8');

      await setupDraftDocument(documentId, plaintext);

      // First seal fails on blockchain
      const stubService: BlockchainService = {
        async anchorDocument() {
          throw new BlockchainUnavailableError('Temporary RPC timeout.');
        },
        async getAnchor() {
          return null;
        },
        verifyAnchor() {
          return false;
        },
      };

      const failingSealingService = new DocumentSealingService(
        documentRepo,
        storageService,
        encryptionService,
        auditService,
        stubService,
        () => mockTime
      );

      const firstResult = await failingSealingService.sealDocument(documentId, 'usr_officer_1');
      assert.equal(firstResult.version.status, 'SEALED');
      assert.equal(firstResult.blockchain.status, 'FAILED');

      const eventsCount = (await auditService.listEvents(documentId)).length;

      // Second seal attempt must reject with DocumentAlreadySealedError (cannot reseal)
      await assert.rejects(
        async () => {
          await sealingService.sealDocument(documentId, 'usr_officer_2');
        },
        (err: unknown) => {
          assert.ok(err instanceof DocumentAlreadySealedError);
          return true;
        }
      );

      const eventsAfter = (await auditService.listEvents(documentId)).length;
      assert.equal(eventsAfter, eventsCount);
    });
  });

  // ==========================================================================
  // SECTION 4: STORAGE AND CRYPTOGRAPHIC ERROR CONDITIONS
  // ==========================================================================
  describe('Storage and Decryption Errors', () => {
    it('should throw FileNotFoundError when storage payload is missing and keep document in DRAFT', async () => {
      const documentId = 'doc_missing_file_001';
      const doc: DocumentVersionRecord = {
        id: 'ver_missing',
        documentId,
        versionNumber: 1,
        storageKey: 'documents/missing/payload.enc',
        status: 'DRAFT',
        createdBy: 'usr_1',
        createdAt: '2026-09-12T10:00:00.000Z',
      };
      await documentRepo.save(doc);

      await assert.rejects(
        async () => {
          await sealingService.sealDocument(documentId, 'usr_1');
        },
        (err: unknown) => {
          assert.ok(err instanceof FileNotFoundError);
          assert.equal((err as FileNotFoundError).code, 'FILE_NOT_FOUND');
          return true;
        }
      );

      const after = await documentRepo.findById(documentId);
      assert.equal(after?.status, 'DRAFT');
    });

    it('should throw DecryptionFailedError when stored bytes fail authentication and keep document in DRAFT', async () => {
      const documentId = 'doc_corrupt_file_001';
      const plaintext = Buffer.from('Tampered ciphertext test', 'utf-8');
      const { doc } = await setupDraftDocument(documentId, plaintext);

      // Corrupt authentication tag
      const rawStored = await storageService.get(doc.storageKey);
      const jsonEnvelope = JSON.parse(rawStored.toString('utf-8'));
      jsonEnvelope.tag = 'ffffffffffffffffffffffffffffffff';
      await storageService.put(doc.storageKey, Buffer.from(JSON.stringify(jsonEnvelope), 'utf-8'));

      await assert.rejects(
        async () => {
          await sealingService.sealDocument(documentId, 'usr_inspector');
        },
        (err: unknown) => {
          assert.ok(err instanceof DecryptionFailedError);
          assert.equal((err as DecryptionFailedError).code, 'DECRYPTION_FAILED');
          return true;
        }
      );

      const after = await documentRepo.findById(documentId);
      assert.equal(after?.status, 'DRAFT');
    });

    it('should throw DocumentNotFoundError when documentId does not exist', async () => {
      await assert.rejects(
        async () => {
          await sealingService.sealDocument('non_existent_document_id', 'usr_1');
        },
        (err: unknown) => {
          assert.ok(err instanceof DocumentNotFoundError);
          assert.equal((err as DocumentNotFoundError).code, 'DOCUMENT_NOT_FOUND');
          return true;
        }
      );
    });

    it('should throw TypeError when actorId is empty or whitespace', async () => {
      await assert.rejects(
        async () => {
          await sealingService.sealDocument('doc_1', '');
        },
        TypeError
      );
      await assert.rejects(
        async () => {
          await sealingService.sealDocument('doc_1', '   ');
        },
        TypeError
      );
    });
  });
});

