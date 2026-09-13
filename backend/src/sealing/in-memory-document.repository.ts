import type { DocumentVersionRecord, DocumentRepository } from './sealing.types.js';

/**
 * In-memory implementation of DocumentRepository for development and testing.
 */
export class InMemoryDocumentRepository implements DocumentRepository {
  private readonly records: Map<string, DocumentVersionRecord> = new Map();

  public async findById(documentId: string): Promise<DocumentVersionRecord | null> {
    const record = this.records.get(documentId);
    if (!record) return null;
    return JSON.parse(JSON.stringify(record));
  }

  public async save(record: DocumentVersionRecord): Promise<void> {
    const clone: DocumentVersionRecord = JSON.parse(JSON.stringify(record));
    this.records.set(record.documentId, clone);
  }

  public _clear(): void {
    this.records.clear();
  }
}
