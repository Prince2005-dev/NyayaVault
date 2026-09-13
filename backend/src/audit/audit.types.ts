/**
 * Audit domain types and repository interface for NyayaVault.
 */

export type AuditEventType = 'DOCUMENT_UPLOADED' | 'DOCUMENT_SEALED';

export interface AuditEvent {
  id: string;
  eventType: AuditEventType;
  actorId: string;
  documentId: string;
  versionId: string;
  timestamp: string; // ISO 8601 UTC
  metadata?: Record<string, unknown>;
  previousEventHash: string | null;
  eventHash: string; // 64-char lowercase hexadecimal SHA-256
}

export interface CreateAuditEventInput {
  id?: string;
  eventType: AuditEventType;
  actorId: string;
  documentId: string;
  versionId: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditChainVerificationResult {
  valid: boolean;
  eventCount: number;
  brokenEventId?: string;
  reason?:
    | 'GENESIS_PREVIOUS_HASH_NOT_NULL'
    | 'PREVIOUS_HASH_MISMATCH'
    | 'EVENT_HASH_MISMATCH';
  details?: string;
}

/**
 * Append-only repository interface for persisting and retrieving audit events.
 * To be implemented with PostgreSQL/Prisma by Member 3.
 */
export interface AuditRepository {
  append(event: AuditEvent): Promise<void>;
  listByDocument(documentId: string): Promise<AuditEvent[]>;
  getLatest(documentId: string): Promise<AuditEvent | null>;
}
