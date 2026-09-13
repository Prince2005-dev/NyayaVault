import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { AuditService, canonicalizeEventData } from './audit.service.js';
import { InMemoryAuditRepository } from './in-memory-audit.repository.js';

describe('Audit Service: Hash-Chained Audit Events', () => {
  let repository: InMemoryAuditRepository;
  let service: AuditService;

  beforeEach(() => {
    repository = new InMemoryAuditRepository();
    service = new AuditService(repository);
  });

  // Test 1: First event has previousEventHash = null
  it('should initialize the genesis event with previousEventHash === null', async () => {
    const event1 = await service.createEvent({
      eventType: 'DOCUMENT_UPLOADED',
      actorId: 'usr_inspector_001',
      documentId: 'doc_evidence_001',
      versionId: 'ver_001',
      timestamp: '2026-09-12T00:00:00.000Z',
      metadata: { originalFilename: 'case_report.pdf' },
    });

    assert.equal(event1.previousEventHash, null);
    assert.match(event1.eventHash, /^[0-9a-f]{64}$/);
  });

  // Test 2 & 3: Sequential events reference the predecessor hash
  it('should chain second and third events cryptographically to their predecessors', async () => {
    const docId = 'doc_chained_001';

    // Event 1: Genesis Upload
    const event1 = await service.createEvent({
      eventType: 'DOCUMENT_UPLOADED',
      actorId: 'usr_001',
      documentId: docId,
      versionId: 'ver_001',
      timestamp: '2026-09-12T01:00:00.000Z',
    });

    // Event 2: Document Sealed
    const event2 = await service.createEvent({
      eventType: 'DOCUMENT_SEALED',
      actorId: 'usr_001',
      documentId: docId,
      versionId: 'ver_001',
      timestamp: '2026-09-12T01:05:00.000Z',
    });

    // Event 3: Secondary Seal/Audit Milestone
    const event3 = await service.createEvent({
      eventType: 'DOCUMENT_SEALED',
      actorId: 'usr_auditor_99',
      documentId: docId,
      versionId: 'ver_001',
      timestamp: '2026-09-12T01:10:00.000Z',
    });

    assert.equal(event1.previousEventHash, null);
    assert.equal(event2.previousEventHash, event1.eventHash);
    assert.equal(event3.previousEventHash, event2.eventHash);
  });

  // Test 4: Valid chain returns valid: true
  it('should verify an untampered multi-event chain as valid', async () => {
    const docId = 'doc_valid_chain';

    await service.createEvent({
      eventType: 'DOCUMENT_UPLOADED',
      actorId: 'usr_001',
      documentId: docId,
      versionId: 'ver_001',
      timestamp: '2026-09-12T02:00:00.000Z',
    });

    await service.createEvent({
      eventType: 'DOCUMENT_SEALED',
      actorId: 'usr_001',
      documentId: docId,
      versionId: 'ver_001',
      timestamp: '2026-09-12T02:10:00.000Z',
    });

    const verification = await service.verifyAuditChain(docId);
    assert.equal(verification.valid, true);
    assert.equal(verification.eventCount, 2);
  });

  // Test 5: Changing event data makes verification fail (EVENT_HASH_MISMATCH)
  it('should detect tampering when event payload data is modified', async () => {
    const docId = 'doc_tamper_data';

    await service.createEvent({
      eventType: 'DOCUMENT_UPLOADED',
      actorId: 'usr_001',
      documentId: docId,
      versionId: 'ver_001',
      timestamp: '2026-09-12T03:00:00.000Z',
      metadata: { filename: 'authentic.pdf' },
    });

    await service.createEvent({
      eventType: 'DOCUMENT_SEALED',
      actorId: 'usr_001',
      documentId: docId,
      versionId: 'ver_001',
      timestamp: '2026-09-12T03:05:00.000Z',
    });

    // Simulate database corruption/tampering by directly modifying event 0's metadata in repository
    repository._simulateTamper(docId, 0, {
      metadata: { filename: 'forged_document.pdf' },
    });

    const verification = await service.verifyAuditChain(docId);
    assert.equal(verification.valid, false);
    assert.equal(verification.reason, 'EVENT_HASH_MISMATCH');
  });

  // Test 6: Changing stored eventHash makes verification fail
  it('should detect tampering when stored eventHash is altered', async () => {
    const docId = 'doc_tamper_hash';

    await service.createEvent({
      eventType: 'DOCUMENT_UPLOADED',
      actorId: 'usr_001',
      documentId: docId,
      versionId: 'ver_001',
      timestamp: '2026-09-12T04:00:00.000Z',
    });

    // Mutate the event's hash to a fake value
    repository._simulateTamper(docId, 0, {
      eventHash: '0000000000000000000000000000000000000000000000000000000000000000',
    });

    const verification = await service.verifyAuditChain(docId);
    assert.equal(verification.valid, false);
    assert.equal(verification.reason, 'EVENT_HASH_MISMATCH');
  });

  // Test 7: Breaking previousEventHash link makes verification fail (PREVIOUS_HASH_MISMATCH)
  it('should detect when the hash linkage between events is severed', async () => {
    const docId = 'doc_broken_link';

    await service.createEvent({
      eventType: 'DOCUMENT_UPLOADED',
      actorId: 'usr_001',
      documentId: docId,
      versionId: 'ver_001',
      timestamp: '2026-09-12T05:00:00.000Z',
    });

    await service.createEvent({
      eventType: 'DOCUMENT_SEALED',
      actorId: 'usr_001',
      documentId: docId,
      versionId: 'ver_001',
      timestamp: '2026-09-12T05:05:00.000Z',
    });

    // Sever the link on event 1
    repository._simulateTamper(docId, 1, {
      previousEventHash: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    });

    const verification = await service.verifyAuditChain(docId);
    assert.equal(verification.valid, false);
    assert.equal(verification.reason, 'PREVIOUS_HASH_MISMATCH');
  });

  // Test 8: Deterministic serialization produces reproducible hashes
  it('should deterministically produce identical hashes for identical canonical data regardless of key order', () => {
    const raw1 = {
      eventType: 'DOCUMENT_SEALED',
      actorId: 'usr_100',
      documentId: 'doc_det_1',
      versionId: 'v1',
      timestamp: '2026-09-12T10:00:00.000Z',
      metadata: { bKey: 2, aKey: 1 },
      previousEventHash: 'abc123def456',
    };

    const raw2 = {
      versionId: 'v1',
      timestamp: '2026-09-12T10:00:00.000Z',
      previousEventHash: 'abc123def456',
      metadata: { aKey: 1, bKey: 2 },
      documentId: 'doc_det_1',
      actorId: 'usr_100',
      eventType: 'DOCUMENT_SEALED',
    };

    const canonical1 = canonicalizeEventData(raw1);
    const canonical2 = canonicalizeEventData(raw2);

    assert.equal(canonical1, canonical2);
  });

  // Test 9 & 10: AuditService is strictly append-only (no updateEvent or deleteEvent methods)
  it('should not expose updateEvent or deleteEvent methods on public AuditService API', () => {
    // @ts-expect-error - verifying method does not exist on interface
    assert.equal(service.updateEvent, undefined);
    // @ts-expect-error - verifying method does not exist on interface
    assert.equal(service.deleteEvent, undefined);
  });
});
