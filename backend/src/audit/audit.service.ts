import { randomBytes } from 'node:crypto';
import { calculateSha256 } from '../integrity/hash.service.js';
import type {
  AuditEvent,
  CreateAuditEventInput,
  AuditChainVerificationResult,
  AuditRepository,
} from './audit.types.js';

/**
 * Normalizes metadata values recursively so object keys are serialized in strict alphabetical order.
 */
function canonicalizeValue(val: unknown): unknown {
  if (val === null || typeof val !== 'object') {
    return val;
  }
  if (Array.isArray(val)) {
    return val.map(canonicalizeValue);
  }
  const obj = val as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  const sortedObj: Record<string, unknown> = {};
  for (const k of sortedKeys) {
    sortedObj[k] = canonicalizeValue(obj[k]);
  }
  return sortedObj;
}

/**
 * Produces a deterministic canonical string representation of an audit event's data.
 *
 * Determinism Guarantee:
 * Properties are ordered strictly: actorId, documentId, eventType, metadata, previousEventHash, timestamp, versionId.
 */
export function canonicalizeEventData(data: {
  eventType: string;
  actorId: string;
  documentId: string;
  versionId: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
  previousEventHash: string | null;
}): string {
  const canonical = {
    actorId: data.actorId,
    documentId: data.documentId,
    eventType: data.eventType,
    metadata: data.metadata ? canonicalizeValue(data.metadata) : null,
    previousEventHash: data.previousEventHash,
    timestamp: data.timestamp,
    versionId: data.versionId,
  };
  return JSON.stringify(canonical);
}

export class AuditService {
  constructor(private readonly auditRepo: AuditRepository) {}

  /**
   * Appends an immutable, hash-chained audit event to the ledger.
   *
   * Hash-Chain Algorithm:
   * 1. Retrieve the latest event for the target document.
   * 2. If no predecessor exists, previousEventHash = null (genesis event).
   * 3. Else, previousEventHash = latest.eventHash.
   * 4. Compute eventHash = SHA-256(canonicalEventData(data + previousEventHash)).
   *
   * @param input - Event creation parameters.
   * @returns The appended, cryptographically signed AuditEvent.
   */
  public async createEvent(input: CreateAuditEventInput): Promise<AuditEvent> {
    if (!input.eventType || !input.actorId || !input.documentId || !input.versionId) {
      throw new TypeError(
        'AuditService.createEvent requires eventType, actorId, documentId, and versionId.'
      );
    }

    const id = input.id || `aud_${randomBytes(8).toString('hex')}`;
    const timestamp = input.timestamp || new Date().toISOString();

    // 1. Retrieve the current tip of the audit chain for this document
    const latestEvent = await this.auditRepo.getLatest(input.documentId);
    const previousEventHash = latestEvent ? latestEvent.eventHash : null;

    // 2. Canonical serialization
    const canonicalPayload = canonicalizeEventData({
      eventType: input.eventType,
      actorId: input.actorId,
      documentId: input.documentId,
      versionId: input.versionId,
      timestamp,
      metadata: input.metadata,
      previousEventHash,
    });

    // 3. Compute event hash using M2-01 SHA-256 service
    const eventHash = calculateSha256(Buffer.from(canonicalPayload, 'utf-8'));

    const event: AuditEvent = {
      id,
      eventType: input.eventType,
      actorId: input.actorId,
      documentId: input.documentId,
      versionId: input.versionId,
      timestamp,
      metadata: input.metadata ? canonicalizeValue(input.metadata) as Record<string, unknown> : undefined,
      previousEventHash,
      eventHash,
    };

    await this.auditRepo.append(event);
    return event;
  }

  /**
   * Retrieves all chronological audit events for a document.
   */
  public async listEvents(documentId: string): Promise<AuditEvent[]> {
    if (!documentId) return [];
    return this.auditRepo.listByDocument(documentId);
  }

  /**
   * Verifies the cryptographic integrity of a document's audit hash-chain.
   *
   * Checks:
   * 1. Genesis event must have previousEventHash === null.
   * 2. Every event's eventHash must match the SHA-256 of its canonical data.
   * 3. Every subsequent event's previousEventHash must match the predecessor's eventHash.
   *
   * @param documentId - ID of document to verify.
   * @returns AuditChainVerificationResult
   */
  public async verifyAuditChain(documentId: string): Promise<AuditChainVerificationResult> {
    const events = await this.auditRepo.listByDocument(documentId);

    if (events.length === 0) {
      return { valid: true, eventCount: 0 };
    }

    for (let i = 0; i < events.length; i++) {
      const current = events[i];

      // Verification 1: Genesis event previous hash must be null
      if (i === 0) {
        if (current.previousEventHash !== null) {
          return {
            valid: false,
            eventCount: events.length,
            brokenEventId: current.id,
            reason: 'GENESIS_PREVIOUS_HASH_NOT_NULL',
            details: `Genesis event "${current.id}" has non-null previousEventHash.`,
          };
        }
      } else {
        // Verification 2: Linkage to predecessor's eventHash
        const predecessor = events[i - 1];
        if (current.previousEventHash !== predecessor.eventHash) {
          return {
            valid: false,
            eventCount: events.length,
            brokenEventId: current.id,
            reason: 'PREVIOUS_HASH_MISMATCH',
            details: `Event "${current.id}" previousEventHash does not match predecessor "${predecessor.id}" eventHash.`,
          };
        }
      }

      // Verification 3: Recompute hash from canonical payload and compare
      const canonicalPayload = canonicalizeEventData({
        eventType: current.eventType,
        actorId: current.actorId,
        documentId: current.documentId,
        versionId: current.versionId,
        timestamp: current.timestamp,
        metadata: current.metadata,
        previousEventHash: current.previousEventHash,
      });

      const recomputedHash = calculateSha256(Buffer.from(canonicalPayload, 'utf-8'));
      if (recomputedHash !== current.eventHash) {
        return {
          valid: false,
          eventCount: events.length,
          brokenEventId: current.id,
          reason: 'EVENT_HASH_MISMATCH',
          details: `Event "${current.id}" computed hash (${recomputedHash}) differs from stored eventHash (${current.eventHash}).`,
        };
      }
    }

    return {
      valid: true,
      eventCount: events.length,
    };
  }
}
