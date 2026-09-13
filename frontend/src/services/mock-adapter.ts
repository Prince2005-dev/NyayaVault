import type {
  AuditEvent,
  Case,
  DocumentItem,
  DocumentVersion,
  User,
  VerificationResult,
} from '../types';
import { AppApiError } from './errors';

// Seed demo users (strictly non-production, demo credential hints)
const DEMO_USERS: User[] = [
  {
    id: 'usr_001',
    name: 'Inspector Sharma',
    email: 'inspector@nyayavault.local',
    role: 'INSPECTOR',
  },
  {
    id: 'usr_002',
    name: 'Dr. A. Verma (Forensic)',
    email: 'forensic@nyayavault.local',
    role: 'FORENSIC_OFFICER',
  },
  {
    id: 'usr_003',
    name: 'Auditor K. Patel',
    email: 'auditor@nyayavault.local',
    role: 'AUDITOR',
  },
];

let DEMO_CASES: Case[] = [
  {
    id: 'case_001',
    caseNumber: 'CASE-2026-001',
    firNumber: 'FIR/2026/001',
    title: 'Sensitive Investigation Case',
    description: 'High-priority evidentiary investigation under secure chain-of-custody protocols.',
    department: 'Women Safety Division',
    policeStation: 'Central Station',
    investigatingOfficer: {
      id: 'usr_001',
      name: 'Inspector Sharma',
    },
    classification: 'HIGHLY_RESTRICTED',
    status: 'ACTIVE',
    createdAt: '2026-09-11T10:30:00Z',
    updatedAt: '2026-09-11T10:35:00Z',
    documentCount: 4,
  },
  {
    id: 'case_002',
    caseNumber: 'CASE-2026-042',
    firNumber: 'FIR/2026/089',
    title: 'Cyber Fraud & Financial Ledger Breach',
    description: 'Investigation into unauthorized alteration of municipal contract ledgers.',
    department: 'Cyber Crime Division',
    policeStation: 'Cyber HQ',
    investigatingOfficer: {
      id: 'usr_001',
      name: 'Inspector Sharma',
    },
    classification: 'CONFIDENTIAL',
    status: 'ACTIVE',
    createdAt: '2026-09-08T09:15:00Z',
    updatedAt: '2026-09-10T14:20:00Z',
    documentCount: 2,
  },
  {
    id: 'case_003',
    caseNumber: 'CASE-2025-188',
    firNumber: 'FIR/2025/512',
    title: 'Commercial Tax Document Forgery Inquiry',
    description: 'Archive inquiry regarding forged stamp papers and registration entries.',
    department: 'Economic Offences Wing',
    policeStation: 'Financial District PS',
    investigatingOfficer: {
      id: 'usr_002',
      name: 'Dr. A. Verma (Forensic)',
    },
    classification: 'INTERNAL',
    status: 'CLOSED',
    createdAt: '2025-11-04T11:00:00Z',
    updatedAt: '2025-12-20T16:45:00Z',
    documentCount: 1,
  },
];

