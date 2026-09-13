#!/usr/bin/env node
/**
 * TEMPORARY DEMO UTILITY: Controlled Evidence Tampering Simulator
 * ===============================================================
 * Purpose:
 *   Demonstrates live cryptographic tamper detection (SEALED -> MISMATCH)
 *   by modifying the physical encrypted storage artifact of a targeted
 *   disposable document WITHOUT mutating database records or blockchain proofs.
 *
 * Safety Constraints:
 *   - NEVER alters PostgreSQL records (sha256Hash, status, sealedAt, sealedBy remain untouched).
 *   - NEVER interacts with or submits blockchain transactions.
 *   - NEVER creates or alters audit chain records.
 *   - Creates a byte-for-byte `.bak` backup before modifying the artifact.
 *   - Refuses execution if document is not in SEALED status.
 *   - Refuses execution if storage path escapes the configured root.
 *   - Re-encrypts altered plaintext with the real master key (valid AES-256-GCM envelope)
 *     so the verification service decrypts cleanly and detects SHA-256 MISMATCH.
 *   - NEVER logs or prints secret keys.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEncryptionConfig, loadStorageConfig } from '../../dist/config/encryption.config.js';
import { AesGcmEncryptionService } from '../../dist/encryption/aes-gcm.service.js';
import {
  serializeEncryptedPayload,
  deserializeEncryptedPayload,
} from '../../dist/encryption/encryption.types.js';
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
    console.log('  node backend/scripts/demo/tamper-document.mjs <DOCUMENT_ID>\n');

    // List recent sealed documents for reference
    const sealedDocs = await prisma.document.findMany({
      where: {
        versions: {
          some: { status: 'SEALED' },
        },
      },
      include: {
        versions: {
          where: { status: 'SEALED' },
          orderBy: { versionNumber: 'desc' },
          take: 1,
        },
      },
      take: 5,
      orderBy: { createdAt: 'desc' },
    });

    if (sealedDocs.length > 0) {
      console.log('Available sealed documents in system:');
      for (const d of sealedDocs) {
        const v = d.versions[0];
        console.log(`  - ID: ${d.id} | Title: "${d.title || d.id}" | Version: v${v?.versionNumber} | Hash: ${v?.sha256Hash?.slice(0, 16)}...`);
      }
    }
    process.exit(1);
  }

  console.log('====================================================');
  console.log('  NyayaVault — Controlled Tamper Simulation Utility  ');
  console.log('  (Demo / Diagnostic Tooling Only)                  ');
  console.log('====================================================\n');

  // 1. Locate target document and latest version in database
  console.log(`[1/6] Resolving document "${targetDocId}" in PostgreSQL...`);
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
  if (!version) {
    console.error(`❌ Refusing to continue: Document "${targetDocId}" has no recorded versions.`);
    process.exit(1);
  }

  // 2. Enforce safety check: Document MUST be in SEALED status
  console.log(`[2/6] Verifying custody status: "${version.status}"...`);
  if (version.status !== 'SEALED') {
    console.error(
      `❌ Refusing to continue: Document is in "${version.status}" status. Only SEALED documents may be used for tamper testing.`
    );
    process.exit(1);
  }

  if (!version.storageKey) {
    console.error('❌ Refusing to continue: Target document has no storageKey.');
    process.exit(1);
  }

  // 3. Resolve and validate storage filesystem path
  console.log(`[3/6] Resolving storage path for key: "${version.storageKey}"...`);
  const storageRoot = path.resolve(storageConfig.storageRootDir);
  const normalizedKey = version.storageKey.replace(/\\/g, '/');

  // Boundary check
  const resolvedPath = path.resolve(storageRoot, normalizedKey);
  const expectedPrefix = storageRoot.endsWith(path.sep) ? storageRoot : storageRoot + path.sep;

  if (!resolvedPath.startsWith(expectedPrefix)) {
    console.error(`❌ Path Traversal Violation: "${resolvedPath}" escapes root directory.`);
    process.exit(1);
  }

  if (!fs.existsSync(resolvedPath)) {
    console.error(`❌ Storage artifact not found at: "${resolvedPath}".`);
    process.exit(1);
  }

  // 4. Create byte-for-byte backup (.bak) BEFORE touching artifact
  const backupPath = `${resolvedPath}.bak`;
  console.log(`[4/6] Creating byte-for-byte backup:`);
  console.log(`      Source: ${resolvedPath}`);
  console.log(`      Backup: ${backupPath}`);

  const originalStorageBuffer = await fs.promises.readFile(resolvedPath);
  await fs.promises.writeFile(backupPath, originalStorageBuffer);

  // Verify backup integrity
  const verifiedBackupBuffer = await fs.promises.readFile(backupPath);
  if (Buffer.compare(originalStorageBuffer, verifiedBackupBuffer) !== 0) {
    console.error('❌ Backup verification failed: Content mismatch between original and backup.');
    await fs.promises.unlink(backupPath).catch(() => {});
    process.exit(1);
  }
  console.log(`      ✓ Backup successfully created and verified (${originalStorageBuffer.length} bytes).`);

  // 5. Decrypt original plaintext to inspect structure
  console.log(`[5/6] Decrypting original payload with AES-256-GCM...`);
  const originalPayload = deserializeEncryptedPayload(originalStorageBuffer);
  const originalPlaintext = await encryptionService.decrypt(originalPayload);
  const originalSha256 = calculateSha256(originalPlaintext);

  console.log(`      Original Decrypted SHA-256 : ${originalSha256}`);
  console.log(`      PostgreSQL Trusted Hash    : ${version.sha256Hash}`);

  if (originalSha256.toLowerCase() !== version.sha256Hash?.toLowerCase()) {
    console.warn('⚠️ Warning: Current decrypted hash did not match database trusted hash prior to tampering.');
  }

  // 6. Synthesize altered plaintext and re-encrypt with valid AES-GCM
  console.log(`[6/6] Generating altered evidence payload and re-encrypting...`);
  let alteredPlaintext;
  if (originalPlaintext.toString('utf-8', 0, 5).startsWith('%PDF')) {
    // Append unauthorized evidentiary modification trailer to PDF
    alteredPlaintext = Buffer.concat([
      originalPlaintext,
      Buffer.from(
        '\n% === UNAUTHORIZED TAMPER INJECTION: EVIDENCE MODIFIED POST-SEAL ===\n' +
        '% [FORGERY SIMULATION: Altered forensic findings metadata]\n',
        'utf-8'
      ),
    ]);
  } else {
    // Plain text / binary tamper tag
    alteredPlaintext = Buffer.concat([
      originalPlaintext,
      Buffer.from(
        '\n[UNAUTHORIZED TAMPER INJECTION: Forensic report altered post-custody sealing]',
        'utf-8'
      ),
    ]);
  }

  const tamperedSha256 = calculateSha256(alteredPlaintext);
  console.log(`      Tampered Plaintext SHA-256 : ${tamperedSha256}`);

  // Re-encrypt with production master key (produces fresh IV + valid auth tag)
  const tamperedEncryptedPayload = await encryptionService.encrypt(alteredPlaintext);
  const tamperedStorageBuffer = serializeEncryptedPayload(tamperedEncryptedPayload);

  // Atomically write tampered payload over the storage key
  const tempPath = `${resolvedPath}.tmp_${Date.now()}`;
  await fs.promises.writeFile(tempPath, tamperedStorageBuffer);
  await fs.promises.rename(tempPath, resolvedPath);

  console.log('\n====================================================');
  console.log('  TAMPER SIMULATION APPLIED SUCCESSFULLY!           ');
  console.log('====================================================');
  console.log(`Document ID         : ${targetDocId}`);
  console.log(`Storage File        : ${resolvedPath}`);
  console.log(`Backup File (.bak)  : ${backupPath}`);
  console.log(`Database State      : UNTOUCHED (Remains "${version.status}")`);
  console.log(`Trusted Hash in DB  : ${version.sha256Hash}`);
  console.log(`New Plaintext Hash  : ${tamperedSha256}`);
  console.log(`Blockchain Proof    : UNTOUCHED (Anchor retains original hash)`);
  console.log('\n👉 Next Step for Browser Verification:');
  console.log('   In the live browser, refresh the document detail page');
  console.log('   and click "Verify Integrity".');
  console.log('   The result will immediately show "TAMPER DETECTED / MISMATCH"');
  console.log('   comparing the current altered hash against the trusted on-chain anchor.');
  console.log('\n👉 To restore afterwards:');
  console.log(`   node backend/scripts/demo/restore-document.mjs ${targetDocId}`);
  console.log('====================================================\n');
}

main()
  .catch((err) => {
    console.error('\n❌ Unhandled Fatal Error in Tamper Script:', err.message);
    process.exit(1);
  })
  .finally(async () => {
    const prisma = getPrismaClient();
    await prisma.$disconnect().catch(() => {});
  });
