import type {
  AuditEvent,
  Case,
  DocumentItem,
  DocumentVersion,
  User,
  VerificationResult,
} from '../types';
import { AppApiError } from './errors';
import { mockAdapter } from './mock-adapter';

// Read API Base URL from environment variable as mandated.
// In production builds where VITE_API_BASE_URL is not set, default to relative '/api' rather than localhost.
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.PROD ? '/api' : 'http://localhost:4000/api');

// Configurable mock adapter toggle
// - Development can explicitly enable mock mode with: VITE_USE_MOCK_API=true
// - Live/local environments work when: VITE_USE_MOCK_API=false
// - Production builds MUST default to LIVE mode (false) when the variable is missing
const rawMockEnv = import.meta.env.VITE_USE_MOCK_API;
const USE_MOCK_API =
  rawMockEnv !== undefined && rawMockEnv !== ''
    ? String(rawMockEnv).toLowerCase() === 'true' || rawMockEnv === '1'
    : false;

const TOKEN_STORAGE_KEY = 'nyaya_vault_token';

class ApiClient {
  private baseUrl: string;
  private token: string | null = null;
  private currentUser: User | null = null;

  constructor() {
    this.baseUrl = API_BASE_URL.replace(/\/+$/, '');
    this.token = localStorage.getItem(TOKEN_STORAGE_KEY);
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public isUsingMocks(): boolean {
    return USE_MOCK_API;
  }

  public setToken(token: string | null): void {
    this.token = token;
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      this.currentUser = null;
    }
  }

  public getToken(): string | null {
    return this.token;
  }

  public setCurrentUser(user: User | null): void {
    this.currentUser = user;
  }

