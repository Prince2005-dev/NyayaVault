# NyayaVault Frontend API Contract Specification

**Version:** 1.0.0 (SIH26190 Prototype — Member 1 Frontend Core DMS)  
**Date:** September 2026  
**Status:** Integration Ready  
**Audience:** Member 3 (Backend API & Security Integration Engineer) & Member 2 (Blockchain & Storage Engineer)

---

## 1. Overview & Architectural Principles

1. **Centralized Client:** All frontend components communicate exclusively via `api` (`frontend/src/services/api-client.ts`). Individual UI pages and components NEVER make ad-hoc `fetch` or `axios` calls.
2. **Environment Configuration:**
   - Base URL is derived from `VITE_API_BASE_URL` (default: `http://localhost:4000/api`).
   - Mock mode is toggled via `VITE_USE_MOCK_API` (`true` for isolated demo, `false` for live backend).
3. **Authorization:** Authenticated endpoints require `Authorization: Bearer <token>` header. Token is obtained via `/auth/login` and managed centrally.
4. **Error Protocol:** Standardized error response envelope:
   ```json
   {
     "error": {
       "code": "ERROR_CODE_STRING",
       "message": "Human readable error description."
     }
   }
   ```
5. **Security Isolation:** The frontend operates strictly as an untrusted presentation layer. It does NOT compute SHA-256 digests, execute AES encryption, mint blockchain transactions, or issue cryptographic certificates.

---

## 2. Authentication Contracts

### `POST /api/auth/login`
- **Purpose:** Authenticate legal officer / investigator and establish session.
- **Auth Required:** None (Public).
- **Content-Type:** `application/json`
- **Request Shape:**
  ```json
  {
    "email": "inspector@nyayavault.local",
    "password": "optional_or_required_password"
  }
  ```
- **Response Shape (200 OK):**
  ```json
  {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "usr_001",
      "name": "Inspector Sharma",
      "email": "inspector@nyayavault.local",
      "role": "INSPECTOR",
      "badgeNumber": "IND-POL-8842",
      "department": "Cyber Crime Investigation Cell"
    }
  }
  ```
  *(Supported `role` values: `'JUDGE' | 'LAWYER' | 'POLICE' | 'CLERK' | 'INSPECTOR' | 'FORENSIC_OFFICER' | 'AUDITOR'`)*
- **Expected Error Behavior:**
  - `401 Unauthorized` with code `AUTH_FAILED` or `INVALID_CREDENTIALS`.

---

### `GET /api/auth/me`
- **Purpose:** Verify token validity and fetch currently authenticated user profile on app load / refresh.
- **Auth Required:** `Authorization: Bearer <token>`
- **Request Shape:** Empty body.
- **Response Shape (200 OK):**
  ```json
  {
    "user": {
      "id": "usr_001",
      "name": "Inspector Sharma",
      "email": "inspector@nyayavault.local",
      "role": "INSPECTOR",
      "badgeNumber": "IND-POL-8842",
      "department": "Cyber Crime Investigation Cell"
    }
  }
  ```
  *(Frontend client also supports direct `{ id, name, ... }` without the outer `user` wrapper).*
- **Expected Error Behavior:**
  - `401 Unauthorized` with code `UNAUTHORIZED` or `SESSION_EXPIRED` (clears local token and redirects to `/login`).

---

### `POST /api/auth/logout`
- **Purpose:** Invalidate token session on server.
- **Auth Required:** `Authorization: Bearer <token>`
- **Request Shape:** Empty body.
- **Response Shape (200 OK / 204 No Content):**
  ```json
  {
    "success": true
  }
  ```
- **Expected Error Behavior:** Handled gracefully; frontend clears client session token regardless of response status.

---

## 3. Case Management Contracts

