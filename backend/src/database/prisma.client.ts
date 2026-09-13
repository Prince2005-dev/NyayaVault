import { PrismaClient } from '@prisma/client';
import { initializeEnvironment } from '../config/encryption.config.js';

initializeEnvironment();

let prismaInstance: PrismaClient | null = null;

/**
 * Returns the singleton PrismaClient instance for NyayaVault.
 *
 * Security:
 * - Credentials and connection parameters remain encapsulated in process.env.DATABASE_URL.
 * - Never logs or exposes raw database URLs or passwords.
 */
export function getPrismaClient(): PrismaClient {
  if (!prismaInstance) {
    prismaInstance = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
  }
  return prismaInstance;
}

/**
 * Disconnects the active PrismaClient instance if connected.
 */
export async function disconnectPrismaClient(): Promise<void> {
  if (prismaInstance) {
    await prismaInstance.$disconnect();
    prismaInstance = null;
  }
}

export const prisma = getPrismaClient();
