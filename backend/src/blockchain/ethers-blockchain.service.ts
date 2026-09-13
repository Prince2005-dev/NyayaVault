import {
  Contract,
  JsonRpcProvider,
  Wallet,
  type ContractRunner,
  type InterfaceAbi,
} from 'ethers';
import type {
  BlockchainService,
  AnchorDocumentInput,
  BlockchainAnchor,
} from './blockchain.types.js';
import { DOCUMENT_INTEGRITY_REGISTRY_ABI } from './contract-abi.js';
import {
  encodeDocumentId,
  formatDocumentHash,
  encodeEventType,
  validateVersionId,
  validateAndNormalizeAddress,
} from './encoding.utils.js';
import {
  BlockchainUnavailableError,
  BlockchainTransactionFailedError,
  BlockchainAnchorAlreadyExistsError,
  DomainError,
} from '../errors/domain.errors.js';
import {
  loadBlockchainConfig,
  type BlockchainConfig,
} from '../config/blockchain.config.js';

export interface EthersBlockchainServiceOptions {
  contractAddress: string;
  runner: ContractRunner;
  contractAbi?: InterfaceAbi;
}

export class EthersBlockchainService implements BlockchainService {
  private readonly contract: Contract;
  private readonly contractAddress: string;
  private readonly runner: ContractRunner;

  /**
   * Initializes the EthersBlockchainService adapter.
   *
   * @param options - Contract address, ethers ContractRunner (Signer or Provider), and optional ABI.
   */
  constructor(options: EthersBlockchainServiceOptions) {
    if (!options.contractAddress || typeof options.contractAddress !== 'string') {
      throw new TypeError('EthersBlockchainService requires a valid contractAddress string.');
    }
    if (!options.runner) {
      throw new TypeError('EthersBlockchainService requires an ethers ContractRunner.');
    }

    this.contractAddress = options.contractAddress;
    this.runner = options.runner;
    const abi = options.contractAbi || DOCUMENT_INTEGRITY_REGISTRY_ABI;
    this.contract = new Contract(this.contractAddress, abi, this.runner);
  }

  /**
   * Factory method to create an EthersBlockchainService instance from environment configuration.
   *
   * @param overrideConfig - Optional configuration overrides.
   * @returns Configured EthersBlockchainService.
   */
  public static fromConfig(overrideConfig?: Partial<BlockchainConfig>): EthersBlockchainService {
    const baseConfig = loadBlockchainConfig();
    const config = { ...baseConfig, ...overrideConfig };

    if (!config.contractAddress) {
      throw new Error(
        'Missing required blockchain contract address: BLOCKCHAIN_CONTRACT_ADDRESS is not defined.'
      );
    }

    const provider = new JsonRpcProvider(config.rpcUrl);
    let runner: ContractRunner = provider;

    if (config.privateKey) {
      runner = new Wallet(config.privateKey, provider);
    }

    return new EthersBlockchainService({
      contractAddress: config.contractAddress,
      runner,
    });
  }

  /**
   * Anchors an immutable cryptographic proof for a document version to the blockchain.
   *
   * Execution Pipeline:
   * 1. Validate inputs (documentId, versionId, SHA-256 hash format).
   * 2. Deterministically encode parameters to Solidity types (bytes32, uint256).
   * 3. Submit contract transaction via backend signer.
   * 4. Wait for 1 transaction confirmation block.
   * 5. Retrieve authoritative on-chain timestamp from confirmed anchor.
   * 6. Return typed BlockchainAnchor.
   *
   * Immutability Guarantee:
   * If an anchor already exists for (documentId, versionId), the contract reverts
   * with DocumentAlreadyAnchored and this method throws BlockchainAnchorAlreadyExistsError.
   *
   * @param input - Anchor parameters.
   * @returns Confirmed BlockchainAnchor record.
   */
  public async anchorDocument(input: AnchorDocumentInput): Promise<BlockchainAnchor> {
    if (!input || typeof input !== 'object') {
      throw new TypeError('anchorDocument requires an AnchorDocumentInput object.');
    }

    // 1. Validation & deterministic encoding
    const encodedDocId = encodeDocumentId(input.documentId);
    const encodedDocHash = formatDocumentHash(input.documentHash);
    const encodedEventType = encodeEventType(input.eventType);
    const versionBigInt = validateVersionId(input.versionId);

    // Resolve actor address: either provided or runner address
    let actorAddress: string;
    let signerAddress: string | undefined;
    if ('getAddress' in this.runner && typeof this.runner.getAddress === 'function') {
      signerAddress = await this.runner.getAddress();
    }

    if (input.actorAddress) {
      actorAddress = validateAndNormalizeAddress(input.actorAddress);
    } else if (signerAddress) {
      actorAddress = signerAddress;
    } else {
      actorAddress = '0x0000000000000000000000000000000000000000';
    }

    try {
      const overrides: Record<string, unknown> = {};
      const prov = this.runner.provider as { send?: (method: string, params: unknown[]) => Promise<unknown> } | null;
      if (prov && typeof prov.send === 'function' && signerAddress) {
        const rawNonce = await prov.send('eth_getTransactionCount', [signerAddress, 'latest']);
        overrides.nonce = Number(rawNonce);
      }

      // 2. Submit transaction
      const tx = await this.contract.anchorDocument(
        encodedDocId,
        versionBigInt,
        encodedDocHash,
        encodedEventType,
        actorAddress,
        overrides
      );

      // 3. Wait for confirmation receipt
      const receipt = await tx.wait(1);
      if (!receipt || receipt.status !== 1) {
        throw new BlockchainTransactionFailedError('anchorDocument', 'Transaction reverted on-chain.');
      }

      // 4. Retrieve authoritative block timestamp from the confirmed anchor
      const anchorData = await this.contract.getAnchor(encodedDocId, versionBigInt);
      const actor = String(anchorData.actor ?? anchorData[4]);
      const timestamp = Number(anchorData.timestamp ?? anchorData[5]);

      return {
        documentId: input.documentId,
        versionId: input.versionId,
        documentHash: input.documentHash.trim().toLowerCase().replace(/^0x/, ''),
        eventType: encodedEventType,
        actor,
        timestamp,
        transactionId: receipt.hash,
        blockNumber: receipt.blockNumber,
      };
    } catch (err: unknown) {
      this.handleContractError(err, {
        documentId: input.documentId,
        versionId: input.versionId,
        operation: 'anchorDocument',
      });
    }
  }

