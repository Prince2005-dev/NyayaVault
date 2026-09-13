export type UserRole = 'INSPECTOR' | 'FORENSIC_OFFICER' | 'AUDITOR';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface AuthSession {
  user: User;
  token: string;
}

export type CaseClassification = 'INTERNAL' | 'CONFIDENTIAL' | 'HIGHLY_RESTRICTED';

export type CaseStatus = 'ACTIVE' | 'CLOSED' | 'ARCHIVED';

export interface Case {
  id: string;
  caseNumber: string;
  firNumber: string;
  title: string;
  description?: string;
  department: string;
  policeStation: string;
  investigatingOfficer: {
    id: string;
    name: string;
  };
  classification: CaseClassification;
  status: CaseStatus;
  createdAt: string;
  updatedAt: string;
  documentCount?: number;
}

export type DocumentType =
  | 'FIR'
  | 'WITNESS_STATEMENT'
  | 'FORENSIC_REPORT'
  | 'EVIDENCE'
  | 'CHARGE_SHEET'
  | 'COURT_FILING'
  | 'LEGAL_NOTICE'
  | 'OTHER';

export type DocumentStatus = 'SEALED' | 'PENDING' | 'DRAFT' | 'ARCHIVED';

export type IntegrityStatus = 'VERIFIED' | 'PENDING' | 'MISMATCH' | 'ERROR';

export type BlockchainStatus = 'ANCHORED' | 'PENDING' | 'FAILED';

export interface DocumentItem {
  id: string;
  caseId: string;
  name: string;
  documentType: DocumentType;
  version: number;
  mimeType: string;
  size: number;
  classification: CaseClassification;
  status: DocumentStatus;
  integrityStatus: IntegrityStatus;
  blockchainStatus: BlockchainStatus;
  sha256: string;
  blockchainTxId: string;
  createdBy: {
    id: string;
    name: string;
  };
  createdAt: string;
  updatedAt?: string;
  description?: string;
  contentUrl?: string;
}

export interface VerificationResult {
  status: 'VERIFIED' | 'MISMATCH' | 'ERROR';
  originalHash: string;
  currentHash: string;
  blockchainHash: string;
  blockchainTxId: string;
  timestamp?: string;
}

export interface AuditEvent {
  id: string;
  action: string;
  actor: {
    id: string;
    name: string;
  };
  timestamp: string;
  details?: string;
}

export interface DocumentVersion {
  id?: string;
  version: number;
  createdBy: {
    id: string;
    name: string;
  };
  createdAt: string;
  status: DocumentStatus;
  sha256: string;
  blockchainTxId?: string;
  isCurrent: boolean;
  size?: number;
  mimeType?: string;
  description?: string;
}

export interface ApiError {
  code: string;
  message: string;
  status?: number;
}
