import type { AuditEvent, AuditRepository } from './audit.types.js';

/**
 * In-memory implementation of AuditRepository for development and unit testing.
 * Stores events in an append-only map grouped by document ID.
 */
export class InMemoryAuditRepository implements AuditRepository {
  private readonly eventsByDocument: Map<string, AuditEvent[]> = new Map();

  public async append(event: AuditEvent): Promise<void> {
    const list = this.eventsByDocument.get(event.documentId) || [];
    // Deep clone to ensure immutability
    const clone: AuditEvent = JSON.parse(JSON.stringify(event));
    list.push(clone);
    this.eventsByDocument.set(event.documentId, list);
  }

  public async listByDocument(documentId: string): Promise<AuditEvent[]> {
    const list = this.eventsByDocument.get(documentId) || [];
    // Return copies so callers cannot mutate internal state
    return JSON.parse(JSON.stringify(list));
  }

  public async getLatest(documentId: string): Promise<AuditEvent | null> {
    const list = this.eventsByDocument.get(documentId) || [];
    if (list.length === 0) return null;
    return JSON.parse(JSON.stringify(list[list.length - 1]));
  }

  /**
   * Test-only helper: directly mutates an existing event in-memory to simulate tampering.
   * This is explicitly NOT exposed on the public AuditService.
   */
  public _simulateTamper(documentId: string, eventIndex: number, mutation: Partial<AuditEvent>): void {
    const list = this.eventsByDocument.get(documentId);
    if (!list || !list[eventIndex]) {
      throw new Error(`Cannot simulate tamper: Event at index ${eventIndex} does not exist for doc "${documentId}".`);
    }
    list[eventIndex] = { ...list[eventIndex], ...mutation };
  }

  /**
   * Test-only helper: clear repository state.
   */
  public _clear(): void {
    this.eventsByDocument.clear();
  }
}