let DEMO_DOCUMENTS: DocumentItem[] = [
  {
    id: 'doc_001',
    caseId: 'case_001',
    name: 'Forensic_Report.pdf',
    documentType: 'FORENSIC_REPORT',
    version: 1,
    mimeType: 'application/pdf',
    size: 245678,
    classification: 'HIGHLY_RESTRICTED',
    status: 'SEALED',
    integrityStatus: 'VERIFIED',
    blockchainStatus: 'ANCHORED',
    sha256: 'a81f92c10b7454839de848a91316b23d06e300183b102ef70d249f05f7ff72a1',
    blockchainTxId: '0x82ab692e847c1b0179d639b98ec349a888c3a1005b8cfbf4df629c4883d690a2',
    createdBy: {
      id: 'usr_001',
      name: 'Inspector Sharma',
    },
    createdAt: '2026-09-11T10:35:00Z',
    updatedAt: '2026-09-11T10:36:00Z',
    description: 'Ballistics and chemical analysis laboratory examination results.',
  },
  {
    id: 'doc_002',
    caseId: 'case_001',
    name: 'FIR_Initial_Report.pdf',
    documentType: 'FIR',
    version: 1,
    mimeType: 'application/pdf',
    size: 184320,
    classification: 'HIGHLY_RESTRICTED',
    status: 'SEALED',
    integrityStatus: 'VERIFIED',
    blockchainStatus: 'ANCHORED',
    sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    blockchainTxId: '0x19ffb82c19a94158ba994c92138ebdc10459c0388147d3298a0029efb988f01b',
    createdBy: {
      id: 'usr_001',
      name: 'Inspector Sharma',
    },
    createdAt: '2026-09-11T10:30:00Z',
    updatedAt: '2026-09-11T10:31:00Z',
    description: 'Certified First Information Report registered at Central Station.',
  },
  {
    id: 'doc_003',
    caseId: 'case_001',
    name: 'Seized_Device_Evidence.jpg',
    documentType: 'EVIDENCE',
    version: 1,
    mimeType: 'image/jpeg',
    size: 512400,
    classification: 'HIGHLY_RESTRICTED',
    status: 'SEALED',
    integrityStatus: 'VERIFIED',
    blockchainStatus: 'ANCHORED',
    sha256: 'c839f99201948b839200aa912837bc0991823901aab987210192837123980123',
    blockchainTxId: '0x48bb7301cfa901238918274bbad9081239102938472910283746192837465019',
    createdBy: {
      id: 'usr_001',
      name: 'Inspector Sharma',
    },
    createdAt: '2026-09-11T10:32:00Z',
    updatedAt: '2026-09-11T10:33:00Z',
    description: 'Photographic evidence of recovered digital media hardware at location.',
  },
  {
    id: 'doc_004',
    caseId: 'case_001',
    name: 'Witness_Statement.pdf',
    documentType: 'WITNESS_STATEMENT',
    version: 1,
    mimeType: 'application/pdf',
    size: 142100,
    classification: 'CONFIDENTIAL',
    status: 'SEALED',
    integrityStatus: 'VERIFIED',
    blockchainStatus: 'ANCHORED',
    sha256: '71ab89201948b839200aa912837bc0991823901aab9872101928371239804471',
    blockchainTxId: '0x99cc4821cba01238918274bbad90812391029384729102837461928374651918',
    createdBy: {
      id: 'usr_001',
      name: 'Inspector Sharma',
    },
    createdAt: '2026-09-11T10:40:00Z',
    updatedAt: '2026-09-11T10:42:00Z',
    description: 'Recorded sworn statement of the primary complainant.',
  },
];

const DEMO_AUDIT_EVENTS: Record<string, AuditEvent[]> = {
  doc_001: [
    {
      id: 'aud_001',
      action: 'DOCUMENT_UPLOADED',
      actor: { id: 'usr_001', name: 'Inspector Sharma' },
      timestamp: '2026-09-11T10:35:00Z',
      details: 'Forensic_Report.pdf uploaded with SHA-256 digest.',
    },
    {
      id: 'aud_002',
      action: 'HASH_VERIFIED',
      actor: { id: 'usr_001', name: 'Inspector Sharma' },
      timestamp: '2026-09-11T10:35:30Z',
      details: 'Payload integrity check succeeded prior to storage lock.',
    },
    {
      id: 'aud_003',
      action: 'DOCUMENT_SEALED',
      actor: { id: 'usr_001', name: 'Inspector Sharma' },
      timestamp: '2026-09-11T10:36:00Z',
      details: 'Document marked immutable (SEALED) by custodian.',
    },
    {
      id: 'aud_004',
      action: 'BLOCKCHAIN_ANCHOR_RECORDED',
      actor: { id: 'usr_001', name: 'Inspector Sharma' },
      timestamp: '2026-09-11T10:36:45Z',
      details: 'Anchor tx 0x82ab692e847c1b0179d639b98ec349a888c3a1005b8cfbf4df629c4883d690a2 confirmed.',
    },
  ],
};

// Simulation state for tampering demonstration test
const TAMPER_FLAGS: Record<string, boolean> = {};

