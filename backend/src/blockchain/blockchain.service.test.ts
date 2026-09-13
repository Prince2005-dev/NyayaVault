import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import cp, { type ChildProcess } from 'node:child_process';
import {
  JsonRpcProvider,
  Wallet,
  ContractFactory,
} from 'ethers';
import { EthersBlockchainService } from './ethers-blockchain.service.js';
import {
  encodeDocumentId,
  formatDocumentHash,
  encodeEventType,
  validateVersionId,
} from './encoding.utils.js';
import {
  EVENT_DOCUMENT_SEALED_HASH,
  EVENT_DOCUMENT_SEALED_NAME,
} from './blockchain.types.js';
import {
  BlockchainAnchorAlreadyExistsError,
  BlockchainUnavailableError,
  InvalidDocumentHashError,
  InvalidDocumentIdError,
} from '../errors/domain.errors.js';

describe('Blockchain Service: EthersBlockchainService & Encodings', () => {
  // ============================================================================
  // PART 1: PURE UNIT TESTS (Encoding, Validation & Pure Verification)
  // ============================================================================

  describe('Deterministic ID & Hash Encoding', () => {
    // Test 1: Same document ID -> same bytes32
    it('should deterministically produce identical bytes32 values for identical document IDs', () => {
      const docId = 'doc_case_fir_2026_001';
      const hash1 = encodeDocumentId(docId);
      const hash2 = encodeDocumentId(docId);

      assert.equal(hash1, hash2);
      assert.match(hash1, /^0x[0-9a-f]{64}$/);
    });

    // Test 2: Different document IDs -> different bytes32
    it('should produce distinct bytes32 values for different document IDs (collision resistant)', () => {
      const idA = 'doc_evidence_a';
      const idB = 'doc_evidence_b';

      const hashA = encodeDocumentId(idA);
      const hashB = encodeDocumentId(idB);

      assert.notEqual(hashA, hashB);
    });

    // Test 3: Valid SHA-256 converts correctly to 0x-prefixed 32-byte hex
    it('should validate and format a 64-character SHA-256 hexadecimal string correctly', () => {
      const validSha256 = '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824';
      const formatted = formatDocumentHash(validSha256);

      assert.equal(formatted, `0x${validSha256}`);
      assert.equal(formatted.length, 66);
    });

    // Test 4: Malformed SHA-256 is rejected
    it('should reject malformed SHA-256 hashes (invalid length, non-hex characters)', () => {
      // Too short
      assert.throws(
        () => formatDocumentHash('abcdef'),
        (err: unknown) => err instanceof InvalidDocumentHashError
      );

      // Non-hex characters
      assert.throws(
        () => formatDocumentHash('zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz'),
        (err: unknown) => err instanceof InvalidDocumentHashError
      );

      // Empty string
      assert.throws(
        () => formatDocumentHash(''),
        (err: unknown) => err instanceof InvalidDocumentHashError
      );
    });

    // Test 5: DOCUMENT_SEALED encoding matches contract constant keccak256("DOCUMENT_SEALED")
    it('should encode DOCUMENT_SEALED matching the contract EVENT_DOCUMENT_SEALED constant', () => {
      const encoded = encodeEventType(EVENT_DOCUMENT_SEALED_NAME);
      assert.equal(encoded, EVENT_DOCUMENT_SEALED_HASH);
      assert.equal(
        encoded,
        '0x075038a8db53194dff85c85039c9039b8a05ecd78d2c6f4e6f6eceb5d5969197'
      );

      // Default with undefined also produces EVENT_DOCUMENT_SEALED_HASH
      assert.equal(encodeEventType(undefined), EVENT_DOCUMENT_SEALED_HASH);
    });

    // Test 6: Document ID validation
    it('should reject empty or whitespace document IDs', () => {
      assert.throws(
        () => encodeDocumentId(''),
        (err: unknown) => err instanceof InvalidDocumentIdError
      );
      assert.throws(
        () => encodeDocumentId('   '),
        (err: unknown) => err instanceof InvalidDocumentIdError
      );
    });

    // Test 7: Version ID validation
    it('should validate versionId as a positive integer >= 1', () => {
      assert.equal(validateVersionId(1), 1n);
      assert.equal(validateVersionId(42), 42n);

      assert.throws(() => validateVersionId(0), RangeError);
      assert.throws(() => validateVersionId(-1), RangeError);
      assert.throws(() => validateVersionId(1.5), RangeError);
    });
  });

  describe('Pure Verification (verifyAnchor)', () => {
    // Create a lightweight adapter instance with a dummy runner for pure unit tests
    const dummyRunner = { provider: null };
    const dummyService = new EthersBlockchainService({
      contractAddress: '0x0000000000000000000000000000000000000001',
      runner: dummyRunner as unknown as import('ethers').ContractRunner,
    });

    // Test 8: Matching hash -> true
    it('should return true when document hash matches anchor hash (case-insensitively and with/without 0x)', () => {
      const rawSha256 = '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824';
      const anchor = {
        documentId: 'doc_1',
        versionId: 1,
        documentHash: rawSha256,
        eventType: EVENT_DOCUMENT_SEALED_HASH,
        actor: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        timestamp: 1726000000,
        transactionId: '0xabc123',
      };

      assert.equal(dummyService.verifyAnchor(rawSha256, anchor), true);
      assert.equal(dummyService.verifyAnchor(`0x${rawSha256.toUpperCase()}`, anchor), true);
    });

    // Test 9: Different hash -> false
    it('should return false when document hash does not match anchor hash', () => {
      const originalHash = '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824';
      const tamperedHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

      const anchor = {
        documentId: 'doc_1',
        versionId: 1,
        documentHash: originalHash,
        eventType: EVENT_DOCUMENT_SEALED_HASH,
        actor: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        timestamp: 1726000000,
        transactionId: '0xabc123',
      };

      assert.equal(dummyService.verifyAnchor(tamperedHash, anchor), false);
      assert.equal(dummyService.verifyAnchor('', anchor), false);
    });
  });

  // ============================================================================
  // PART 2: REAL LOCAL HARDHAT BLOCKCHAIN INTEGRATION TESTS
  // ============================================================================

  describe('Real Blockchain Integration (Hardhat Local Node & Disposable Contract)', () => {
    const RPC_URL = 'http://127.0.0.1:8545';
    // Hardhat standard test account #0 private key
    const TEST_SIGNER_PRIVATE_KEY =
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

    let hardhatProcess: cp.ChildProcess | null = null;
    let provider: JsonRpcProvider;
    let signer: Wallet;
    let deployedContractAddress: string;
    let service: EthersBlockchainService;

    // Helper: checks if RPC node is ready
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
      // 1. Check if Hardhat node is already running on port 8545
      const alreadyRunning = await isRpcReady();

      if (!alreadyRunning) {
        // Spawn local hardhat node child process
        const blockchainDir = path.resolve(process.cwd(), '../blockchain');
        const hardhatCli = path.resolve(blockchainDir, 'node_modules/hardhat/internal/cli/cli.js');

        hardhatProcess = cp.spawn('node', [hardhatCli, 'node'], {
          cwd: blockchainDir,
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        // Wait for JSON-RPC server ready signal
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

      // 2. Initialize provider and signer
      provider = new JsonRpcProvider(RPC_URL);
      signer = new Wallet(TEST_SIGNER_PRIVATE_KEY, provider);

      // 3. Deploy a fresh disposable DocumentIntegrityRegistry contract instance for this test run
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

      // 4. Initialize EthersBlockchainService
      service = new EthersBlockchainService({
        contractAddress: deployedContractAddress,
        runner: signer,
      });
    });

    after(() => {
      // Clean up child process if started by this test suite
      if (hardhatProcess) {
        hardhatProcess.kill();
      }
    });

    // Test 10: Connection and contract deployment verification
    it('should connect to freshly deployed local contract instance', async () => {
      assert.ok(deployedContractAddress);
      assert.match(deployedContractAddress, /^0x[0-9a-fA-F]{40}$/);
    });

    // Test 11: Real anchor transaction and event confirmation
    it('should anchor document with a real on-chain transaction and return valid transaction hash', async () => {
      const documentId = 'doc_court_evidence_101';
      const versionId = 1;
      const documentHash = '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824';

      const anchor = await service.anchorDocument({
        documentId,
        versionId,
        documentHash,
        eventType: EVENT_DOCUMENT_SEALED_NAME,
      });

      assert.ok(anchor);
      assert.equal(anchor.documentId, documentId);
      assert.equal(anchor.versionId, 1);
      assert.equal(anchor.documentHash, documentHash);
      assert.equal(anchor.eventType, EVENT_DOCUMENT_SEALED_HASH);
      assert.equal(anchor.actor.toLowerCase(), signer.address.toLowerCase());
      assert.ok(anchor.timestamp > 0, 'Timestamp must be positive EVM block timestamp');
      assert.match(anchor.transactionId, /^0x[0-9a-fA-F]{64}$/, 'Transaction ID must be valid 32-byte hex hash');
      assert.ok(anchor.blockNumber && anchor.blockNumber > 0);
    });

    // Test 12: Retrieval via getAnchor
    it('should retrieve accurate anchored data from chain matching submitted values', async () => {
      const documentId = 'doc_court_evidence_101';
      const versionId = 1;

      const retrieved = await service.getAnchor(documentId, versionId);

      assert.ok(retrieved);
      assert.equal(retrieved.documentId, documentId);
      assert.equal(retrieved.versionId, 1);
      assert.equal(
        retrieved.documentHash,
        '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
      );
      assert.equal(retrieved.eventType, EVENT_DOCUMENT_SEALED_HASH);
      assert.equal(retrieved.actor.toLowerCase(), signer.address.toLowerCase());
      assert.ok(retrieved.timestamp > 0);
    });

    // Test 13: Non-existent anchor returns null
    it('should return null when querying an unanchored document version', async () => {
      const result = await service.getAnchor('doc_non_existent_ghost', 1);
      assert.equal(result, null);
    });

    // Test 14: Duplicate anchor rejection
    it('should reject duplicate anchor attempts with BlockchainAnchorAlreadyExistsError', async () => {
      const documentId = 'doc_court_evidence_101';
      const versionId = 1;
      const duplicateHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

      await assert.rejects(
        async () => {
          await service.anchorDocument({
            documentId,
            versionId,
            documentHash: duplicateHash,
          });
        },
        (err: unknown) => {
          assert.ok(
            err instanceof BlockchainAnchorAlreadyExistsError,
            `Expected BlockchainAnchorAlreadyExistsError, got: ${err}`
          );
          assert.equal(
            (err as BlockchainAnchorAlreadyExistsError).code,
            'BLOCKCHAIN_ANCHOR_ALREADY_EXISTS'
          );
          return true;
        }
      );

      // Confirm stored hash is unmodified
      const anchor = await service.getAnchor(documentId, versionId);
      assert.equal(
        anchor?.documentHash,
        '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
      );
    });

    // Test 15: Multi-version support
    it('should support anchoring multiple distinct versions for the same document ID', async () => {
      const documentId = 'doc_multi_version_test';
      const hashV1 = '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824';
      const hashV2 = 'd7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592';

      // Anchor V1
      const anchor1 = await service.anchorDocument({
        documentId,
        versionId: 1,
        documentHash: hashV1,
      });

      // Anchor V2
      const anchor2 = await service.anchorDocument({
        documentId,
        versionId: 2,
        documentHash: hashV2,
      });

      assert.equal(anchor1.versionId, 1);
      assert.equal(anchor2.versionId, 2);

      const retrieved1 = await service.getAnchor(documentId, 1);
      const retrieved2 = await service.getAnchor(documentId, 2);

      assert.equal(retrieved1?.documentHash, hashV1);
      assert.equal(retrieved2?.documentHash, hashV2);
    });

    // Test 16: Blockchain unavailable failure
    it('should fail clearly with BlockchainUnavailableError when connecting to an unreachable RPC URL', async () => {
      const unreachableProvider = new JsonRpcProvider('http://127.0.0.1:59999', 31337n, {
        staticNetwork: true,
        batchMaxCount: 1,
      });
      const unreachableService = new EthersBlockchainService({
        contractAddress: deployedContractAddress,
        runner: unreachableProvider,
      });

      try {
        await assert.rejects(
          async () => {
            await unreachableService.getAnchor('doc_any', 1);
          },
          (err: unknown) => {
            assert.ok(
              err instanceof BlockchainUnavailableError,
              `Expected BlockchainUnavailableError, got: ${err}`
            );
            assert.equal(
              (err as BlockchainUnavailableError).code,
              'BLOCKCHAIN_UNAVAILABLE'
            );
            return true;
          }
        );
      } finally {
        unreachableProvider.destroy();
      }
    });
  });
});