### `GET /api/cases`
- **Purpose:** Retrieve case inventory for dashboard and cases directory table.
- **Auth Required:** `Authorization: Bearer <token>`
- **Query Parameters:**
  - `search?: string` (matches case number, title, or description)
  - `status?: 'PENDING' | 'ACTIVE' | 'RESOLVED' | 'CLOSED' | 'ARCHIVED'`
  - `classification?: 'PUBLIC' | 'CONFIDENTIAL' | 'RESTRICTED' | 'HIGHLY_RESTRICTED' | 'INTERNAL'`
- **Response Shape (200 OK):** Array of `Case` items:
  ```json
  [
    {
      "id": "case_001",
      "caseNumber": "CR-2026-0891",
      "title": "State vs. TechCorp Evidence Vault Tampering",
      "description": "Seized electronic evidence and cryptographic chain logs.",
      "assignedOfficer": {
        "id": "usr_001",
        "name": "Inspector Sharma"
      },
      "classification": "HIGHLY_RESTRICTED",
      "status": "ACTIVE",
      "createdAt": "2026-09-10T09:00:00Z",
      "updatedAt": "2026-09-11T10:36:00Z",
      "documentCount": 4
    }
  ]
  ```
- **Expected Error Behavior:**
  - `401 Unauthorized`
  - `500 Server Error`

---

### `POST /api/cases`
- **Purpose:** Register a new case file in the custody system.
- **Auth Required:** `Authorization: Bearer <token>`
- **Content-Type:** `application/json`
- **Request Shape:**
  ```json
  {
    "caseNumber": "CR-2026-0902",
    "title": "State vs. Apex Financial Ledger Discrepancy",
    "description": "Financial records and server audit exports.",
    "classification": "CONFIDENTIAL",
    "status": "ACTIVE"
  }
  ```
- **Response Shape (201 Created):** Newly created `Case` object (including assigned `id`, timestamps, and `documentCount: 0`).
- **Expected Error Behavior:**
  - `400 Bad Request` with code `VALIDATION_ERROR` (e.g. duplicate case number or missing required fields).

---

### `GET /api/cases/:id`
- **Purpose:** Retrieve detailed metadata for a specific case file.
- **Auth Required:** `Authorization: Bearer <token>`
- **Route Parameters:** `id: string` (e.g. `case_001` or UUID)
- **Response Shape (200 OK):** Single `Case` item:
  ```json
  {
    "id": "case_001",
    "caseNumber": "CR-2026-0891",
    "title": "State vs. TechCorp Evidence Vault Tampering",
    "description": "Seized electronic evidence and cryptographic chain logs.",
    "assignedOfficer": {
      "id": "usr_001",
      "name": "Inspector Sharma"
    },
    "classification": "HIGHLY_RESTRICTED",
    "status": "ACTIVE",
    "createdAt": "2026-09-10T09:00:00Z",
    "updatedAt": "2026-09-11T10:36:00Z",
    "documentCount": 4
  }
  ```
- **Expected Error Behavior:**
  - `404 Not Found` with code `CASE_NOT_FOUND`.

---

## 4. Document Management Contracts

### `GET /api/cases/:caseId/documents`
- **Purpose:** Retrieve all evidence documents registered under a specific case.
- **Auth Required:** `Authorization: Bearer <token>`
- **Route Parameters:** `caseId: string`
- **Response Shape (200 OK):** Array of `DocumentItem`:
  ```json
  [
    {
      "id": "doc_001",
      "caseId": "case_001",
      "name": "Forensic_Report.pdf",
      "documentType": "FORENSIC_REPORT",
      "version": 1,
      "mimeType": "application/pdf",
      "size": 245678,
      "classification": "HIGHLY_RESTRICTED",
      "status": "SEALED",
      "integrityStatus": "VERIFIED",
      "blockchainStatus": "ANCHORED",
      "sha256": "a81f92c10b7454839de848a91316b23d06e300183b102ef70d249f05f7ff72a1",
      "blockchainTxId": "0x82ab692e847c1b0179d639b98ec349a888c3a1005b8cfbf4df629c4883d690a2",
      "createdBy": {
        "id": "usr_001",
        "name": "Inspector Sharma"
      },
      "createdAt": "2026-09-11T10:35:00Z",
      "updatedAt": "2026-09-11T10:36:00Z",
      "description": "Ballistics and chemical analysis laboratory examination results."
    }
  ]
  ```
  *(Supported `documentType` values: `'FIR' | 'CHARGE_SHEET' | 'FORENSIC_REPORT' | 'WITNESS_STATEMENT' | 'COURT_ORDER' | 'EVIDENCE' | 'OTHER'`)*  
  *(Supported `status` values: `'DRAFT' | 'SUBMITTED' | 'SEALED' | 'ARCHIVED'`)*  
  *(Supported `integrityStatus` values: `'PENDING' | 'VERIFIED' | 'MISMATCH' | 'TAMPERED'`)*  
  *(Supported `blockchainStatus` values: `'NOT_ANCHORED' | 'PENDING' | 'ANCHORED' | 'FAILED'`)*

