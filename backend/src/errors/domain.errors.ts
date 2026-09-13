/**
 * Domain errors for NyayaVault security, integrity, and lifecycle operations.
 */

export class DomainError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}

export class DocumentNotFoundError extends DomainError {
  constructor(documentId: string) {
    super('DOCUMENT_NOT_FOUND', `Document with ID "${documentId}" was not found.`);
  }
}

export class DocumentAlreadySealedError extends DomainError {
  constructor(documentId: string) {
    super(
      'DOCUMENT_ALREADY_SEALED',
      `Document "${documentId}" is already SEALED and cannot be resealed or modified.`
    );
  }
}

export class DocumentNotSealedError extends DomainError {
  constructor(documentId: string, currentState: string = 'DRAFT') {
    super(
      'DOCUMENT_NOT_SEALED',
      `Document "${documentId}" is in state "${currentState}". Only SEALED documents can be verified.`
    );
  }
}

export class FileNotFoundError extends DomainError {
  constructor(pathOrKey: string, details?: string) {
    super(
      'FILE_NOT_FOUND',
      `Stored artifact not found for path/key "${pathOrKey}".${details ? ` ${details}` : ''}`
    );
  }
}

export class DecryptionFailedError extends DomainError {
  constructor(documentId: string, details?: string) {
    super(
      'DECRYPTION_FAILED',
      `Cryptographic decryption or authentication tag verification failed for document "${documentId}".${
        details ? ` ${details}` : ''
      }`
    );
  }
}

export class InvalidDocumentStateError extends DomainError {
  constructor(documentId: string, currentState: string, expectedState: string) {
    super(
      'INVALID_DOCUMENT_STATE',
      `Document "${documentId}" is in state "${currentState}", expected "${expectedState}".`
    );
  }
}

export class AuditChainBrokenError extends DomainError {
  constructor(documentId: string, reason: string) {
    super(
      'AUDIT_CHAIN_BROKEN',
      `Audit hash-chain verification failed for document "${documentId}": ${reason}`
    );
  }
}

export class BlockchainUnavailableError extends DomainError {
  constructor(reason: string) {
    super('BLOCKCHAIN_UNAVAILABLE', `Blockchain network or RPC provider unavailable: ${reason}`);
  }
}

export class BlockchainTransactionFailedError extends DomainError {
  constructor(operation: string, reason: string) {
    super('BLOCKCHAIN_TRANSACTION_FAILED', `Blockchain transaction failed during "${operation}": ${reason}`);
  }
}

export class BlockchainAnchorAlreadyExistsError extends DomainError {
  constructor(documentId: string, versionId: number | string) {
    super(
      'BLOCKCHAIN_ANCHOR_ALREADY_EXISTS',
      `Document "${documentId}" version ${versionId} is already anchored on-chain and cannot be overwritten.`
    );
  }
}

export class InvalidDocumentHashError extends DomainError {
  constructor(hash: string, reason?: string) {
    super(
      'BLOCKCHAIN_INVALID_HASH',
      `Invalid document hash "${hash}". Expected a 64-character hexadecimal SHA-256 digest.${reason ? ` ${reason}` : ''}`
    );
  }
}

export class InvalidDocumentIdError extends DomainError {
  constructor(documentId: string, reason?: string) {
    super(
      'BLOCKCHAIN_INVALID_ID',
      `Invalid document ID "${documentId}".${reason ? ` ${reason}` : ''}`
    );
  }
}

export class CaseNotFoundError extends DomainError {
  constructor(caseId: string) {
    super('CASE_NOT_FOUND', `Case with ID "${caseId}" was not found.`);
  }
}

export class CaseAccessDeniedError extends DomainError {
  constructor(caseId: string) {
    super('CASE_ACCESS_DENIED', `Access denied for case "${caseId}".`);
  }
}

export class InvalidCaseRequestError extends DomainError {
  constructor(reason: string) {
    super('INVALID_CASE_REQUEST', `Invalid case request: ${reason}`);
  }
}

export class CaseMemberAlreadyExistsError extends DomainError {
  constructor(caseId: string, userId: string) {
    super(
      'CASE_MEMBER_ALREADY_EXISTS',
      `User "${userId}" is already a member of case "${caseId}".`
    );
  }
}

export class UserNotFoundError extends DomainError {
  constructor(userId: string) {
    super('USER_NOT_FOUND', `User with ID "${userId}" was not found.`);
  }
}

export class InvalidFileTypeError extends DomainError {
  constructor(reason: string) {
    super('INVALID_FILE_TYPE', reason);
  }
}

export class FileTooLargeError extends DomainError {
  constructor(reason: string) {
    super('FILE_TOO_LARGE', reason);
  }
}

export class InvalidUploadRequestError extends DomainError {
  constructor(reason: string) {
    super('INVALID_UPLOAD_REQUEST', reason);
  }
}

export class UploadAuditFailedError extends DomainError {
  constructor(documentId: string, reason: string) {
    super('UPLOAD_AUDIT_FAILED', `Audit logging failed for document "${documentId}": ${reason}`);
  }
}


