import { Prisma, type PrismaClient, type AuditEvent as AuditEventEntity } from '@prisma/client';
import type { AuditRepository, AuditEvent, AuditEventType } from '../audit/audit.types.js';

/**
 * Concrete PostgreSQL AuditRepository implementation backed by Prisma ORM.
 *
 * Immutability Guarantee:
 * - Append-only design: only exposes append(), listByDocument(), and getLatest().
 * - No update or delete methods exist, ensuring tamper-evident preservation of hash-chained audit trails.
 */
export class PrismaAuditRepository implements AuditRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Appends an immutable audit event to the persistent PostgreSQL audit ledger.
   * Ensures parent Document container exists prior to event insertion.
   *
   * @param event - Validated and hashed AuditEvent to append.
   */
  public async append(event: AuditEvent): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // 1. Ensure parent Document container exists
      await tx.document.upsert({
        where: { id: event.documentId },
        update: {},
        create: { id: event.documentId },
      });

      // 2. Insert append-only audit event record
      await tx.auditEvent.create({
        data: {
          id: event.id,
          eventType: event.eventType,
          actorId: event.actorId,
          documentId: event.documentId,
          versionId: event.versionId,
          timestamp: new Date(event.timestamp),
          metadata: event.metadata ? (event.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
          previousEventHash: event.previousEventHash,
          eventHash: event.eventHash,
        },
      });
    });
  }

  /**
   * Retrieves all chronological audit events for a document, ordered chronologically.
   *
   * @param documentId - Logical document identifier.
   * @returns Array of AuditEvent records.
   */
  public async listByDocument(documentId: string): Promise<AuditEvent[]> {
    const events = await this.prisma.auditEvent.findMany({
      where: { documentId },
      orderBy: { timestamp: 'asc' },
    });

    return events.map((e) => this.mapToEvent(e));
  }

  /**
   * Retrieves the most recent audit event for a document (tip of the hash chain).
   *
   * @param documentId - Logical document identifier.
   * @returns Most recent AuditEvent or null if none exist.
   */
  public async getLatest(documentId: string): Promise<AuditEvent | null> {
    const event = await this.prisma.auditEvent.findFirst({
      where: { documentId },
      orderBy: { timestamp: 'desc' },
    });

    if (!event) return null;
    return this.mapToEvent(event);
  }

  /**
   * Maps database entity to domain AuditEvent.
   */
  private mapToEvent(entity: AuditEventEntity): AuditEvent {
    return {
      id: entity.id,
      eventType: entity.eventType as AuditEventType,
      actorId: entity.actorId,
      documentId: entity.documentId,
      versionId: entity.versionId,
      timestamp: entity.timestamp.toISOString(),
      metadata: entity.metadata ? (entity.metadata as Record<string, unknown>) : undefined,
      previousEventHash: entity.previousEventHash,
      eventHash: entity.eventHash,
    };
  }
}
