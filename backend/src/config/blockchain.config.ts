import { initializeEnvironment } from './encryption.config.js';

export interface BlockchainConfig {
  rpcUrl: string;
  privateKey?: string;
  contractAddress?: string;
}

/**
 * Loads blockchain configuration from the environment.
 *
 * Security Rules:
 * - Never prints, logs, or exposes the private key.
 * - Private key is optional for read-only query operations.
 * - Defaults rpcUrl to 'http://127.0.0.1:8545' for local development.
 *
 * @returns BlockchainConfig containing rpcUrl, optional privateKey, and optional contractAddress.
 */
export function loadBlockchainConfig(): BlockchainConfig {
  initializeEnvironment();

  const rpcUrl = process.env.BLOCKCHAIN_RPC_URL || 'http://127.0.0.1:8545';
  const rawKey = process.env.BLOCKCHAIN_PRIVATE_KEY?.trim();
  const rawAddress = process.env.BLOCKCHAIN_CONTRACT_ADDRESS?.trim();

  const privateKey = rawKey && rawKey.length > 0 ? rawKey : undefined;
  const contractAddress = rawAddress && rawAddress.length > 0 ? rawAddress : undefined;

  return {
    rpcUrl,
    privateKey,
    contractAddress,
  };
}