  /**
   * Retrieves an immutable document anchor proof from the blockchain.
   *
   * @param documentId - Application document identifier.
   * @param versionId - Monotonically increasing version number.
   * @returns BlockchainAnchor if found, or null if unanchored.
   */
  public async getAnchor(
    documentId: string,
    versionId: number
  ): Promise<BlockchainAnchor | null> {
    const encodedDocId = encodeDocumentId(documentId);
    const versionBigInt = validateVersionId(versionId);

    try {
      // 1. Check existence first to avoid revert overhead
      const exists = await this.contract.hasAnchor(encodedDocId, versionBigInt);
      if (!exists) {
        return null;
      }

      // 2. Query anchor tuple
      const anchor = await this.contract.getAnchor(encodedDocId, versionBigInt);
      const timestamp = Number(anchor.timestamp ?? anchor[5]);
      if (!anchor || timestamp === 0) {
        return null;
      }

      const rawHash = String(anchor.documentHash ?? anchor[2]);
      const cleanHash = rawHash.startsWith('0x') || rawHash.startsWith('0X') ? rawHash.slice(2) : rawHash;

      return {
        documentId,
        versionId,
        documentHash: cleanHash.toLowerCase(),
        eventType: String(anchor.eventType ?? anchor[3]),
        actor: String(anchor.actor ?? anchor[4]),
        timestamp,
        transactionId: '', // Retrieval query does not execute a new transaction
      };
    } catch (err: unknown) {
      // If AnchorNotFound error is thrown by contract, cleanly return null
      if (this.isAnchorNotFoundError(err)) {
        return null;
      }

      this.handleContractError(err, {
        documentId,
        versionId,
        operation: 'getAnchor',
      });
    }
  }

  /**
   * Pure comparison: verifies whether a candidate document hash matches the anchored hash.
   *
   * Guarantees:
   * - Performs no I/O, network requests, decryption, or storage access.
   * - Strips optional leading 0x prefixes and compares case-insensitively.
   *
   * @param documentHash - Candidate SHA-256 hash.
   * @param anchor - BlockchainAnchor record retrieved from chain.
   * @returns true if hashes match identically, false otherwise.
   */
  public verifyAnchor(documentHash: string, anchor: BlockchainAnchor): boolean {
    if (!documentHash || typeof documentHash !== 'string' || !anchor || !anchor.documentHash) {
      return false;
    }

    const cleanCandidate = documentHash.trim().toLowerCase().replace(/^0x/, '');
    const cleanAnchor = anchor.documentHash.trim().toLowerCase().replace(/^0x/, '');

    return cleanCandidate === cleanAnchor;
  }

  /**
   * Internal helper: determines whether an error indicates AnchorNotFound.
   */
  private isAnchorNotFoundError(err: unknown): boolean {
    const e = err as Record<string, unknown>;
    const msg = e?.message ? String(e.message) : String(err);

    if (e?.errorName === 'AnchorNotFound' || msg.includes('AnchorNotFound')) {
      return true;
    }

    if (this.contract.interface && e?.data && typeof e.data === 'string') {
      try {
        const parsed = this.contract.interface.parseError(e.data);
        return parsed?.name === 'AnchorNotFound';
      } catch {
        return false;
      }
    }

    return false;
  }

  /**
   * Internal helper: translates low-level ethers/EVM errors into high-level domain errors.
   */
  private handleContractError(
    err: unknown,
    context: { documentId: string; versionId: number; operation: string }
  ): never {
    // If it's already a domain error, rethrow as-is
    if (err instanceof DomainError) {
      throw err;
    }

    const e = err as Record<string, unknown>;
    const msg = e?.message ? String(e.message) : String(err);

    // 1. Check for duplicate anchor custom error
    let isDuplicate = e?.errorName === 'DocumentAlreadyAnchored' || msg.includes('DocumentAlreadyAnchored');
    if (!isDuplicate && this.contract.interface && e?.data && typeof e.data === 'string') {
      try {
        const parsed = this.contract.interface.parseError(e.data);
        isDuplicate = parsed?.name === 'DocumentAlreadyAnchored';
      } catch {
        // Ignore parse error
      }
    }

    if (isDuplicate) {
      throw new BlockchainAnchorAlreadyExistsError(context.documentId, context.versionId);
    }

    // 2. Check for network or RPC unavailability
    if (
      msg.includes('ECONNREFUSED') ||
      msg.includes('could not detect network') ||
      msg.includes('Failed to fetch') ||
      msg.includes('ENOTFOUND') ||
      e?.code === 'NETWORK_ERROR' ||
      e?.code === 'SERVER_ERROR'
    ) {
      throw new BlockchainUnavailableError(msg);
    }

    // 3. General transaction or contract call failure
    const safeReason = e?.shortMessage ? String(e.shortMessage) : msg;
    throw new BlockchainTransactionFailedError(context.operation, safeReason);
  }
}