  public getCurrentUser(): User | null {
    return this.currentUser;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    if (!(options.body instanceof FormData) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    try {
      const response = await fetch(url, { ...options, headers });

      if (!response.ok) {
        let errorData: { error?: { code?: string; message?: string }; message?: string } | null = null;
        try {
          errorData = await response.json();
        } catch {
          // Response was not JSON
        }

        const code = errorData?.error?.code || `HTTP_${response.status}`;
        const message =
          errorData?.error?.message ||
          errorData?.message ||
          `Request failed with status ${response.status}`;
        throw new AppApiError(code, message, response.status);
      }

      if (response.status === 204) {
        return {} as T;
      }

      return (await response.json()) as T;
    } catch (err) {
      if (err instanceof AppApiError) {
        throw err;
      }
      throw new AppApiError(
        'NETWORK_ERROR',
        'Could not connect to NyayaVault API. Check network or server status.'
      );
    }
  }

  // --- Auth endpoints ---
  public auth = {
    login: async (email: string, _password?: string): Promise<{ user: User; token: string }> => {
      if (USE_MOCK_API) {
        const result = await mockAdapter.login(email);
        this.setToken(result.token);
        this.setCurrentUser(result.user);
        return result;
      }

      const result = await this.request<{ user: User; token: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password: _password }),
      });
      this.setToken(result.token);
      this.setCurrentUser(result.user);
      return result;
    },

    me: async (): Promise<User> => {
      if (USE_MOCK_API) {
        if (!this.token) {
          throw new AppApiError('UNAUTHORIZED', 'No authenticated session.', 401);
        }
        const user = await mockAdapter.getCurrentUser(this.token);
        this.setCurrentUser(user);
        return user;
      }

      const result = await this.request<{ user?: User } | User>('/auth/me', {
        method: 'GET',
      });
      const user = (result && 'user' in result && result.user) ? result.user : (result as User);
      this.setCurrentUser(user);
      return user;
    },

    logout: async (): Promise<{ success: boolean }> => {
      try {
        if (!USE_MOCK_API) {
          await this.request('/auth/logout', { method: 'POST' });
        } else {
          await mockAdapter.logout();
        }
      } finally {
        this.setToken(null);
      }
      return { success: true };
    },
  };

  // --- Cases endpoints ---
  public cases = {
    list: async (params?: { search?: string; status?: string; classification?: string }): Promise<Case[]> => {
      if (USE_MOCK_API) {
        return mockAdapter.getCases(params);
      }
      const query = new URLSearchParams();
      if (params?.search) query.set('search', params.search);
      if (params?.status && params.status !== 'ALL') query.set('status', params.status);
      if (params?.classification && params.classification !== 'ALL') {
        query.set('classification', params.classification);
      }
      const qs = query.toString() ? `?${query.toString()}` : '';
      return this.request<Case[]>(`/cases${qs}`, { method: 'GET' });
    },

    get: async (id: string): Promise<Case> => {
      if (USE_MOCK_API) {
        return mockAdapter.getCaseById(id);
      }
      return this.request<Case>(`/cases/${id}`, { method: 'GET' });
    },

    create: async (data: Partial<Case>): Promise<Case> => {
      if (USE_MOCK_API) {
        const user = this.currentUser || {
          id: 'usr_001',
          name: 'Inspector Sharma',
          email: 'inspector@nyayavault.local',
          role: 'INSPECTOR',
        };
        return mockAdapter.createCase(data, user);
      }
      return this.request<Case>('/cases', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
  };

  // --- Documents endpoints ---
  public documents = {
    listByCase: async (caseId: string): Promise<DocumentItem[]> => {
      if (USE_MOCK_API) {
        return mockAdapter.getCaseDocuments(caseId);
      }
      return this.request<DocumentItem[]>(`/cases/${caseId}/documents`, { method: 'GET' });
    },

    get: async (id: string): Promise<DocumentItem> => {
      if (USE_MOCK_API) {
        return mockAdapter.getDocumentById(id);
      }
      return this.request<DocumentItem>(`/documents/${id}`, { method: 'GET' });
    },

    upload: async (
      caseId: string,
      file: File,
      metadata: {
        documentType: DocumentItem['documentType'];
        title: string;
        classification: Case['classification'];
        description?: string;
      }
    ): Promise<DocumentItem> => {
      if (USE_MOCK_API) {
        const user = this.currentUser || {
          id: 'usr_001',
          name: 'Inspector Sharma',
          email: 'inspector@nyayavault.local',
          role: 'INSPECTOR',
        };
        return mockAdapter.uploadDocument(caseId, file, metadata, user);
      }

      const formData = new FormData();
      formData.append('file', file);
      formData.append('documentType', metadata.documentType);
      formData.append('title', metadata.title);
      formData.append('classification', metadata.classification);
      if (metadata.description) {
        formData.append('description', metadata.description);
      }

      return this.request<DocumentItem>(`/cases/${caseId}/documents`, {
        method: 'POST',
        body: formData,
      });
    },

    download: async (id: string): Promise<Blob> => {
      if (USE_MOCK_API) {
        // Return dummy text blob for mock download
        const doc = await mockAdapter.getDocumentById(id);
        const dummyText = `NYAYAVAULT SECURE ARCHIVE RECORD\nDocument ID: ${doc.id}\nName: ${doc.name}\nSHA-256: ${doc.sha256}\nBlockchain Tx: ${doc.blockchainTxId}\nStatus: ${doc.status}\nIntegrity: ${doc.integrityStatus}\nSealed on: ${doc.createdAt}\n`;
        return new Blob([dummyText], { type: doc.mimeType });
      }

      const url = `${this.baseUrl}/documents/${id}/download`;
      const response = await fetch(url, {
        headers: this.token ? { Authorization: `Bearer ${this.token}` } : {},
      });
      if (!response.ok) {
        throw new AppApiError('DOWNLOAD_FAILED', 'Failed to retrieve document from storage.', response.status);
      }
      return response.blob();
    },

    seal: async (id: string): Promise<{ version: unknown; blockchain?: unknown }> => {
      if (USE_MOCK_API) {
        return {
          version: {
            id: `ver_${id}_1`,
            documentId: id,
            versionNumber: 1,
            sha256Hash: 'mock-sealed-hash',
            status: 'SEALED',
            createdAt: new Date().toISOString(),
            createdBy: 'usr_001',
          },
          blockchain: {
            status: 'ANCHORED',
            transactionHash: '0xmock',
          },
        };
      }
      return this.request<{ version: unknown; blockchain?: unknown }>(
        `/documents/${id}/seal`,
        { method: 'POST' }
      );
    },

    verify: async (id: string): Promise<VerificationResult> => {
      if (USE_MOCK_API) {
        return mockAdapter.verifyDocument(id);
      }
      return this.request<VerificationResult>(`/documents/${id}/verify`, { method: 'POST' });
    },

    audit: async (id: string): Promise<{ events: AuditEvent[] }> => {
      if (USE_MOCK_API) {
        return mockAdapter.getDocumentAudit(id);
      }
      const result = await this.request<{ events?: AuditEvent[] } | AuditEvent[]>(`/documents/${id}/audit`, { method: 'GET' });
      if (Array.isArray(result)) {
        return { events: result };
      }
      return { events: result.events || [] };
    },

    versions: async (id: string): Promise<DocumentVersion[]> => {
      if (USE_MOCK_API) {
        return mockAdapter.getDocumentVersions(id);
      }
      return this.request<DocumentVersion[]>(`/documents/${id}/versions`, { method: 'GET' });
    },
  };

  // Test helper: toggle tamper state in mock mode
  public toggleSimulateTamper(id: string): boolean {
    if (USE_MOCK_API) {
      return mockAdapter.toggleSimulateTamper(id);
    }
    return false;
  }

  public isSimulatedTampered(id: string): boolean {
    if (USE_MOCK_API) {
      return mockAdapter.isSimulatedTampered(id);
    }
    return false;
  }
}

export const api = new ApiClient();