export const mockAdapter = {
  async login(email: string): Promise<{ user: User; token: string }> {
    await new Promise((r) => setTimeout(r, 400));
    const user = DEMO_USERS.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    if (!user) {
      throw new AppApiError(
        'AUTH_INVALID_CREDENTIALS',
        'Invalid credentials. Please select or enter one of the demo accounts.',
        401
      );
    }
    const token = `nyaya_jwt_demo_${user.id}_${Date.now()}`;
    return { user, token };
  },

  async getCurrentUser(token: string): Promise<User> {
    await new Promise((r) => setTimeout(r, 150));
    const userId = token.includes('usr_002')
      ? 'usr_002'
      : token.includes('usr_003')
        ? 'usr_003'
        : 'usr_001';
    const user = DEMO_USERS.find((u) => u.id === userId);
    if (!user) {
      throw new AppApiError('UNAUTHORIZED', 'Session expired. Please log in again.', 401);
    }
    return user;
  },

  async logout(): Promise<{ success: boolean }> {
    await new Promise((r) => setTimeout(r, 150));
    return { success: true };
  },

  async getCases(params?: { search?: string; status?: string; classification?: string }): Promise<Case[]> {
    await new Promise((r) => setTimeout(r, 250));
    let filtered = [...DEMO_CASES];
    if (params?.search) {
      const q = params.search.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.caseNumber.toLowerCase().includes(q) ||
          c.firNumber.toLowerCase().includes(q) ||
          c.title.toLowerCase().includes(q)
      );
    }
    if (params?.status && params.status !== 'ALL') {
      filtered = filtered.filter((c) => c.status === params.status);
    }
    if (params?.classification && params.classification !== 'ALL') {
      filtered = filtered.filter((c) => c.classification === params.classification);
    }
    return filtered;
  },

  async getCaseById(id: string): Promise<Case> {
    await new Promise((r) => setTimeout(r, 200));
    const found = DEMO_CASES.find((c) => c.id === id);
    if (!found) {
      throw new AppApiError('CASE_NOT_FOUND', `Case ${id} was not found on server.`, 404);
    }
    return found;
  },

  async createCase(data: Partial<Case>, currentUser: User): Promise<Case> {
    await new Promise((r) => setTimeout(r, 450));
    const newId = `case_${String(DEMO_CASES.length + 1).padStart(3, '0')}`;
    const newCase: Case = {
      id: newId,
      caseNumber: `CASE-2026-${String(DEMO_CASES.length + 1).padStart(3, '0')}`,
      firNumber: data.firNumber || `FIR/2026/${String(Math.floor(100 + Math.random() * 900))}`,
      title: data.title || 'Untitled Case',
      description: data.description || '',
      department: data.department || 'Central Legal Division',
      policeStation: data.policeStation || 'Central PS',
      investigatingOfficer: {
        id: currentUser.id,
        name: currentUser.name,
      },
      classification: data.classification || 'CONFIDENTIAL',
      status: data.status || 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      documentCount: 0,
    };
    DEMO_CASES.unshift(newCase);
    return newCase;
  },

  async getCaseDocuments(caseId: string): Promise<DocumentItem[]> {
    await new Promise((r) => setTimeout(r, 200));
    return DEMO_DOCUMENTS.filter((d) => d.caseId === caseId);
  },

  async getDocumentById(id: string): Promise<DocumentItem> {
    await new Promise((r) => setTimeout(r, 200));
    const doc = DEMO_DOCUMENTS.find((d) => d.id === id);
    if (!doc) {
      throw new AppApiError('DOCUMENT_NOT_FOUND', `Document ${id} not found.`, 404);
    }
    return doc;
  },

  async uploadDocument(
    caseId: string,
    file: File,
    metadata: {
      documentType: DocumentItem['documentType'];
      title: string;
      classification: Case['classification'];
      description?: string;
    },
    currentUser: User
  ): Promise<DocumentItem> {
    await new Promise((r) => setTimeout(r, 600));
    const newId = `doc_${String(DEMO_DOCUMENTS.length + 1).padStart(3, '0')}`;
    const pseudoHash = Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    const pseudoTx = '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

    const newDoc: DocumentItem = {
      id: newId,
      caseId,
      name: file.name || `${metadata.title}.pdf`,
      documentType: metadata.documentType,
      version: 1,
      mimeType: file.type || 'application/pdf',
      size: file.size || 102400,
      classification: metadata.classification,
      status: 'SEALED',
      integrityStatus: 'VERIFIED',
      blockchainStatus: 'ANCHORED',
      sha256: pseudoHash,
      blockchainTxId: pseudoTx,
      createdBy: {
        id: currentUser.id,
        name: currentUser.name,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      description: metadata.description,
    };

    DEMO_DOCUMENTS.unshift(newDoc);

    // Update case documentCount
    const targetCase = DEMO_CASES.find((c) => c.id === caseId);
    if (targetCase) {
      targetCase.documentCount = (targetCase.documentCount || 0) + 1;
    }

    // Seed audit trail
    DEMO_AUDIT_EVENTS[newId] = [
      {
        id: `aud_${Date.now()}_1`,
        action: 'DOCUMENT_UPLOADED',
        actor: { id: currentUser.id, name: currentUser.name },
        timestamp: newDoc.createdAt,
        details: `${newDoc.name} uploaded and registered.`,
      },
      {
        id: `aud_${Date.now()}_2`,
        action: 'DOCUMENT_SEALED',
        actor: { id: currentUser.id, name: currentUser.name },
        timestamp: newDoc.createdAt,
        details: 'Hash generated and sealed in secure ledger.',
      },
    ];

    return newDoc;
  },

  async verifyDocument(id: string): Promise<VerificationResult> {
    await new Promise((r) => setTimeout(r, 500));
    const doc = DEMO_DOCUMENTS.find((d) => d.id === id);
    if (!doc) {
      throw new AppApiError('DOCUMENT_NOT_FOUND', `Document ${id} not found.`, 404);
    }

    const isTampered = TAMPER_FLAGS[id] === true;

    if (isTampered) {
      return {
        status: 'MISMATCH',
        originalHash: doc.sha256,
        currentHash: '73bd11946fe202b938f90018b100827361928374619283746591823746192837',
        blockchainHash: doc.sha256,
        blockchainTxId: doc.blockchainTxId,
        timestamp: new Date().toISOString(),
      };
    }

    return {
      status: 'VERIFIED',
      originalHash: doc.sha256,
      currentHash: doc.sha256,
      blockchainHash: doc.sha256,
      blockchainTxId: doc.blockchainTxId,
      timestamp: new Date().toISOString(),
    };
  },

  // Helper for test/demo mode to toggle tamper state
  toggleSimulateTamper(id: string): boolean {
    TAMPER_FLAGS[id] = !TAMPER_FLAGS[id];
    return TAMPER_FLAGS[id];
  },

  isSimulatedTampered(id: string): boolean {
    return TAMPER_FLAGS[id] === true;
  },

  async getDocumentAudit(id: string): Promise<{ events: AuditEvent[] }> {
    await new Promise((r) => setTimeout(r, 200));
    return {
      events: DEMO_AUDIT_EVENTS[id] || [
        {
          id: 'aud_def_1',
          action: 'DOCUMENT_RECORDED',
          actor: { id: 'usr_001', name: 'Inspector Sharma' },
          timestamp: '2026-09-11T10:30:00Z',
          details: 'Document registered with initial hash.',
        },
      ],
    };
  },

  async getDocumentVersions(id: string): Promise<DocumentVersion[]> {
    await new Promise((r) => setTimeout(r, 200));
    const doc = DEMO_DOCUMENTS.find((d) => d.id === id);
    if (!doc) return [];
    return [
      {
        id: `ver_${doc.id}_${doc.version}`,
        version: doc.version,
        createdBy: doc.createdBy,
        createdAt: doc.createdAt,
        status: doc.status,
        sha256: doc.sha256,
        blockchainTxId: doc.blockchainTxId,
        isCurrent: true,
        size: doc.size,
        mimeType: doc.mimeType,
      },
    ];
  },
};
