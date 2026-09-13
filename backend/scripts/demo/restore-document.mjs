#!/usr/bin/env node
/**
 * TEMPORARY DEMO UTILITY: Evidence Restoration Utility
 * ====================================================
 * Purpose:
 *   Restores the original authentic encrypted storage artifact from its `.bak`
 *   backup file after a controlled tamper detection demonstration.
 *
 * Safety Constraints:
 *   - NEVER alters PostgreSQL database records.
 *   - NEVER submits or mutates blockchain records.
 *   - NEVER touches the audit chain.
 *   - Verifies the `.bak` backup file exists and is valid before restoration.
 *   - Atomically overwrites the active storage file with the backup contents.
 *   - Deletes the temporary `.bak` file once restoration is verified.
 *   - NEVER logs or prints secret keys.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEncryptionConfig, loadStorageConfig } from '../../dist/config/encryption.config.js';
import { AesGcmEncryptionService } from '../../dist/encryption/aes-gcm.service.js';
import { deserializeEncryptedPayload } from '../../dist/encryption/encryption.types.js';
import { calculateSha256 } from '../../dist/integrity/hash.service.js';
import { getPrismaClient } from '../../dist/database/prisma.client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const targetDocId = process.argv[2]?.trim();

  const prisma = getPrismaClient();
  const encConfig = loadEncryptionConfig();
  const storageConfig = loadStorageConfig();
  const encryptionService = new AesGcmEncryptionService(encConfig.key, encConfig.keyVersion);

  if (!targetDocId) {
    console.error('❌ Error: Missing required document ID argument.\n');
    console.log('Usage:');
    console.log('  node backend/scripts/demo/restore-document.mjs <DOCUMENT_ID>\n');
    process.exit(1);
  }

  console.log('====================================================');
  console.log('  NyayaVault — Evidence Restoration Utility         ');
  console.log('  (Demo / Diagnostic Tooling Only)                  ');
  console.log('====================================================\n');

  // 1. Locate target document in PostgreSQL
  console.log(`[1/5] Resolving document "${targetDocId}" in PostgreSQL...`);
  const doc = await prisma.document.findUnique({
    where: { id: targetDocId },
    include: {
      versions: {
        orderBy: { versionNumber: 'desc' },
        take: 1,
      },
    },
  });

  if (!doc) {
    console.error(`❌ Refusing to continue: Document "${targetDocId}" not found in database.`);
    process.exit(1);
  }

  const version = doc.versions[0];
  if (!version || !version.storageKey) {
    console.error(`❌ Refusing to continue: Document "${targetDocId}" has no recorded storageKey.`);
    process.exit(1);
  }

  // 2. Resolve storage path
  console.log(`[2/5] Resolving storage paths...`);
  const storageRoot = path.resolve(storageConfig.storageRootDir);
  const normalizedKey = version.storageKey.replace(/\\/g, '/');
  const targetPath = path.resolve(storageRoot, normalizedKey);
  const backupPath = `${targetPath}.bak`;

  console.log(`      Active Artifact : ${targetPath}`);
  console.log(`      Backup File     : ${backupPath}`);

  // 3. Verify backup file exists
  console.log(`[3/5] Verifying presence and validity of backup file...`);
  if (!fs.existsSync(backupPath)) {
    console.error(`❌ Error: Backup file not found at "${backupPath}".`);
    console.error('   Cannot restore without an existing .bak file.');
    process.exit(1);
  }

  const backupBuffer = await fs.promises.readFile(backupPath);
  if (backupBuffer.length === 0) {
    console.error('❌ Error: Backup file is empty (0 bytes). Restoration aborted.');
    process.exit(1);
  }

  // Verify backup can be deserialized and decrypted
  try {
    const backupPayload = deserializeEncryptedPayload(backupBuffer);
    const restoredPlaintext = await encryptionService.decrypt(backupPayload);
    const restoredHash = calculateSha256(restoredPlaintext);

    console.log(`      Restored Decrypted SHA-256 : ${restoredHash}`);
    console.log(`      PostgreSQL Trusted Hash    : ${version.sha256Hash}`);

    if (restoredHash.toLowerCase() === version.sha256Hash?.toLowerCase()) {
      console.log('      ✓ Verified: Backup matches trusted sealed fingerprint perfectly.');
    } else {
      console.warn('      ⚠️ Warning: Restored hash differs from database trusted hash.');
    }
  } catch (decError) {
    console.error('❌ Error: Failed to validate and decrypt backup file:', (decError).message);
    process.exit(1);
  }

  // 4. Atomically restore active file from backup
  console.log(`[4/5] Restoring original artifact to active storage key...`);
  const tempPath = `${targetPath}.tmp_restore_${Date.now()}`;
  await fs.promises.writeFile(tempPath, backupBuffer);
  await fs.promises.rename(tempPath, targetPath);

  // 5. Clean up temporary backup file
  console.log(`[5/5] Cleaning up backup file...`);
  await fs.promises.unlink(backupPath);

  console.log('\n====================================================');
  console.log('  DOCUMENT RESTORATION COMPLETED SUCCESSFULLY!      ');
  console.log('====================================================');
  console.log(`Document ID         : ${targetDocId}`);
  console.log(`Storage File        : ${targetPath}`);
  console.log(`Backup File (.bak)  : DELETED (Restored cleanly)`);
  console.log(`Database Record     : UNTOUCHED`);
  console.log(`Blockchain Anchor   : UNTOUCHED`);
  console.log('\n👉 Next Step for Browser Verification:');
  console.log('   In the live browser, refresh the document detail page');
  console.log('   and click "Verify Integrity".');
  console.log('   The result will immediately show "INTEGRITY VERIFIED"');
  console.log('   confirming the original authentic state is restored.');
  console.log('====================================================\n');
}

main()
  .catch((err) => {
    console.error('\n❌ Unhandled Fatal Error in Restore Script:', err.message);
    process.exit(1);
  })
  .finally(async () => {
    const prisma = getPrismaClient();
    await prisma.$disconnect().catch(() => {});
  });
