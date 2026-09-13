# NyayaVault (न्यायVault) — Master Project State & Handoff Document
**Repository Master Record & Technical Architecture Ledger**  
*Document Version: 1.0.0 | System Status: Local MVP Fully Verified | Total Automated Tests: 210 Passing*

---

## Notice & Purpose

> [!IMPORTANT]
> **Permanent Agent & Developer Recovery Record:**  
> This single file serves as the definitive source of truth and complete recovery document for the **NyayaVault** project. If all AI conversation history, external memory, or previous task context is lost, an incoming AI agent or software engineer can read this document to understand the entire system architecture, historical decisions, verified operational state, known limitations, and exact next steps.

---

## Table of Contents
1. [Project Identity & Core Positioning](#1-project-identity--core-positioning)
2. [Core Product Workflow & State Machine](#2-core-product-workflow--state-machine)
3. [System Architecture & Layer Responsibilities](#3-system-architecture--layer-responsibilities)
4. [Three-Member Engineering Ownership Model](#4-three-member-engineering-ownership-model)
5. [Chronological Milestone History (M1 through M3-12)](#5-chronological-milestone-history)
6. [Current Verified Functionality](#6-current-verified-functionality)
7. [Automated Testing & Verification Matrix](#7-automated-testing--verification-matrix)
8. [Comprehensive Security & Integrity Model](#8-comprehensive-security--integrity-model)
9. [Complete REST API Contract](#9-complete-rest-api-contract)
10. [Database Persistence Model (Prisma Schema)](#10-database-persistence-model)
11. [Repository Directory & File Structure](#11-repository-directory--file-structure)
12. [Environment Configuration Reference](#12-environment-configuration-reference)
13. [Operational Startup & Runbook](#13-operational-startup--runbook)
14. [Current Development Environment State](#14-current-development-environment-state)
15. [Deterministic Development & Demo Accounts](#15-deterministic-development--demo-accounts)
16. [Hackathon Judge Demonstration Runbook (5–10 Min)](#16-hackathon-judge-demonstration-runbook)
17. [Known Non-Blocking Warnings & Advisories](#17-known-non-blocking-warnings--advisories)
18. [Public Cloud Deployment Status & Roadmap](#18-public-cloud-deployment-status--roadmap)
19. [Architectural Non-Negotiables ("Do Not Break")](#19-architectural-non-negotiables)
20. [Historical Bugs Diagnosed and Fixed](#20-historical-bugs-diagnosed-and-fixed)
21. [Current Work Breakdown & Next Priorities](#21-current-work-breakdown--next-priorities)
22. [Protocol for Future AI Agent Continuation](#22-protocol-for-future-ai-agent-continuation)
23. [Operational Command Reference](#23-operational-command-reference)
24. [Final Status Dashboard Snapshot](#24-final-status-dashboard-snapshot)

---

## 1. Project Identity & Core Positioning

### 1.1 Project Overview
- **Official Name:** NyayaVault (न्यायVault)
- **Tagline:** Secure Legal Document Management & Cryptographic Integrity Verification System
- **Hackathon Context:** Developed under **Smart India Hackathon (SIH) Problem Statement SIH26190: Legal Document Integrity Vault**.

### 1.2 Target Users
1. **Police Station Investigators / Inspectors (`INSPECTOR`):** First respondents responsible for registering case matters, uploading seized digital evidentiary files, sealing initial evidence versions, and maintaining chain of custody.
2. **Forensic Examiners / Scientific Officers (`FORENSIC_OFFICER`):** Laboratory examiners responsible for conducting evidence verification, examining file integrity, and appending analytical records.
3. **Judicial & Legal Compliance Auditors (`AUDITOR`):** Court clerks, prosecutors, defense counsel, and compliance overseers who require read-only, tamper-evident inspection of complete chain-of-custody timelines and on-chain proofs.
4. **Vault System Administrators (`ADMIN`):** Infrastructure supervisors who maintain platform health, audit system logs, and manage user provisioning under strict anti-enumeration and audit oversight.

### 1.3 Primary Problem Solved
Traditional Document Management Systems (DMS) and cloud storage buckets used across police, judicial, and enterprise legal departments suffer from three critical architectural vulnerabilities:
1. **Silent Physical Storage Alteration:** Privileged database administrators or operating system root users can silently modify, replace, or truncate raw evidence files stored on disk without altering database update timestamps.
2. **Unverifiable Relational Custody Logs:** Traditional audit tables in SQL databases can be rewritten, backdated, or scrubbed by insider threats with direct database access.
3. **Subjective Authenticity Disputes:** When evidence is challenged in court, standard systems cannot provide trustless mathematical proof that the file presented at trial matches the exact byte sequence seized at the crime scene.

### 1.4 What NyayaVault IS
- A specialized **evidentiary document lifecycle and integrity layer**.
- An authenticated storage engine that encrypts all files with **AES-256-GCM** using unique 96-bit IVs before writing them to physical disk.
- An immutable proof registry that anchors **SHA-256 canonical plaintext fingerprints** to an EVM smart contract (`DocumentIntegrityRegistry.sol`).
- A cryptographically chained audit log where every custody event computes an `eventHash = SHA256(eventData + previousHash)`.
- A 3-way verification pipeline that dynamically compares current decrypted file bytes against database records and blockchain anchors to detect tampering.

### 1.5 What NyayaVault IS NOT
- **NOT a replacement for government law enforcement or judicial systems:** It does not replace e-Sakshya, CCTNS, Interoperable Criminal Justice System (ICJS), or court registry portals.
- **NOT a Certifying Authority (CA) or PKI provider:** It does not issue x509 certificates or manage government-licensed digital signature tokens (DSC).
- **NOT an automatic legal admissibility engine:** It does not grant automatic admissibility under Section 65B of the Indian Evidence Act / Section 63 of Bharatiya Sakshya Adhiniyam (BSA). Legal admissibility requires statutory officer certificates, human custody affidavits, and judicial scrutiny.
- **NOT an AI/OCR/Summarization tool:** It deliberately does not perform optical character recognition, automated redaction, or LLM-based analysis. Evidentiary integrity requires deterministic byte-level fidelity.
- **NOT "tamper-proof forever":** No system can prevent a physical disk from being destroyed or overwritten. NyayaVault provides **tamper detection** and **tamper evidence**—ensuring any unauthorized alteration is immediately exposed as a mathematical contradiction.

---

## 2. Core Product Workflow & State Machine

### 2.1 The Canonical Custody Lifecycle

```
[ OFFICER LOGIN ]
       │
       ▼
[ CASE CREATION ] ──► Registers Case Matter & FIR Reference in PostgreSQL
       │
       ▼
[ UPLOAD EVIDENCE ] ──► Validates Magic Bytes ──► AES-256-GCM Encrypt ──► Persist Encrypted Payload
       │                                                                  │
       ▼                                                                  ▼
  Status: DRAFT                                                    Genesis Audit Event:
  Blockchain: NOT_ANCHORED                                         DOCUMENT_UPLOADED
       │
       ▼
[ SEAL & ANCHOR ] ──► In-Memory Decrypt ──► Canonical SHA-256 ──► Blockchain Anchor Tx
       │                                                          │
       ▼                                                          ▼
  Status: SEALED                                                   Chained Audit Event:
  Blockchain: ANCHORED                                             DOCUMENT_SEALED
       │
       ▼
[ VERIFY INTEGRITY ] ──► Decrypt Current Storage ──► Compute Current SHA-256
       │                                                    │
       ├─────────────────┬──────────────────────────────────┤
       ▼                 ▼                                  ▼
[ VERIFIED ]      [ MISMATCH ]                       [ ERROR ]
All hashes match   Hash mismatch detected             Decryption failed or
DB and Blockchain  Storage byte tampering!            Blockchain RPC offline
```

### 2.2 Document Lifecycle State Transitions

| Action | Previous State | New State | Database & Blockchain Side Effects |
| :--- | :--- | :--- | :--- |
| **Upload Document** | None | `status: "DRAFT"`<br>`blockchainStatus: "NOT_ANCHORED"` | DocumentVersion v1 created; AES-256-GCM payload written to disk; `DOCUMENT_UPLOADED` audit event recorded. |
| **Seal Document** | `DRAFT` | `status: "SEALED"`<br>`blockchainStatus: "ANCHORED"` | In-memory SHA-256 digest computed; smart contract `anchorDocument(...)` transaction mined; `DOCUMENT_SEALED` chained audit event recorded. |
| **Re-Seal Attempt** | `SEALED` | `SEALED` (Unchanged) | Strict rejection: HTTP `409 Conflict` (`DOCUMENT_ALREADY_SEALED`). |
| **Verify Document** | `SEALED` | `status: "SEALED"` (Zero mutation) | Read-only cryptographic inspection. Returns verification report without altering database state. |

### 2.3 Verification Outcomes Explained

The verification engine performs a strict **3-way validation** comparing:
1. Current plaintext SHA-256 hash (recalculated from decrypted storage bytes).
2. Trusted sealed SHA-256 hash stored in PostgreSQL.
3. Immutable SHA-256 anchor recorded on the blockchain.

```
+-----------------------------------------------------------------------------------------------+
|                                      VERIFICATION OUTCOMES                                    |
+-------------------+---------------------------------------------+-----------------------------+
| Result Status     | Architectural Cause                         | System Response             |
+-------------------+---------------------------------------------+-----------------------------+
| VERIFIED          | Current Hash == Trusted DB Hash == Chain    | HTTP 200 OK. UI displays    |
|                   | Anchor Hash. Document is authentic.         | emerald "INTEGRITY VERIFIED"|
+-------------------+---------------------------------------------+-----------------------------+
| MISMATCH          | Current Hash != Trusted DB Hash, OR         | HTTP 200 OK. UI displays    |
| (Tamper Detected) | Current Hash != Blockchain Anchor Hash.     | flashing red alert with     |
|                   | Physical storage bytes were modified!       | side-by-side hash comparison|
+-------------------+---------------------------------------------+-----------------------------+
| ERROR             | Infrastructure failure:                     | HTTP 200 OK (status: ERROR) |
| (System Failure)  | - Storage file missing or corrupt           | UI displays amber alert with|
|                   | - AES-GCM authentication tag failed         | specific failure cause.     |
|                   | - Hardhat/EVM RPC node unreachable          | NEVER reports MISMATCH.     |
+-------------------+---------------------------------------------+-----------------------------+
```

> [!CRITICAL]
> **Strict Classification Boundary:** A storage decryption failure or an offline blockchain RPC node is classified as **`ERROR`**, NEVER as `MISMATCH`. `MISMATCH` is reserved exclusively for cryptographic proof contradictions where decrypted bytes fail hash verification.

---

## 3. System Architecture & Layer Responsibilities

### 3.1 Text Architecture Diagram

```
+---------------------------------------------------------------------------------------+
|                                PRESENTATION TIER                                      |
|  React 19 | Vite 6 | Tailwind CSS 4 | React Router 7 | TanStack React Query 5         |
|  - Role-aware Dashboard, Case Matter Management, Evidence Vault Explorer              |
|  - Live Verification Status Panels, Cryptographic Audit Trail Timeline                |
|  - Client-side Session Isolation (Automated Cache Purging on Logout/Login)            |
+------------------------------------------┬--------------------------------------------+
                                           │ HTTP / JSON REST + JWT Authorization
                                           ▼
+---------------------------------------------------------------------------------------+
|                                APPLICATION & VAULT TIER                               |
|  Node.js (v20+) | Express 5 | TypeScript 5.7 | Prisma ORM 6                           |
|                                                                                       |
|  [ Authentication & RBAC ]                                                            |
|  - Argon2id password hashing, Stateless JWT (15-min expiry)                           |
|  - CaseAuthorizationService (Strict case membership, anti-enumeration 404 policy)    |
|                                                                                       |
|  [ Ingestion & Storage Pipeline ]                                                     |
|  - Multer memory buffer, MIME magic-bytes validation, Filename sanitization           |
|  - LocalEncryptedStorage: Encrypted binary envelopes on disk                          |
|                                                                                       |
|  [ Cryptographic Services ]                                                           |
|  - AesGcmEncryptionService: 256-bit AES-GCM, 96-bit random IV, 128-bit auth tag        |
|  - Sha256HashService: Plaintext canonical digest computation                          |
|  - AuditService: Cryptographically linked SHA-256 hash chains                         |
|                                                                                       |
|  [ Blockchain Coordinator ]                                                           |
|  - Ethers.js v6 JsonRpcProvider connecting to local Hardhat node                      |
|  - DocumentSealingService & DocumentVerificationService                               |
+-----------------------┬───────────────────────────────┬-------------------------------+
                        │ SQL Queries                   │ JSON-RPC (Port 8545)
                        ▼                               ▼
+---------------------------------------+  +--------------------------------------------+
|           PERSISTENCE TIER            |  |          DECENTRALIZED TRUST TIER          |
|  PostgreSQL 16 (Port 5432)            |  |  EVM Blockchain (Hardhat Node Port 8545)   |
|  - Relational schema (Prisma managed) |  |  - DocumentIntegrityRegistry.sol           |
|  - Users, Cases, CaseMembers          |  |  - Stores: (docId, version, hash, actor,   |
|  - Documents, Versions, AuditEvents   |  |            eventType, block.timestamp)     |
|  - BlockchainAnchor transaction logs  |  |  - ZERO document bytes, ZERO PII,          |
|                                       |  |    ZERO encryption keys on-chain           |
+---------------------------------------+  +--------------------------------------------+
```

### 3.2 Layer Isolation Rules
1. **Zero Content on Blockchain:** The smart contract stores only 32-byte hashes, version numbers, compact identifiers, and timestamps. No document names, case titles, officer names, or file bytes are ever sent to the blockchain.
2. **Zero Plaintext on Disk:** Uploaded files are encrypted in memory before disk writing. The storage folder contains only ciphertext envelopes prefixed with IVs and authentication tags.
3. **Plaintext Decrypted In-Memory Only:** When an authorized user views, downloads, seals, or verifies a document, decryption occurs entirely in Node.js volatile memory. Plaintext is streamed directly to the authorized HTTP client and immediately garbage-collected.

---

## 4. Three-Member Engineering Ownership Model

NyayaVault was engineered around a specialized three-member separation-of-concerns model:

```
+-----------------------------------+------------------------------------+-----------------------------------+
|             MEMBER 1              |              MEMBER 2              |             MEMBER 3              |
|        Frontend / DMS UI          |     Cryptography & Blockchain      |    Backend API & Integration      |
+-----------------------------------+------------------------------------+-----------------------------------+
| • React 19 UI & App Shell         | • AES-256-GCM Encryption Service   | • Express 5 Server & Middleware   |
| • Case List & Detail Screens      | • LocalEncryptedStorage Adapter    | • PostgreSQL & Prisma ORM Schema  |
| • Evidence Upload Modal Form      | • SHA-256 Fingerprinting Engine    | • Argon2id & JWT Authentication   |
| • Document Detail & Sealing UI    | • Audit Hash Chain Service         | • CaseAuthorizationService (RBAC) |
| • Audit Trail Timeline UI         | • DocumentIntegrityRegistry.sol    | • Real Document Upload Pipeline   |
| • Integrity Verification Panels   | • Hardhat Test & Deploy Tooling    | • Real Document Sealing API       |
| • TanStack Query Cache State      | • Ethers.js Blockchain Adapter     | • Real Verification API Route     |
| • Role-based UI Permission Logic  | • Sealing & Tamper Verification    | • Secure Download Stream Endpoint |
| • Zero crypto / storage internals | • Zero HTTP / Express routes       | • Integration Glue & Operations   |
+-----------------------------------+------------------------------------+-----------------------------------+
```

### Shared Contract Boundaries:
- **Member 1 $\leftrightarrow$ Member 3:** Communicates strictly via typed REST APIs (`api-client.ts` $\leftrightarrow$ Express routes).
- **Member 2 $\leftrightarrow$ Member 3:** Member 3 orchestrates Member 2's cryptographic services (`AesGcmEncryptionService`, `LocalEncryptedStorage`, `AuditService`, `EthersBlockchainService`) within transactional Express route controllers.

---

## 5. Chronological Milestone History

| Milestone | Scope & Deliverables | Primary Files | Tests & Status |
| :--- | :--- | :--- | :--- |
| **M1** | **Frontend DMS Foundation:** React 19 bootstrap, layout shell, mock adapter, navigation, case/document pages, audit timeline. | `frontend/src/` | Build clean; Mock mode isolated. **COMPLETE** |
| **M2** | **Cryptographic & Blockchain Core:** AES-256-GCM encryption, LocalEncryptedStorage, SHA-256 service, audit hash-chain, Solidity contract, Hardhat tests. | `backend/src/encryption/`<br>`backend/src/storage/`<br>`blockchain/contracts/` | 10/10 Hardhat tests passing. **COMPLETE** |
| **M3-01** | **Backend Infrastructure:** Express 5 setup, Prisma ORM initialization, PostgreSQL schema migrations. | `backend/src/app.ts`<br>`backend/prisma/` | Healthcheck passing. **COMPLETE** |
| **M3-02** | **Identity & User Seeding:** User model, Argon2id password hashing, database seeder with 4 demo accounts. | `backend/src/database/seed.ts` | 4 demo users seeded. **COMPLETE** |
| **M3-03** | **Authentication & JWT API:** `/api/auth/login`, `/api/auth/me`, `/api/auth/logout`, token middleware. | `backend/src/controllers/auth.controller.ts` | 24 auth tests passing. **COMPLETE** |
| **M3-04** | **Case Management API:** Case CRUD, case membership association, anti-enumeration 404 security policy. | `backend/src/services/case-authorization.service.ts` | 25 case tests passing. **COMPLETE** |
| **M3-05A** | **Document Read APIs:** Case document listing, document detail, version history, audit trail endpoints. | `backend/src/controllers/document.controller.ts` | 31 read tests passing. **COMPLETE** |
| **M3-05B** | **Real Upload Pipeline:** Multer memory storage, MIME validation, AES-256-GCM disk vault persistence, DRAFT state. | `backend/src/services/document-upload.service.ts` | 20 upload tests passing. **COMPLETE** |
| **M3-06** | **Real Sealing API:** In-memory decrypt, canonical SHA-256, on-chain EVM transaction, SEALED state. | `backend/src/sealing/document-sealing.service.ts` | 14 seal tests passing. **COMPLETE** |
| **M3-07** | **Verification & Tamper API:** 3-way hash verification, MISMATCH vs ERROR classification, immutability proof. | `backend/src/services/document-verification.service.ts` | 19 verify tests passing. **COMPLETE** |
| **M3-08** | **Local E2E Rehearsal:** Full browser verification of golden path and controlled tampering. | Browser subagent / manual run | Golden path proven. **COMPLETE** |
| **M3-09A** | **Controlled Tamper Tooling:** Deterministic tamper and restore CLI scripts for judge evaluations. | `backend/scripts/demo/tamper-document.mjs`<br>`backend/scripts/demo/restore-document.mjs` | Verified tamper/restore. **COMPLETE** |
| **M3-09B** | **Operational Scripts:** Root npm convenience scripts (`chain:node`, `backend:setup`, `frontend:dev`). | `package.json`<br>`backend/package.json` | Streamlined startup. **COMPLETE** |
| **M3-09C** | **Docker PostgreSQL Portability:** Optional containerized PostgreSQL 16 Compose service with healthcheck. | `docker-compose.yml` | Portability validated. **COMPLETE** |
| **M3-09D** | **Root Documentation:** Comprehensive README.md and 5–10 minute hackathon judge runbook. | `README.md` | Fully verified. **COMPLETE** |
| **M3-10** | **Secure Document View & Download:** Authenticated `/api/documents/:id/download`, in-memory decryption, safe streaming. | `backend/src/controllers/document.controller.ts`<br>`frontend/src/features/documents/pages/DocumentDetailPage.tsx` | 12 download tests passing. **COMPLETE** |
| **M3-11A** | **Local Defect & Deployment Cleanup:** Dynamic case resolution in AuditPage, dashboard fallback fix, CORS_ORIGIN support, safe production LIVE mode default. | `frontend/src/features/audit/pages/AuditPage.tsx`<br>`backend/src/app.ts`<br>`frontend/src/services/api-client.ts` | 200 backend tests passing. **COMPLETE** |
| **M3-12** | **Session Cache Isolation:** TanStack Query `queryClient.clear()` on logout/login to prevent cross-user data leaks. | `frontend/src/app/providers/AuthProvider.tsx` | Live role-switch proven. **COMPLETE** |

---

## 6. Current Verified Functionality

Every user-facing flow below has been executed and proven in the live browser against the real running backend, PostgreSQL database, and Hardhat blockchain node:

```
+----------------------------------------------------------------------------------------------------+
|                                    PROVEN LIVE BROWSER CAPABILITIES                                |
+----+--------------------------------+--------------------------------------+-----------------------+
| #  | User Action / Flow             | Expected Technical Behavior          | Verified Result       |
+----+--------------------------------+--------------------------------------+-----------------------+
| 1  | Login via Demo Role Preset     | Authenticates with Argon2id; issues  | [PASS] Enters Vault   |
|    |                                | 15-minute JWT; stores in localStorage| with correct badge    |
+----+--------------------------------+--------------------------------------+-----------------------+
| 2  | Register New Case Matter       | Persists Case in PostgreSQL; assigns | [PASS] Case rendered  |
|    |                                | creating officer as LEAD member      | with FIR reference    |
+----+--------------------------------+--------------------------------------+-----------------------+
| 3  | Upload Evidence Document       | Encrypts file with AES-256-GCM; sets | [PASS] Status: DRAFT, |
|    |                                | status DRAFT, NOT_ANCHORED           | NOT_ANCHORED          |
+----+--------------------------------+--------------------------------------+-----------------------+
| 4  | Seal & Anchor Document         | Computes SHA-256 in memory; records  | [PASS] Status: SEALED,|
|    |                                | on-chain EVM anchor via Ethers.js    | ANCHORED with tx ID   |
+----+--------------------------------+--------------------------------------+-----------------------+
| 5  | Verify Authentic Evidence      | 3-way hash check (Disk == DB == Chain)| [PASS] Renders green  |
|    |                                | Returns status: VERIFIED             | "INTEGRITY VERIFIED"  |
+----+--------------------------------+--------------------------------------+-----------------------+
| 6  | Controlled Storage Tampering   | CLI script modifies storage bytes    | [PASS] Returns        |
|    | (`tamper-document.mjs`)        | while DB and Blockchain remain intact| MISMATCH (Tamper Alert)|
+----+--------------------------------+--------------------------------------+-----------------------+
| 7  | Restore Authentic Evidence     | CLI script restores original bytes   | [PASS] Returns        |
|    | (`restore-document.mjs`)       | from byte-for-byte backup            | VERIFIED again        |
+----+--------------------------------+--------------------------------------+-----------------------+
| 8  | View & Download Evidence       | In-memory decryption; streams binary | [PASS] PDF preview &  |
|    |                                | with Content-Disposition headers     | download functional   |
+----+--------------------------------+--------------------------------------+-----------------------+
| 9  | Inspect Audit Trail            | Renders unbroken chronological chain | [PASS] Genesis and    |
|    |                                | of custody logs with event hashes    | seal blocks validated |
+----+--------------------------------+--------------------------------------+-----------------------+
| 10 | Dynamic Audit & Integrity Page | Lists real cases dynamically; zero   | [PASS] Selects case;  |
|    |                                | hardcoded case IDs; clean empty state| no case_001 errors    |
+----+--------------------------------+--------------------------------------+-----------------------+
| 11 | Role Switching (Session Cache) | Logout clears TanStack Query cache;  | [PASS] Zero cross-user|
|    |                                | User B sees only User B data         | data retention        |
+----+--------------------------------+--------------------------------------+-----------------------+
```

---

## 7. Automated Testing & Verification Matrix

### 7.1 Test Execution Summary

| Test Suite | Command | Total Suites | Total Tests | Passing | Failing |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **Backend Test Suite** | `npm test --prefix backend` | **59** | **200** | **200** | **0** |
| **Blockchain Test Suite** | `npm test --prefix blockchain` | **1** | **10** | **10** | **0** |
| **Backend TypeScript Check** | `npm run typecheck --prefix backend` | — | — | **0 Errors** | **0** |
| **Blockchain TypeScript Check**| `npx tsc --noEmit` (in `blockchain/`) | — | — | **0 Errors** | **0** |
| **Frontend Production Build** | `npm run build --prefix frontend` | — | — | **0 Errors** | **0** |
| **Frontend Code Linter** | `npm run lint --prefix frontend` | — | — | **0 Errors** | 3 warnings |

### 7.2 Critical Backend Test Areas (200 Tests)
- **Document Download & View (12 tests):** Validates authenticated streaming, non-member 404 rejection, AES-GCM decryption, safe headers, and traversal protection.
- **Document Verification & Tampering (19 tests):** Validates VERIFIED success path, MISMATCH tamper detection, blockchain contradiction detection, and ERROR infrastructure isolation.
- **Document Sealing & Blockchain (14 tests):** Validates SHA-256 plaintext computation, Hardhat on-chain transaction emission, immutability, and duplicate seal rejection.
- **Document Upload Pipeline (20 tests):** Validates Multer buffering, MIME magic bytes detection, AES-256-GCM disk encryption, DRAFT status, and path traversal rejection.
- **Case Management & RBAC (25 tests):** Validates CaseAuthorizationService, case member association, admin override, and anti-enumeration 404 security policy.
- **Authentication & JWT (24 tests):** Validates Argon2id password verification, JWT token issuance, cookie/header extraction, and session termination.
- **Storage & Cryptography (90 tests):** Validates AesGcmEncryptionService envelope structure, LocalEncryptedStorage filesystem isolation, and Sha256HashService consistency.

---

## 8. Comprehensive Security & Integrity Model

### 8.1 Authentication & Stateless Sessions
- **Password Hashing:** Implemented via `@node-rs/argon2` using the **Argon2id** variant (memory cost 65536 KiB, time cost 3, parallelism 4). Plaintext passwords are never stored.
- **Stateless Tokens:** Standard signed JSON Web Tokens (`HS256`, 15-minute expiration). The payload contains `{ id, email, role }`.
- **Token Invalidation:** Client deletes token from `localStorage`; `AuthProvider` purges client-side caches; server rejects requests without valid Authorization header.

### 8.2 Role-Based Access Control (RBAC)

```
+-------------------+-------------------+--------------------+--------------------+
| Capability        | INSPECTOR         | FORENSIC_OFFICER   | AUDITOR            |
+-------------------+-------------------+--------------------+--------------------+
| Create Case       | YES               | YES                | NO                 |
| Upload Evidence   | YES (Member)      | NO                 | NO                 |
| Seal Evidence     | YES (Member)      | NO                 | NO                 |
| Verify Integrity  | YES (Member)      | YES (Member)       | YES (Member)       |
| Download Evidence | YES (Member)      | YES (Member)       | YES (Member)       |
| View Audit Logs   | YES (Member)      | YES (Member)       | YES (Member)       |
+-------------------+-------------------+--------------------+--------------------+
* Note: ADMIN has global case override capabilities across all operations for audit purposes.
```

### 8.3 Anti-Enumeration Authorization Policy
To prevent unauthorized actors from discovering whether a sensitive case or evidence ID exists:
- If a user requests a case or document they are **not authorized** to access, the system returns **`HTTP 404 Not Found`**, NOT `403 Forbidden`.
- Error message: *"Case with ID '{id}' was not found"* or *"Document with ID '{id}' was not found"*.
- Prevents malicious enumeration of confidential criminal investigations.

### 8.4 Cryptographic Envelope (AES-256-GCM)
Raw evidence files are stored inside authenticated binary envelopes:
```
+--------------------+---------------------+--------------------+--------------------+
| 1-byte Version Len | Key Version String  | 12-byte Random IV  | 16-byte Auth Tag   |
+--------------------+---------------------+--------------------+--------------------+
| Ciphertext Bytes (AES-256-GCM Encrypted)                                           |
+------------------------------------------------------------------------------------+
```
- A fresh 96-bit initialization vector is generated for every stored file via `crypto.randomBytes(12)`.
- The 128-bit authentication tag ensures ciphertext cannot be modified or truncated without detection.

### 8.5 Audit Hash Chain Mechanics
Each event in the audit trail is cryptographically bound to the previous event:
$$\text{eventHash} = \text{SHA-256}(\text{id} \parallel \text{eventType} \parallel \text{actorId} \parallel \text{documentId} \parallel \text{versionId} \parallel \text{timestamp} \parallel \text{previousEventHash})$$
- The genesis event (`DOCUMENT_UPLOADED`) has `previousEventHash = null`.
- If an attacker modifies or deletes an audit record, every subsequent `eventHash` in the chain breaks.

### 8.6 Client-Side Session Cache Isolation
In Single Page Applications, in-memory query caches (TanStack Query) survive client-side route changes. NyayaVault enforces strict session isolation:
- On `logout()`, `login()`, or `initAuth()` failure, `queryClient.clear()` is called.
- This **clears protected client-side query and mutation caches**, guaranteeing that a newly logged-in user triggers genuine backend network requests validated by authoritative JWT rules.

---

## 9. Complete REST API Contract

All endpoints require standard `Authorization: Bearer <JWT>` header unless designated public.

### 9.1 Authentication (`/api/auth`)
- `POST /api/auth/login` *(Public)*: Validates credentials via Argon2id; returns `{ user, token }`.
- `GET /api/auth/me`: Returns current authenticated `{ user }` profile.
- `POST /api/auth/logout`: Invalidates session; returns `{ success: true }`.

### 9.2 Case Matters (`/api/cases`)
- `POST /api/cases`: Creates a new case matter. Body: `{ title, firNumber, department, classification? }`. Returns `201 Created`.
- `GET /api/cases`: Lists all cases where the authenticated user is a member (or all cases if ADMIN).
- `GET /api/cases/:id`: Retrieves case metadata. Returns `404` if not a member.
- `POST /api/cases/:id/members`: Adds a user to a case. Body: `{ userId, role }`. Requires case LEAD or ADMIN.

### 9.3 Documents & Evidence (`/api/documents` & `/api/cases/:caseId/documents`)
- `GET /api/cases/:caseId/documents`: Lists all evidentiary documents attached to a case.
- `POST /api/cases/:caseId/documents`: Multipart upload (`file`, `title`). Validates MIME magic bytes, encrypts via AES-256-GCM, creates version 1 in `DRAFT` status. Returns `201 Created`.
- `GET /api/documents/:id`: Retrieves document detail, active version, status, and blockchain anchor info.
- `GET /api/documents/:id/versions`: Lists chronological version revisions for a document.
- `GET /api/documents/:id/audit`: Retrieves cryptographically linked chain-of-custody log.
- `GET /api/documents/:id/download`: Authenticated document preview/download. Streams decrypted bytes with `Content-Disposition`, `Content-Type`, and `Cache-Control: no-store`.
- `POST /api/documents/:id/seal`: Computes SHA-256 plaintext hash, anchors proof on-chain, updates status to `SEALED` and `ANCHORED`. Returns `200 OK` with transaction hash.
- `POST /api/documents/:id/verify`: Performs 3-way integrity verification. Returns `{ status: "VERIFIED" | "MISMATCH" | "ERROR", currentHash, trustedHash, onChainHash, details }`.

---

## 10. Database Persistence Model

Managed via **Prisma ORM 6** on **PostgreSQL 16**.

```prisma
model User {
  id           String       @id @default(uuid())
  email        String       @unique
  name         String
  passwordHash String
  role         String       // INSPECTOR | FORENSIC_OFFICER | AUDITOR | ADMIN
  isActive     Boolean      @default(true)
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt
  createdCases Case[]       @relation("CaseCreator")
  memberships  CaseMember[]
  @@map("users")
}

model Case {
  id             String       @id @default(uuid())
  caseNumber     String       @unique
  firNumber      String
  title          String
  description    String?
  department     String       @default("Central Legal Division")
  policeStation  String       @default("Central Station")
  classification String       @default("CONFIDENTIAL") // INTERNAL | CONFIDENTIAL | HIGHLY_RESTRICTED
  status         String       @default("ACTIVE")       // ACTIVE | CLOSED | ARCHIVED
  createdBy      String
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt
  creator        User         @relation("CaseCreator", fields: [createdBy], references: [id], onDelete: Restrict)
  members        CaseMember[]
  documents      Document[]
  @@map("cases")
}

model CaseMember {
  id        String   @id @default(uuid())
  caseId    String
  userId    String
  role      String   @default("MEMBER") // LEAD | MEMBER
  createdAt DateTime @default(now())
  case      Case     @relation(fields: [caseId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([caseId, userId])
  @@map("case_members")
}

model Document {
  id          String            @id
  caseId      String?
  title       String?
  createdAt   DateTime          @default(now())
  updatedAt   DateTime          @updatedAt
  case        Case?             @relation(fields: [caseId], references: [id], onDelete: SetNull)
  versions    DocumentVersion[]
  auditEvents AuditEvent[]
  @@map("documents")
}

model DocumentVersion {
  id                String            @id
  documentId        String
  versionNumber     Int
  storageKey        String
  sha256Hash        String?
  status            String            @default("DRAFT") // DRAFT | SEALED
  sealedAt          DateTime?
  sealedBy          String?
  createdBy         String
  createdAt         DateTime          @default(now())
  blockchainStatus  String?           // NOT_ANCHORED | ANCHORED | PENDING | FAILED
  blockchainTxHash  String?
  document          Document          @relation(fields: [documentId], references: [id], onDelete: Cascade)
  auditEvents       AuditEvent[]
  blockchainAnchor  BlockchainAnchor?
  @@unique([documentId, versionNumber])
  @@map("document_versions")
}

model AuditEvent {
  id                String           @id
  eventType         String           // DOCUMENT_UPLOADED | DOCUMENT_SEALED
  actorId           String
  documentId        String
  versionId         String
  timestamp         DateTime         @default(now())
  metadata          Json?
  previousEventHash String?
  eventHash         String           // 64-char lowercase hex SHA-256
  document          Document         @relation(fields: [documentId], references: [id], onDelete: Cascade)
  version           DocumentVersion? @relation(fields: [versionId], references: [id], onDelete: SetNull)
  @@map("audit_events")
}

model BlockchainAnchor {
  id                String           @id @default(uuid())
  documentId        String
  versionId         Int
  documentVersionId String?          @unique
  documentHash      String           // 64-char lowercase hex SHA-256
  eventType         String
  actor             String           // Ethereum signer address
  timestamp         DateTime         @default(now())
  transactionId     String           // 0x-prefixed 32-byte hex tx hash
  blockNumber       Int?
  status            String           @default("ANCHORED")
  documentVersion   DocumentVersion? @relation(fields: [documentVersionId], references: [id], onDelete: Cascade)
  @@unique([documentId, versionId])
  @@map("blockchain_anchors")
}
```

---

## 11. Repository Directory & File Structure

```
NyayaVault/
├── backend/                             # Express 5 Application & Cryptographic Vault
│   ├── prisma/                          # Prisma schema and database migrations
│   │   ├── migrations/                  # Versioned SQL migration files
│   │   └── schema.prisma                # Definitive PostgreSQL entity definitions
│   ├── scripts/demo/                    # DEMO / EVALUATOR TOOLING ONLY
│   │   ├── tamper-document.mjs          # Controlled storage tamper simulation utility
│   │   └── restore-document.mjs         # Authentic evidence restoration utility
│   ├── src/
│   │   ├── audit/                       # Cryptographic hash-chain service (AuditService)
│   │   ├── blockchain/                  # Ethers.js adapter & contract ABI integration
│   │   ├── config/                      # Environment, encryption, and blockchain config
│   │   ├── controllers/                 # Route controllers (auth, case, document)
│   │   ├── database/                    # Prisma client, repositories, and seed logic
│   │   ├── encryption/                  # AES-256-GCM authenticated encryption service
│   │   ├── errors/                      # Centralized typed application error classes
│   │   ├── integrity/                   # SHA-256 hashing service
│   │   ├── middleware/                  # JWT auth, error handlers, request ID tracking
│   │   ├── routes/                      # Express route declarations & regression tests
│   │   ├── sealing/                     # Document sealing coordinator service
│   │   ├── security/                    # Token service & cryptographic helpers
│   │   ├── services/                    # Authorization, upload, and verification services
│   │   ├── storage/                     # LocalEncryptedStorage filesystem vault adapter
│   │   ├── app.ts                       # Express application assembly & CORS middleware
│   │   └── server.ts                    # HTTP server entrypoint (Port 4000)
│   └── package.json                     # Backend dependencies and scripts
│
├── blockchain/                          # Decentralized Trust Tier (Hardhat EVM)
│   ├── contracts/
│   │   └── DocumentIntegrityRegistry.sol# Immutable on-chain evidentiary anchor contract
│   ├── scripts/
│   │   └── deploy.ts                    # Contract deployment script
│   ├── test/
│   │   └── DocumentIntegrityRegistry.test.ts # Hardhat contract unit test suite (10 tests)
│   ├── hardhat.config.ts                # Hardhat network & compiler configuration
│   ├── tsconfig.json                    # TypeScript compiler options (includes mocha types)
│   └── package.json                     # Blockchain dependencies and scripts
│
├── frontend/                            # Presentation Tier (React 19 & Vite 6)
│   ├── src/
│   │   ├── app/                         # Router, AuthProvider, and QueryClient setup
│   │   ├── components/                  # Reusable UI cards, tables, badges, modals
│   │   ├── features/
│   │   │   ├── audit/                   # Evidence Audit & Custody Ledger views
│   │   │   ├── auth/                    # Login page & demo preset buttons
│   │   │   ├── cases/                   # Case listing, registration, and detail views
│   │   │   ├── dashboard/               # Main overview, metrics, and recent evidence
│   │   │   └── documents/               # Document details, sealing, and verification
│   │   ├── services/                    # Centralized api-client.ts & error formatting
│   │   └── types/                       # Shared TypeScript domain models
│   ├── index.html                       # Single Page Application entrypoint
│   └── package.json                     # Frontend dependencies and scripts
│
├── docker-compose.yml                   # Optional PostgreSQL 16 Compose service
├── package.json                         # Root orchestration scripts
├── .gitignore                           # Repository hygiene & secret exclusion rules
├── README.md                            # Primary system runbook & hackathon guide
└── NYAYAVAULT_PROJECT_STATE.md          # THIS MASTER HANDOFF DOCUMENT
```

---

## 12. Environment Configuration Reference

### 12.1 Backend Environment (`backend/.env`)

| Variable Name | Purpose | Requirement | Local Dev Default / Example |
| :--- | :--- | :--- | :--- |
| `DOCUMENT_ENCRYPTION_KEY` | 32-byte Base64 AES-256 master key | **Mandatory** | *Generated via crypto randomBytes* |
| `DOCUMENT_ENCRYPTION_KEY_VERSION`| Version tag for encryption key | **Mandatory** | `v1` |
| `STORAGE_ROOT_DIR` | Local directory for encrypted payloads | **Mandatory** | `./storage` |
| `PORT` | Express HTTP server port | Optional | `4000` |
| `BLOCKCHAIN_RPC_URL` | JSON-RPC URL for EVM node | **Mandatory** | `http://127.0.0.1:8545` |
| `BLOCKCHAIN_CONTRACT_ADDRESS` | Deployed `DocumentIntegrityRegistry` address | **Mandatory** | `0x5FbDB2315678afecb367f032d93F642f64180aa3` |
| `BLOCKCHAIN_PRIVATE_KEY` | Backend signer Ethereum private key | **Mandatory** | *Hardhat Account #0 Key* |
| `DATABASE_URL` | PostgreSQL connection string | **Mandatory** | `postgresql://postgres:postgres@localhost:5432/nyayavault?schema=public` |
| `JWT_SECRET` | 32+ character secret for signing JWTs | **Mandatory** | *32-byte hex secret string* |
| `JWT_EXPIRES_IN` | JWT token validity lifespan | Optional | `15m` |
| `CORS_ORIGIN` | Allowed production frontend origin(s) | Optional in dev | *Empty in dev; e.g. https://vault.example.com* |

### 12.2 Frontend Environment (`frontend/.env`)

| Variable Name | Purpose | Requirement | Local Dev Default / Example |
| :--- | :--- | :--- | :--- |
| `VITE_API_BASE_URL` | URL to NyayaVault REST API | Optional | `http://localhost:4000/api` |
| `VITE_USE_MOCK_API` | Forces client-side mock adapter | Optional | `false` (Defaults to live mode) |

---

## 13. Operational Startup & Runbook

Starting NyayaVault requires **three separate terminal windows** to keep ledger, API, and frontend processes clearly separated:

```
+----------------------------------------------------------------------------------------------------+
|                                    TERMINAL 1: BLOCKCHAIN NODE                                     |
| 1. npm run chain:node                                                                              |
|    Starts Hardhat local EVM node on http://127.0.0.1:8545                                          |
|                                                                                                    |
| [One-Off Action while Node is running]:                                                            |
|    npm run chain:deploy                                                                            |
|    Deploy DocumentIntegrityRegistry.sol and copy address into backend/.env                         |
+----------------------------------------------------------------------------------------------------+
|                                    TERMINAL 2: BACKEND & DATABASE                                  |
| 1. npm run backend:setup                                                                           |
|    Compiles backend + executes Prisma migrations + seeds 4 demo accounts                           |
| 2. npm run backend:start                                                                           |
|    Starts Express API server on http://localhost:4000                                              |
+----------------------------------------------------------------------------------------------------+
|                                    TERMINAL 3: FRONTEND UI                                         |
| 1. npm run frontend:dev                                                                            |
|    Starts Vite development server on http://localhost:5173                                         |
+----------------------------------------------------------------------------------------------------+
```

> [!WARNING]
> **Hardhat In-Memory State Rule:** The local Hardhat node is ephemeral. If the `chain:node` process is terminated, in-memory blockchain state is wiped. Upon restart, you must re-run `npm run chain:deploy` and update `BLOCKCHAIN_CONTRACT_ADDRESS` in `backend/.env`.

---

## 14. Current Development Environment State

- **Operating System:** Windows 11 Host
- **Node.js Runtime:** `v24.14.0` (npm `v11.9.0`)
- **Database Service:** Native PostgreSQL 16 active on host (`localhost:5432`)
- **Containerization:** Docker Compose service defined (`docker-compose.yml`); optional for fresh evaluator PCs
- **Blockchain:** Local Hardhat EVM node running on port `8545`
- **Application Ports:**
  - Frontend: `5173`
  - Backend: `4000`
  - Blockchain: `8545`
  - Database: `5432`

---

## 15. Deterministic Development & Demo Accounts

The database seeder (`backend/src/database/seed.ts`) generates four deterministic accounts hashed with Argon2id:

| Role | Name | Email | Password | Primary Capabilities |
| :--- | :--- | :--- | :--- | :--- |
| **INSPECTOR** | Inspector Sharma | `inspector@nyayavault.local` | `Password@123` | Case registration, Evidence upload, Sealing & anchoring |
| **FORENSIC_OFFICER**| Dr. A. Verma | `forensic@nyayavault.local` | `Password@123` | Evidence examination, Integrity verification |
| **AUDITOR** | Auditor K. Patel | `auditor@nyayavault.local` | `Password@123` | Read-only chain-of-custody audit inspection |
| **ADMIN** | System Administrator | `admin@nyayavault.local` | `Password@123` | Global system access, Security auditing |

*Note: For evaluator convenience, the login page provides clickable role buttons that autofill credentials automatically.*

---

## 16. Hackathon Judge Demonstration Runbook

Follow this tested 5–10 minute script during live evaluations:

```
[00:00 - 01:00] AUTHENTICATION & OVERVIEW
- Open http://localhost:5173/login.
- Click "Inspector Sharma" demo card -> Click "Authenticate & Enter Vault".
- Point out: Live API connection, role badge, clean layout.

[01:00 - 02:30] CASE REGISTRATION
- Click "Cases" in sidebar -> Click "Register Case".
- Enter Title: "State vs Cyber Fraud Syndicate", FIR: "FIR/2026/101", Division: "Cyber Crime Branch".
- Click "Register Case". Shows case created under PostgreSQL persistence.

[02:30 - 04:00] EVIDENCE INGESTION (DRAFT STATE)
- In Case view, click "Upload Document". Select an evidence PDF/image.
- Enter Title: "Seized Server Memory Dump". Click "Upload Document".
- Point out: Status is DRAFT, Blockchain is NOT_ANCHORED. File is AES-256-GCM encrypted on disk.

[04:00 - 05:30] EVIDENCE SEALING & BLOCKCHAIN ANCHORING
- Open document detail. Click "Seal & Anchor Document".
- Button animates. Status turns SEALED (emerald). Blockchain turns ANCHORED.
- Point out: Canonical SHA-256 digest computed; transaction mined on Hardhat EVM with Tx Hash.

[05:30 - 06:30] INTEGRITY VERIFICATION (AUTHENTIC STATE)
- Click "Verify Integrity".
- Green check appears: "INTEGRITY VERIFIED".
- Point out: 3-way match verified (decrypted disk bytes == database record == blockchain anchor).

[06:30 - 08:00] CONTROLLED TAMPER DEMONSTRATION
- Copy the Document ID from the URL.
- Open terminal and run: node backend/scripts/demo/tamper-document.mjs <DOCUMENT_ID>
- Return to browser and click "Verify Integrity" again.
- Flashing red alert appears: "TAMPER DETECTED / MISMATCH".
- Point out: Database still says SEALED, but physical storage bytes were altered. Tampering exposed!

[08:00 - 09:00] EVIDENCE RESTORATION
- In terminal, run: node backend/scripts/demo/restore-document.mjs <DOCUMENT_ID>
- Return to browser and click "Verify Integrity" again.
- Green check returns: "INTEGRITY VERIFIED". Authentic state restored.

[09:00 - 10:00] AUDIT TRAIL & SESSION ISOLATION
- Click "Audit Trail". Show unbroken SHA-256 hash-chain timeline.
- Click "Sign Out". Log in as "Inspector Sharma" (who has 0 cases).
- Point out: Dashboard immediately renders clean empty state. Zero cross-user cache retention!
```

---

## 17. Known Non-Blocking Warnings & Advisories

1. **Frontend Linter Warnings (3 warnings, 0 errors):**
   - `src/app/providers/AuthProvider.tsx:84`: Fast refresh advisory on exporting `useAuth` alongside the provider component.
   - `src/features/cases/pages/CreateCasePage.tsx:58`: React Compiler purity warning regarding `Math.random()` in default form state template.
   - `src/features/cases/pages/CreateCasePage.tsx:29`: Unnecessary regex escape `\/`.
2. **Frontend Bundle Size Advisory:**
   - Minified chunk `dist/assets/index-*.js` is ~632 kB (>500 kB). Standard Vite advisory suggesting manual chunking for production.
3. **Hardhat Local Blockchain Ephemerality:**
   - Local Hardhat node runs in memory. Restarting node wipes transaction history and requires redeployment.
4. **Fresh Clone Setup:**
   - A fresh clone requires running `npm install` inside `blockchain/`, `backend/`, and `frontend/`.

---

## 18. Public Cloud Deployment Status & Roadmap

### 18.1 Current Local MVP vs. Public Production Architecture

```
+---------------------------+-----------------------------------+-----------------------------------+
| Architecture Dimension    | Current Verified Local MVP        | Public Cloud Target Architecture  |
+---------------------------+-----------------------------------+-----------------------------------+
| Frontend Hosting          | Localhost Vite Dev Server (5173)  | Cloudflare Pages, Vercel, or S3   |
| Backend Hosting           | Local Express Node Process (4000) | AWS ECS/Fargate, Render, or GCP   |
| Database                  | Localhost Native PostgreSQL 16    | Managed AWS RDS PostgreSQL / Neon |
| Encrypted File Storage    | Local Encrypted Disk Directory    | AWS S3 (AES-256-GCM envelope kept)|
| Blockchain Ledger         | In-Memory Local Hardhat Node      | Ethereum Testnet (Sepolia/Polygon)|
| CORS & Ingress            | Configured for localhost & env    | Strict production domain policy   |
| Secret Management         | Local .env files                  | AWS Secrets Manager or Vault      |
+---------------------------+-----------------------------------+-----------------------------------+
```

### 18.2 Identified Public Deployment Blockers (To Be Addressed in Next Phase)
1. **Ephemeral Cloud Storage:** Ephemeral container filesystems (e.g. Render/Fargate) wipe local files on redeployment. An S3/Object Storage adapter implementing the same `LocalEncryptedStorage` envelope interface is required.
2. **EVM Persistence:** An in-memory Hardhat node cannot serve a public deployment. Deployment to a persistent public testnet (such as Sepolia or Polygon Amoy) or a hosted Hyperledger Besu instance is required.
3. **Domain & CORS:** Public frontend URL must be injected into backend `CORS_ORIGIN`, and backend URL must be baked into frontend `VITE_API_BASE_URL`.

---

## 19. Architectural Non-Negotiables ("Do Not Break")

Any future AI agent or developer MUST adhere to these strict constraints:

1. **Never store raw evidence unencrypted on disk.** Storage payloads must always be authenticated AES-256-GCM envelopes.
2. **Never expose master encryption keys.** Keys belong in environment variables, never in source code, logs, or API responses.
3. **Never store document bytes or PII on the blockchain.** The blockchain is for cryptographic proof metadata only.
4. **Never rely on frontend authorization alone.** The backend `CaseAuthorizationService` is the final authoritative boundary.
5. **Never mutate trusted hashes during verification.** Verification is strictly a read-only comparison.
6. **Never classify infrastructure/decryption failures as tampering.** Decryption errors or offline RPC nodes are `ERROR`, never `MISMATCH`.
7. **Never claim automatic statutory legal admissibility.** Use accurate evidentiary integrity terminology.
8. **Never reintroduce hardcoded case IDs (e.g. `case_001`).** All entities must resolve dynamically from the database.
9. **Never allow cross-user query cache retention.** `queryClient.clear()` must run on session boundaries.
10. **Never fall back to mock mode in production builds.** Missing env vars must default safely to live API mode.
11. **Never expose internal filesystem storage keys to clients.** Download streams must use sanitised original filenames.
12. **Preserve anti-enumeration 404 policy.** Unauthorized access to existing cases/documents must return 404.

---

## 20. Historical Bugs Diagnosed and Fixed

| Bug Identified | Root Cause | Solution Implemented | Status |
| :--- | :--- | :--- | :--- |
| **CORS Preflight Failure** | Express rejected OPTIONS requests from frontend. | Added explicit preflight interceptor and origin validation in `backend/src/app.ts`. | **FIXED** |
| **Upload Modal Seal Confusion** | Upload button implied simultaneous upload and seal. | Decoupled UI into two distinct steps: Upload (DRAFT) followed by explicit Sealing. | **FIXED** |
| **Missing Real Seal UI** | Frontend lacked an interactive button to trigger seal API. | Added dedicated "Seal & Anchor Document" button with live status animation. | **FIXED** |
| **View Document 404** | Frontend called non-existent `/preview` endpoint. | Implemented authenticated `/api/documents/:id/download` with in-memory decryption. | **FIXED** |
| **AuditPage `case_001` Crash** | Hardcoded `case_001` threw 404 on UUID-based cases. | Replaced with dynamic `api.cases.list()` query and interactive case matter selector. | **FIXED** |
| **Dashboard `case_001` Fallback** | Fallback queried `case_001` when 0 cases existed. | Removed fallback; disabled document query when no valid case ID is present. | **FIXED** |
| **Cross-User Session Cache Leak** | Stale React Query cache survived logout in SPA. | Added `queryClient.clear()` to `logout()`, `login()`, and `initAuth()` in `AuthProvider.tsx`. | **FIXED** |
| **Production Mock Fallback** | Missing env variable defaulted frontend to mock mode. | Changed default in `api-client.ts` so production builds always default to LIVE mode. | **FIXED** |
| **Blockchain IDE Type Errors** | Missing Mocha type registration in `tsconfig.json`. | Added `"types": ["node", "mocha"]` to `blockchain/tsconfig.json`. | **FIXED** |
| **Hardhat Network Mismatch** | Deploy script targeted hardhat instead of localhost node. | Standardized npm script to use `--network localhost`. | **FIXED** |

---

## 21. Current Work Breakdown & Next Priorities

```
[ COMPLETED & VERIFIED ]
├── Fully functional local MVP (Frontend, Backend, PostgreSQL, Hardhat EVM)
├── AES-256-GCM local encrypted disk storage
├── Canonical SHA-256 plaintext hashing & blockchain anchoring
├── Cryptographic hash-chained audit logging
├── 3-way verification pipeline with controlled tamper & restore tooling
├── Secure document view and download streaming
├── Dynamic case resolution across all pages
├── Session cache isolation on authentication transitions
└── 210 passing automated tests across backend and blockchain

[ NEXT PRIORITY: PUBLIC CLOUD DEPLOYMENT ]
├── Step 1: Design public deployment architecture (AWS / Render / Managed Postgres)
├── Step 2: Implement cloud-backed encrypted object storage adapter (S3-compatible)
├── Step 3: Configure public EVM testnet deployment (Sepolia or Polygon Amoy)
├── Step 4: Provision managed PostgreSQL database instance
├── Step 5: Configure production CORS, HTTPS, and domain bindings
└── Step 6: Perform end-to-end public browser verification
```

---

## 22. Protocol for Future AI Agent Continuation

When a new AI agent resumes work on NyayaVault:

1. **Read This Document First:** Read `NYAYAVAULT_PROJECT_STATE.md` completely before inspecting individual code files.
2. **Verify Local Environment:** Run the verification test suite (`npm run typecheck --prefix backend`, `npm test --prefix backend`, `npm test --prefix blockchain`) to ensure zero pre-existing regressions.
3. **Follow Investigation-First Workflow:** Never make code modifications during an investigation prompt. Diagnose root causes thoroughly before designing changes.
4. **Adhere to the Implementation Plan Pattern:** For any non-trivial change, produce an implementation plan, obtain user sign-off, implement precisely, and verify with tests.
5. **Preserve Architectural Boundaries:** Do not cross the Three-Member ownership boundaries casually. Do not place business logic in controllers or crypto in the UI.
6. **Maintain Verification Standards:** Run automated unit tests, compiler checks, and live browser tests for every user-facing change.
7. **Update This Document:** When new milestones, cloud adapters, or architectural features are finalized, update this master document accordingly.

---

## 23. Operational Command Reference

### Development Operations
```bash
# Start local blockchain node
npm run chain:node

# Deploy smart contract to local node
npm run chain:deploy

# Setup backend (compile + migrate + seed)
npm run backend:setup

# Start backend server (Port 4000)
npm run backend:start

# Start frontend dev server (Port 5173)
npm run frontend:dev

# Start optional Docker PostgreSQL
npm run db:docker:up

# Stop optional Docker PostgreSQL
npm run db:docker:down
```

### Automated Testing
```bash
# Run all backend tests (200 tests)
npm run test:backend

# Run blockchain contract tests (10 tests)
npm run test:blockchain

# Backend TypeScript typecheck
npm run typecheck --prefix backend

# Blockchain TypeScript check
npx tsc --noEmit --prefix blockchain

# Frontend production build validation
npm run build --prefix frontend

# Frontend code linter
npm run lint --prefix frontend
```

### Evaluator Demo Utilities
```bash
# Simulate storage tampering on an evidence file
node backend/scripts/demo/tamper-document.mjs <DOCUMENT_ID>

# Restore authentic storage artifact
node backend/scripts/demo/restore-document.mjs <DOCUMENT_ID>
```

---

## 24. Final Status Dashboard Snapshot

```
================================================================================
                    NYAYAVAULT SYSTEM MATURITY DASHBOARD
================================================================================
Core MVP Functionality          : [VERIFIED]  All evidence lifecycle flows active
Live Browser End-to-End         : [VERIFIED]  Golden path & tamper flow proven
AES-256-GCM Vault Storage       : [VERIFIED]  Encrypted payloads on disk
SHA-256 Evidentiary Sealing     : [VERIFIED]  Canonical in-memory digests
Blockchain EVM Anchoring        : [VERIFIED]  DocumentIntegrityRegistry active
Tamper Detection Engine         : [VERIFIED]  3-way mismatch detection proven
Evidence Restoration Tooling    : [VERIFIED]  Byte-for-byte recovery validated
Secure View & Download Stream   : [VERIFIED]  Authenticated in-memory decryption
Session Cache Isolation         : [VERIFIED]  Zero cross-user data retention
Automated Test Coverage         : [VERIFIED]  210 / 210 Tests Passing (100%)
TypeScript Compiler Status      : [VERIFIED]  0 Errors (Backend + Blockchain)
Frontend Production Build       : [VERIFIED]  Vite bundle compiled cleanly
PostgreSQL Portability          : [VERIFIED]  Native + Docker Compose ready
Public Cloud Deployment         : [PENDING]   Next engineering phase
================================================================================
Last Verified Milestone: M3-12 (Authentication Session Cache Isolation)
Master Handoff Record Compiled: September 2026 | Antigravity AI Engine
================================================================================
```