---

### `POST /api/cases/:caseId/documents` (Upload)
- **Purpose:** Upload evidence binary and register document in custody vault.
- **Auth Required:** `Authorization: Bearer <token>`
- **Content-Type:** `multipart/form-data`
- **Form Fields:**
  - `file`: File binary (supported: PDF, PNG, JPEG, DOCX up to 50MB)
  - `documentType`: string (e.g. `'FORENSIC_REPORT'`)
  - `title`: string (human-readable title)
  - `classification`: string (`'HIGHLY_RESTRICTED'`, `'CONFIDENTIAL'`, etc.)
  - `description`: optional string
- **Backend Responsibilities on Receipt:**
  - Store binary in secure storage (S3/IPFS/MinIO).
  - Compute SHA-256 hash server-side.
  - Anchor hash or schedule blockchain transaction.
  - Return the initialized `DocumentItem`.
- **Response Shape (201 Created):** Newly created `DocumentItem` object.
- **Expected Error Behavior:**
  - `400 Bad Request` with code `INVALID_FILE_TYPE` or `MISSING_METADATA`.
  - `413 Payload Too Large` with code `FILE_SIZE_EXCEEDED` (> 50MB).

---

### `GET /api/documents/:id`
- **Purpose:** Retrieve comprehensive metadata and trust status for a single document.
- **Auth Required:** `Authorization: Bearer <token>`
- **Route Parameters:** `id: string`
- **Response Shape (200 OK):** Single `DocumentItem` object.
- **Expected Error Behavior:**
  - `404 Not Found` with code `DOCUMENT_NOT_FOUND`.

---

### `GET /api/documents/:id/download`
- **Purpose:** Stream authorized binary file content for in-browser PDF/image preview or local download.
- **Auth Required:** `Authorization: Bearer <token>`
- **Route Parameters:** `id: string`
- **Response Format:** Raw binary stream (`application/octet-stream`, `application/pdf`, `image/jpeg`, etc.).
- **Response Headers Expected:**
  - `Content-Type`: mime type of the stored document
  - `Content-Disposition`: `attachment; filename="Forensic_Report.pdf"` (or `inline`)
- **Client Handling:** Frontend reads as `response.blob()`, creates ephemeral `window.URL.createObjectURL(blob)`, and immediately revokes it upon completion or component unmount.
- **Expected Error Behavior:**
  - `403 Forbidden` with code `DOWNLOAD_RESTRICTED`.
  - `404 Not Found` with code `STORAGE_FILE_NOT_FOUND`.

---

## 5. Trust & Verification Contracts

### `POST /api/documents/:id/verify`
- **Purpose:** Request an authoritative cryptographic verification of a document's current stored bytes against its immutable blockchain anchor.
- **Auth Required:** `Authorization: Bearer <token>`
- **Route Parameters:** `id: string`
- **Request Shape:** Empty body.
- **Backend Execution:**
  1. Retrieve stored document binary from storage.
  2. Compute current SHA-256 digest of stored bytes.
  3. Fetch original sealed SHA-256 recorded at ingestion.
  4. Fetch anchor hash and transaction from blockchain smart contract.
  5. Compare hashes and return status verdict.
- **Response Shape (200 OK):**
  ```json
  {
    "status": "VERIFIED",
    "originalHash": "a81f92c10b7454839de848a91316b23d06e300183b102ef70d249f05f7ff72a1",
    "currentHash": "a81f92c10b7454839de848a91316b23d06e300183b102ef70d249f05f7ff72a1",
    "blockchainHash": "a81f92c10b7454839de848a91316b23d06e300183b102ef70d249f05f7ff72a1",
    "blockchainTxId": "0x82ab692e847c1b0179d639b98ec349a888c3a1005b8cfbf4df629c4883d690a2",
    "timestamp": "2026-09-11T10:45:00Z"
  }
  ```
  *(When tampering is detected, `status` must be `"MISMATCH"`, with `currentHash` showing the mutated digest).*  
  *(When blockchain/node connection fails, `status` must be `"ERROR"`).*
- **Expected Error Behavior:**
  - `503 Service Unavailable` with code `VERIFICATION_SERVICE_UNAVAILABLE`.
  - `404 Not Found` with code `DOCUMENT_NOT_FOUND`.

---

## 6. Audit & Custody Lineage Contracts

### `GET /api/documents/:id/audit`
- **Purpose:** Retrieve chronological chain-of-custody audit events for a document.
- **Auth Required:** `Authorization: Bearer <token>`
- **Route Parameters:** `id: string`
- **Response Shape (200 OK):**
  ```json
  {
    "events": [
      {
        "id": "aud_001",
        "action": "DOCUMENT_UPLOADED",
        "actor": {
          "id": "usr_001",
          "name": "Inspector Sharma"
        },
        "timestamp": "2026-09-11T10:35:00Z",
        "details": "Forensic_Report.pdf uploaded with SHA-256 digest."
      },
      {
        "id": "aud_002",
        "action": "HASH_VERIFIED",
        "actor": {
          "id": "usr_001",
          "name": "Inspector Sharma"
        },
        "timestamp": "2026-09-11T10:35:30Z",
        "details": "Payload integrity check succeeded prior to storage lock."
      },
      {
        "id": "aud_003",
        "action": "DOCUMENT_SEALED",
        "actor": {
          "id": "usr_001",
          "name": "Inspector Sharma"
        },
        "timestamp": "2026-09-11T10:36:00Z",
        "details": "Document marked immutable (SEALED) by custodian."
      },
      {
        "id": "aud_004",
        "action": "BLOCKCHAIN_ANCHOR_RECORDED",
        "actor": {
          "id": "usr_001",
          "name": "Inspector Sharma"
        },
        "timestamp": "2026-09-11T10:36:45Z",
        "details": "Anchor tx 0x82ab692e847c1b0179d639b98ec349a888c3a1005b8cfbf4df629c4883d690a2 confirmed."
      }
    ]
  }
  ```
  *(Client handles either `{ events: [...] }` or raw array `[...]` defensively).*
- **Expected Error Behavior:**
  - `404 Not Found` with code `DOCUMENT_NOT_FOUND`.

---

## 7. Document Version History Contracts

### `GET /api/documents/:id/versions`
- **Purpose:** Retrieve immutable version lineage records for a document.
- **Auth Required:** `Authorization: Bearer <token>`
- **Route Parameters:** `id: string`
- **Response Shape (200 OK):** Array of `DocumentVersion`:
  ```json
  [
    {
      "id": "ver_001_1",
      "version": 1,
      "createdBy": {
        "id": "usr_001",
        "name": "Inspector Sharma"
      },
      "createdAt": "2026-09-11T10:35:00Z",
      "status": "SEALED",
      "sha256": "a81f92c10b7454839de848a91316b23d06e300183b102ef70d249f05f7ff72a1",
      "blockchainTxId": "0x82ab692e847c1b0179d639b98ec349a888c3a1005b8cfbf4df629c4883d690a2",
      "isCurrent": true,
      "size": 245678,
      "mimeType": "application/pdf"
    }
  ]
  ```
- **Expected Error Behavior:**
  - `404 Not Found` with code `DOCUMENT_NOT_FOUND`.
  - Empty array `[]` if no versions recorded (frontend renders empty state without throwing).

---

## 8. Integration Risks & Recommendations

| # | Contract / Feature | Finding / Potential Risk | Frontend Mitigation / Backend Recommendation |
|---|---|---|---|
| **1** | **Base URL Route Mounting** | In `.env.example`, `VITE_API_BASE_URL` is configured as `http://localhost:4000/api`. If backend mounts routes at root (e.g. `http://localhost:4000/cases`), request paths will duplicate `/api`. | **Action for Member 3:** Mount express/fastify router under `/api` prefix (e.g. `app.use('/api', router)`), or adjust `VITE_API_BASE_URL` in `.env` to `http://localhost:4000`. |
| **2** | **CORS & Preflight Handling** | In production/local development across origins (e.g. frontend on `:5173` / `:5175` and backend on `:4000`), preflight `OPTIONS` requests will fail if headers are unlisted. | **Action for Member 3:** Ensure CORS middleware explicitly allows headers: `Authorization`, `Content-Type`, `Accept`. |
| **3** | **Verification Status Nomenclature** | Trust UI expects `status: 'VERIFIED' \| 'MISMATCH' \| 'ERROR'`. If backend returns `'TAMPERED'` or `'FAILED'`, the frontend red tamper panel will not trigger as expected. | **Action for Member 3:** Use `'MISMATCH'` when stored document hash differs from blockchain anchor, and `'VERIFIED'` when authentic. |
| **4** | **Multipart Form Field Naming** | In `POST /api/cases/:caseId/documents`, frontend transmits the binary file under key `'file'`, and metadata under `'documentType'`, `'title'`, `'classification'`, `'description'`. | **Action for Member 3:** Configure multer/multipart parser to accept `upload.single('file')`. |
| **5** | **Auth Profile Response Structure** | Some backends serialize `GET /auth/me` as `{ user: { ... } }` while others return the user object at root `{ id, name, ... }`. | **Resolved in Client:** `ApiClient` has been defensively implemented to unwrap either format without error. |
| **6** | **Audit Trail Response Wrapper** | Some APIs return `{ events: [...] }` while others return raw `[...]`. | **Resolved in Client:** `ApiClient.documents.audit` handles both `{ events: [...] }` and direct arrays. |
| **7** | **ID Typing (String vs UUID)** | Frontend domain models type all identifiers (`id`, `caseId`, `actor.id`) as `string`. | **Compatibility:** Compatible with standard string UUIDs (e.g. `c0a8012e-...`), MongoDB ObjectIDs, or prefixed identifiers (`doc_001`). No integer IDs should be returned unquoted. |
| **8** | **Document Download Streaming** | Frontend relies on direct binary stream retrieval via `fetch(url)`. If backend responds with JSON `{ url: "https://s3..." }` instead of streaming bytes, client `response.blob()` will download the JSON text. | **Action for Member 3:** Stream bytes directly or pipe storage response through the controller with appropriate MIME headers. |

---

## 9. Security & Compliance Checklist

- [x] **Zero Hardcoded Secrets:** No API keys, JWT secrets, private keys, or passwords exist in frontend source code.
- [x] **No Public Storage URLs:** Documents are downloaded and previewed solely through authorized authenticated API streams with ephemeral blob object URLs.
- [x] **Object URL Cleanup:** Object URLs created for download or in-browser preview are immediately revoked upon completion or component unmount.
- [x] **No Sensitive Storage in LocalStorage:** Only the session JWT (`nyaya_vault_token`) is stored in `localStorage`. Document binaries, hashes, and encryption data are never stored in browser storage.
- [x] **No Client Cryptographic Logic:** Hashing, signature generation, encryption, and blockchain consensus remain strictly backend responsibilities.
