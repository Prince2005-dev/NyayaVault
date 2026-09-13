# SIH26190 — NyayaVault Prototype
# Member 1 Documentation — Frontend + Core DMS

**Owner:** Member 1  
**Role:** Frontend + Core DMS  
**Project:** NyayaVault  
**Problem Statement:** SIH26190 — Secure Digital Document Management System for Legal & Investigation Documents  
**Prototype scope:** Minimal submission prototype  
**Primary objective:** Build the complete user-facing Case + Document Management experience and integrate with stable API contracts without taking ownership of blockchain, hashing, encryption internals, OCR, PII detection, or backend infrastructure.

---

# 1. Mission

Member 1 owns the **usable application surface**.

The frontend must allow a judge to complete this workflow:

```text
Login
  ↓
Dashboard
  ↓
Create / open Case
  ↓
Upload Document
  ↓
See Document Metadata
  ↓
See Security / Integrity Information
  ↓
View Document
  ↓
See Version
  ↓
Initiate Transfer (basic UI only if backend is ready)
  ↓
Open Audit / Verification result
```

The current project plan defines Lane 1 as:

- Frontend
- Authentication
- RBAC
- Case management
- Document management
- Database integration
- Versioning
- Sharing UI

with the success condition:

```text
Login
→ Create Case
→ Upload Document
→ View Metadata
→ View / Download
→ Create Version
→ Share / Transfer
```

For the **reduced prototype**, Member 1 should prioritize the first five steps and build only the minimum UI needed for versioning/transfer when the supporting API is available.

---

# 2. Non-Negotiable Scope

## MUST IMPLEMENT

### Authentication
- Login page
- Login API integration
- Persist authenticated session
- Logout
- Current-user information
- Protected routes

### Role-aware UI
- Read role from authenticated user
- Hide actions the user should not see
- Do not rely on frontend hiding as the security mechanism
- Backend remains authoritative for authorization

### Case management
- Case list
- Case search/filter
- Create case
- Case details
- Case metadata
- Case status
- Case classification
- Assigned investigator/department

### Document management
- Documents inside a case
- Upload document
- Upload progress/loading state
- Document metadata
- Document status
- Document version
- Document details page
- Secure view/download via backend API
- Integrity status display
- Blockchain anchor status display

### Prototype UI
- Clean dashboard
- Navigation
- Empty states
- Loading states
- Error states
- Success/error notifications
- Responsive desktop UI

---

# 3. DO NOT IMPLEMENT

Member 1 must NOT spend time implementing these internally:

```text
Blockchain logic
SHA-256 implementation
Encryption implementation
Audit hash chain
OCR engine
PII detection
Presidio
Smart contracts
Database migrations
Storage internals
JWT cryptography
Backend authorization logic
```

Member 1 only consumes their APIs/contracts.

Do NOT duplicate security logic in React.

---

# 4. Prototype User Roles

Use three seeded demo roles.

## Inspector

Capabilities:

```text
Create case
View assigned cases
Upload document
View permitted documents
Request transfer / share if available
Verify document
```

## Forensic Officer

Capabilities:

```text
View assigned cases/documents
View document
Receive transferred document
Verify document
```

## Auditor

Capabilities:

```text
View permitted cases
View document metadata
View audit history
View integrity status
View blockchain proof
Verify document
```

The current project plan explicitly requires role-based access and case/document access checks. The frontend should reflect this, while the backend must enforce it.

---

# 5. Final Prototype Screens

Keep the application to approximately **6–8 screens**.

## Screen 1 — Login

### Elements

```text
NyayaVault logo / name
Username
Password
Login button
Demo role hint (optional)
```

### Behavior

- Disable login button while submitting
- Show validation errors
- Show authentication failure clearly
- Redirect to dashboard on success
- Persist authenticated user state

### Example demo users

```text
inspector@nyayavault.local
forensic@nyayavault.local
auditor@nyayavault.local
```

Actual credentials should come from environment/demo seed data and never be hardcoded in source code.

---

# 6. Screen 2 — Dashboard

The dashboard should be minimal.

## Top summary cards

```text
My Cases
Documents
Sealed Documents
Integrity Alerts
```

Do not build charts.

## Main area

### Recent Cases

Columns:

```text
Case ID
Case Title
Classification
Status
Updated
Action
```

### Recent Documents

Columns:

```text
Document
Case
Version
Integrity
Status
Action
```

### Quick Actions

```text
Create Case
Open Cases
Upload Document
```

---

# 7. Screen 3 — Cases

## Case list

Search:

```text
Case ID
FIR Number
Case Title
```

Filters:

```text
Status
Classification
Department
```

Table:

```text
Case ID
Title
FIR No.
Classification
Status
Officer
Updated
```

Actions:

```text
Open
```

### Empty state

```text
No cases found.
Create your first case.
```

Do not implement advanced data-grid functionality.

---

# 8. Create Case

Use a simple modal or page.

## Fields

```text
Case ID
FIR Number
Case Title
Description
Department / Police Station
Investigating Officer
Classification
Status
```

## Classification

Only:

```text
INTERNAL
CONFIDENTIAL
HIGHLY_RESTRICTED
```

## Status

Only:

```text
ACTIVE
CLOSED
ARCHIVED
```

Default:

```text
Status = ACTIVE
Classification = CONFIDENTIAL
```

If Case ID is server-generated, display it after creation rather than requiring user entry.

---

# 9. Screen 4 — Case Details

Header:

```text
Case ID
Case Title
Status
Classification
```

Metadata card:

```text
FIR Number
Department
Police Station
Investigating Officer
Created At
Updated At
```

## Documents section

Button:

```text
+ Upload Document
```

Table/cards:

```text
Document Name
Type
Version
Status
Integrity
Uploaded By
Updated
Action
```

Actions:

```text
Open
Verify
Download
```

Do not put every feature into this page.

---

# 10. Screen 5 — Upload Document

This is an important UX screen.

## Upload steps

```text
Select file
   ↓
Enter metadata
   ↓
Upload
   ↓
Processing
   ↓
Document created
```

## Allowed prototype files

```text
PDF
JPG
PNG
DOCX
```

Maximum file size should come from backend configuration, not hardcoded separately in multiple places.

### Metadata

```text
Document Type
Document Title
Description (optional)
Classification
```

### Suggested Document Types

```text
FIR
Witness Statement
Forensic Report
Evidence
Charge Sheet
Court Filing
Legal Notice
Other
```

## Upload UI states

### Idle

```text
Drag & drop / Select file
```

### Selected

```text
Filename
File size
File type
Remove
Upload
```

### Uploading

```text
Uploading...
Progress
```

### Processing

```text
Document uploaded.
Securing and sealing...
```

### Success

```text
Document created successfully.

Document ID: DOC-001
Version: 1
Integrity: Pending / Verified
Blockchain: Pending / Anchored
```

### Error

```text
Upload failed.
[Retry]
```

---

# 11. Screen 6 — Document Details

This is the most important Member 1 page.

## Header

```text
Document Name
Document ID
Case ID
Status
Classification
```

## Metadata

```text
Document Type
Version
Uploaded By
Created At
Updated At
File Type
File Size
```

## Trust summary

Do not calculate these values in frontend.

Only display API response:

```text
SHA-256
Integrity Status
Blockchain Status
Blockchain Transaction ID
Sealed At
```

Example:

```text
INTEGRITY
✅ VERIFIED

BLOCKCHAIN
✅ ANCHORED

VERSION
v1

STATUS
SEALED
```

## Actions

```text
View
Download
Verify Integrity
Create Version
Transfer   [only when API is available]
```

Buttons should be role-aware.

---

# 12. Document Viewer

Keep this simple.

For PDF:

```text
Embedded PDF viewer / browser PDF rendering
```

For image:

```text
Image preview
```

For DOCX:

```text
Do not build an in-browser Office viewer.
Offer secure download instead.
```

Never construct a direct public storage URL in the frontend.

The backend should return an authorized file response or short-lived controlled access URL.

---

# 13. Version History

Minimal prototype.

Show:

```text
Version 2   Current
Version 1

Version
Created By
Created At
Status
SHA-256
```

Example:

```text
Forensic_Report.pdf

v2  CURRENT
Created by: Inspector
Created: 14:20
Status: SEALED
Hash: 71AB...

v1
Created by: Inspector
Created: 10:32
Status: SEALED
Hash: 8FA2...
```

The frontend must never imply that an older version was overwritten.

Versioning is part of the project requirements and is explicitly included in the overall prototype plan.

---

# 14. Basic Transfer UI

Only implement when the backend transfer endpoint is available.

Simple modal:

```text
Transfer Document

Recipient
Purpose / Reason

[Cancel] [Transfer]
```

After submission:

```text
Transfer requested
```

Do not build a complex multi-step workflow in Member 1.

The full custody state machine belongs to the security/integration lane.

---

# 15. Audit UI

Member 1 should consume the audit API and display a simple timeline.

Example:

```text
11:30  Inspector logged in

11:32  Case created

11:35  FIR.pdf uploaded

11:35  Document hash generated

11:36  Document sealed

11:36  Blockchain anchor created

11:40  Document viewed
```

This is presentation only.

Member 1 must NOT create or modify audit events directly from the frontend.

---

# 16. Integrity Verification UI

The backend/security lane owns verification.

Frontend only renders the response.

## PASS

```text
┌──────────────────────────────┐
│      ✅ DOCUMENT VERIFIED    │
├──────────────────────────────┤
│ Original Hash    A81F92...   │
│ Current Hash     A81F92...   │
│ Blockchain Hash  A81F92...   │
│ Blockchain TX    0x82ab...   │
└──────────────────────────────┘
```

## FAIL

```text
┌──────────────────────────────┐
│   🚨 DOCUMENT TAMPERED       │
├──────────────────────────────┤
│ Original Hash    A81F92...   │
│ Current Hash     73BD11...   │
│ Blockchain Hash  A81F92...   │
└──────────────────────────────┘
```

Use a clear visual difference between success and failure.

Do not use only color. Include icons/text.

---

# 17. Frontend Architecture

Use a clean feature-based structure.

```text
frontend/
└── src/
    ├── app/
    │   ├── router/
    │   ├── providers/
    │   └── config/
    │
    ├── components/
    │   ├── ui/
    │   ├── layout/
    │   ├── forms/
    │   └── feedback/
    │
    ├── features/
    │   ├── auth/
    │   │   ├── pages/
    │   │   ├── components/
    │   │   ├── api.ts
    │   │   └── types.ts
    │   │
    │   ├── dashboard/
    │   ├── cases/
    │   ├── documents/
    │   ├── audit/
    │   └── verification/
    │
    ├── services/
    │   ├── api-client.ts
    │   └── errors.ts
    │
    ├── hooks/
    ├── store/
    ├── types/
    ├── utils/
    └── main.tsx
```

Do not create one enormous `App.tsx`.

---

# 18. Recommended Frontend Stack

Use the stack already frozen in the project plan:

```text
React
Vite
TypeScript
Tailwind CSS
```

Recommended supporting libraries:

```text
React Router
TanStack Query
React Hook Form
Zod
Lucide React
```

Avoid installing libraries for problems you do not have.

---

# 19. State Management

Keep it simple.

## Server state

Use:

```text
TanStack Query
```

for:

```text
cases
documents
document details
audit
verification
current user
```

## Local UI state

Use React state for:

```text
modal open/close
selected file
form state
filters
```

Do not add Redux unless there is an actual need.

---

# 20. Authentication State

Create an:

```text
AuthProvider
```

Responsibilities:

```text
currentUser
isAuthenticated
login()
logout()
```

Protected routes:

```text
/dashboard
/cases
/cases/:id
/documents/:id
```

Public:

```text
/login
```

On initial load:

```text
GET /api/auth/me
```

If unauthorized:

```text
redirect /login
```

---

# 21. API Client

Create one central API client.

Example:

```ts
api.get(...)
api.post(...)
api.patch(...)
api.delete(...)
```

Responsibilities:

- base URL
- authorization handling
- JSON parsing
- standardized errors
- upload requests
- response normalization

Do not create `fetch()` calls directly inside every component.

---

# 22. Environment Variables

Create:

```text
VITE_API_BASE_URL
```

Example:

```text
VITE_API_BASE_URL=http://localhost:4000/api
```

Never place:

```text
database password
JWT signing secret
blockchain private key
storage secret
```

in frontend environment variables.

Anything exposed to Vite is effectively public.

---

# 23. API Contract Expected From Member 3 / Backend

Member 1 should code against the agreed contract.

## Auth

```http
POST /api/auth/login
GET  /api/auth/me
POST /api/auth/logout
```

### Login response

```json
{
  "user": {
    "id": "usr_001",
    "name": "Inspector Sharma",
    "email": "inspector@nyayavault.local",
    "role": "INSPECTOR"
  },
  "token": "..."
}
```

---

## Cases

```http
GET  /api/cases
POST /api/cases
GET  /api/cases/:id
```

### Case example

```json
{
  "id": "case_001",
  "caseNumber": "CASE-2026-001",
  "firNumber": "FIR/2026/001",
  "title": "Investigation Case",
  "department": "Women Safety Division",
  "policeStation": "Central Station",
  "investigatingOfficer": {
    "id": "usr_001",
    "name": "Inspector Sharma"
  },
  "classification": "HIGHLY_RESTRICTED",
  "status": "ACTIVE",
  "createdAt": "2026-09-11T10:30:00Z",
  "updatedAt": "2026-09-11T10:30:00Z"
}
```

---

# 24. Documents API

```http
GET  /api/cases/:caseId/documents
POST /api/cases/:caseId/documents
GET  /api/documents/:id
GET  /api/documents/:id/download
POST /api/documents/:id/versions
```

### Document example

```json
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
  "sha256": "a81f92...",
  "blockchainTxId": "0x82ab...",
  "createdBy": {
    "id": "usr_001",
    "name": "Inspector Sharma"
  },
  "createdAt": "2026-09-11T10:35:00Z"
}
```

---

# 25. Verification API

```http
POST /api/documents/:id/verify
```

### Success

```json
{
  "status": "VERIFIED",
  "originalHash": "a81f92...",
  "currentHash": "a81f92...",
  "blockchainHash": "a81f92...",
  "blockchainTxId": "0x82ab..."
}
```

### Failure

```json
{
  "status": "MISMATCH",
  "originalHash": "a81f92...",
  "currentHash": "73bd11...",
  "blockchainHash": "a81f92...",
  "blockchainTxId": "0x82ab..."
}
```

Frontend states must be driven from the response, not inferred locally.

---

# 26. Audit API

```http
GET /api/documents/:id/audit
```

Response:

```json
{
  "events": [
    {
      "id": "audit_001",
      "action": "DOCUMENT_UPLOADED",
      "actor": {
        "id": "usr_001",
        "name": "Inspector Sharma"
      },
      "timestamp": "2026-09-11T10:35:00Z"
    },
    {
      "id": "audit_002",
      "action": "DOCUMENT_SEALED",
      "actor": {
        "id": "usr_001",
        "name": "Inspector Sharma"
      },
      "timestamp": "2026-09-11T10:36:00Z"
    }
  ]
}
```

---

# 27. Frontend Security Rules

## Rule 1

Frontend hiding is not security.

Bad:

```ts
if (role === "AUDITOR") {
  hideButton();
}
```

and assuming the operation is protected.

Correct:

```text
Frontend:
hide/disable UI

Backend:
enforce permission
```

---

## Rule 2

Never trust IDs from URL.

Example:

```text
/cases/case_999
```

The backend must decide whether the current user can access it.

The frontend only displays the backend response.

---

## Rule 3

Never use localStorage for sensitive document content.

Do not cache:

```text
PDF bytes
document text
witness details
```

in browser storage.

---

## Rule 4

Do not create permanent public links.

Downloads must go through the authorized backend flow.

---

# 28. UX Error Handling

Every asynchronous action needs:

```text
loading
success
failure
```

Examples:

### Upload

```text
Uploading...
```

### Blockchain still processing

```text
Document secured.
Blockchain anchoring in progress...
```

### Verification failure

```text
Integrity verification failed.
The document does not match its recorded fingerprint.
```

Do not expose raw stack traces.

---

# 29. UI Design Direction

The project is legal/investigative security software.

Use:

```text
Professional
Minimal
High-trust
Information-dense
Desktop-first
```

Avoid:

```text
Gaming UI
Neon
Huge gradients
Excessive animation
Chatbot-style interface
Generic SaaS landing-page aesthetics
```

### Suggested visual hierarchy

```text
Top:
Page title + case context

Middle:
Primary action / trust status

Below:
Metadata / document information

Bottom:
Audit / history
```

---

# 30. Navigation

Simple sidebar:

```text
NyayaVault

Dashboard
Cases
Documents
Audit
Profile
Logout
```

Role-based:

Auditor additionally sees:

```text
Integrity Checks
Security Events
```

But again, backend authorization remains authoritative.

---

# 31. Component Checklist

Create reusable components:

```text
AppShell
Sidebar
Topbar
PageHeader
StatusBadge
ClassificationBadge
LoadingSpinner
EmptyState
ErrorState
ConfirmDialog
DataTable
FileUploader
DocumentCard
DocumentMetadata
IntegrityStatus
BlockchainStatus
AuditTimeline
VersionList
```

Don't duplicate the same badge/table/modal in every page.

---

# 32. Exact Member 1 Task Order

Do these in this order.

## M1-01 — Frontend bootstrap

```text
React
Vite
TypeScript
Tailwind
Router
Query
Form validation
```

### Done when

```text
npm install
npm run dev
```

works cleanly.

---

## M1-02 — App shell

Build:

```text
sidebar
topbar
content layout
route structure
```

---

## M1-03 — Authentication

Build:

```text
login page
auth provider
protected routes
logout
current user
```

---

## M1-04 — Cases

Build:

```text
case list
search
create case
case details
```

---

## M1-05 — Documents

Build:

```text
documents list
upload
document detail
viewer
download
```

---

## M1-06 — Trust UI

Consume:

```text
integrityStatus
sha256
blockchainStatus
txId
sealedAt
```

and render the security summary.

---

## M1-07 — Verification

Add:

```text
Verify Integrity
```

and render:

```text
PASS
MISMATCH
ERROR
```

---

## M1-08 — Audit timeline

Display document audit events.

---

## M1-09 — Version history

Display version list and create-version action if endpoint is ready.

---

## M1-10 — Basic transfer

Only if backend endpoint is ready.

---

# 33. Definition of Done for Member 1

Member 1 is finished when this exact browser flow works:

```text
Open application
 ↓
Login as Inspector
 ↓
Dashboard loads
 ↓
Open Cases
 ↓
Create Case
 ↓
Open Case
 ↓
Upload Evidence.pdf
 ↓
Document appears
 ↓
Open Document
 ↓
See metadata
 ↓
See SHA-256 / status
 ↓
See blockchain anchor
 ↓
View document
 ↓
Verify integrity
 ↓
PASS result shown
```

Then test:

```text
Login as Auditor
 ↓
Open permitted case
 ↓
Open document
 ↓
Cannot see unauthorized editing controls
 ↓
Can see verification / audit information
```

---

# 34. Responsive Requirements

This is a desktop-first hackathon application.

Required:

```text
1280px+
```

Supported:

```text
1024px+
```

Do not spend hours optimizing for phones.

The system can remain desktop-oriented because the primary target users are organizational/government users.

---

# 35. Accessibility Minimum

Use:

- semantic buttons
- labels for inputs
- keyboard-focusable controls
- readable contrast
- descriptive error messages
- non-color-only status indication

Example:

```text
✅ VERIFIED
⚠ PENDING
🚨 TAMPER DETECTED
```

---

# 36. Demo Data

The UI should work with seeded fictional data.

## Case

```text
CASE-2026-001
FIR/2026/001
Sensitive Investigation Case
Women Safety Division
Central Station
HIGHLY_RESTRICTED
ACTIVE
```

## Documents

```text
FIR.pdf
Witness_Statement.pdf
Forensic_Report.pdf
Evidence.jpg
```

Use synthetic names/data only.

Never put real survivor/witness information into the repository or demo.

---

# 37. Antigravity Master Prompt

Copy this into the Member 1 Antigravity agent after the repository and project plan documents are available:

```text
You are the Frontend + Core DMS engineer for the SIH26190 NyayaVault prototype.

Your responsibility is ONLY the frontend and the user-facing Case + Document Management experience.

PROJECT GOAL:
Build a minimal, polished prototype for:
Login → Dashboard → Case → Upload Document → Document Details → Integrity/Blockchain status → Verify.

READ THESE FILES FIRST:
- README.md
- docs/ARCHITECTURE.md
- docs/API_CONTRACT.md
- docs/DATABASE_SCHEMA.md
- docs/SECURITY_MODEL.md
- docs/DEMO_FLOW.md
- docs/MEMBER1_FRONTEND_DMS.md

PRIMARY STACK:
- React
- Vite
- TypeScript
- Tailwind CSS
- React Router
- TanStack Query
- React Hook Form
- Zod
- Lucide React

DO NOT IMPLEMENT:
- blockchain internals
- SHA-256 implementation
- encryption logic
- audit hash chain
- OCR
- Presidio
- database migrations
- storage internals
- smart contracts
- backend authorization logic

CONSUME THESE BACKEND APIS:
POST /api/auth/login
GET /api/auth/me
POST /api/auth/logout

GET /api/cases
POST /api/cases
GET /api/cases/:id

GET /api/cases/:caseId/documents
POST /api/cases/:caseId/documents
GET /api/documents/:id
GET /api/documents/:id/download
POST /api/documents/:id/versions

POST /api/documents/:id/verify
GET /api/documents/:id/audit

DESIGN:
- professional legal/investigative application
- desktop-first
- minimal
- clean
- high trust
- no excessive animation
- no unnecessary charts
- clear status indicators

REQUIRED SCREENS:
1. Login
2. Dashboard
3. Cases
4. Create Case
5. Case Details
6. Upload Document
7. Document Details
8. Verification/Audit view

REQUIRED DOCUMENT UI:
- document metadata
- version
- classification
- status
- SHA-256 display
- blockchain status
- blockchain transaction ID
- verify button
- view/download button

REQUIRED STATES:
- loading
- empty
- success
- validation error
- API error
- verification pass
- verification mismatch
- blockchain pending

SECURITY RULES:
- never treat frontend role checks as security
- never expose secrets
- never store document bytes in localStorage
- never create public file URLs
- use the backend for authorized document access
- never bypass API authorization
- use server responses as the source of truth

CODE QUALITY:
- TypeScript strictness where practical
- reusable components
- feature-based organization
- centralized API client
- no duplicated fetch logic
- no giant App.tsx
- no unnecessary dependencies
- no speculative features

WORKFLOW:
1. Inspect existing repository before editing.
2. Confirm current stack and folder structure.
3. Reuse existing components when available.
4. Implement one bounded feature at a time.
5. Run build/tests after each major module.
6. Do not modify backend modules unless a documented frontend contract mismatch blocks development.
7. If an API is not yet available, create a typed mock adapter only in the frontend and clearly isolate it so it can later be replaced.
8. Do not invent backend fields silently; document any required contract changes.

FIRST DELIVERABLE:
Create the frontend shell, routes, API client, auth state and basic page structure.

SECOND DELIVERABLE:
Implement Login + Dashboard + Cases.

THIRD DELIVERABLE:
Implement Case Details + Upload + Document Details.

FOURTH DELIVERABLE:
Implement Verification + Audit + version display.

FIFTH DELIVERABLE:
Polish loading/error/empty states and perform an end-to-end frontend flow test.

At the end of every task:
- summarize files changed
- summarize API assumptions
- list any blockers
- provide exact commands used to validate the work
```

---

# 38. Antigravity Sub-Prompts

Do NOT ask one agent to complete everything. Use these as separate bounded tasks.

---

## Agent Task M1-01 — Bootstrap

```text
Set up the React/Vite/TypeScript frontend for the NyayaVault prototype.

Requirements:
- TypeScript
- Tailwind
- React Router
- TanStack Query
- React Hook Form
- Zod
- Lucide React
- feature-based folder structure
- centralized API client
- environment-based VITE_API_BASE_URL

Create:
- AppShell
- routing skeleton
- loading/error boundary
- query provider
- auth provider skeleton

Do not build feature pages yet.
Do not modify backend.
Run build.
```

---

## Agent Task M1-02 — Authentication

```text
Implement frontend authentication for NyayaVault.

Requirements:
- Login page
- POST /api/auth/login
- GET /api/auth/me
- logout action
- protected routes
- authenticated user context
- role available to UI
- loading state
- error state

Do not implement authentication cryptography.
Do not implement backend changes unless API contract is impossible.

Test:
login success
login failure
unauthenticated redirect
logout
```

---

## Agent Task M1-03 — Cases

```text
Implement case management UI.

Pages:
- /cases
- /cases/new
- /cases/:id

Features:
- list cases
- search
- status filter
- classification display
- create case
- case details
- documents section

Use React Hook Form + Zod.
Use TanStack Query for server state.
Do not implement backend logic.
```

---

## Agent Task M1-04 — Documents

```text
Implement document management UI.

Features:
- document list inside a case
- upload file
- metadata form
- upload progress
- success/error state
- document details
- authorized view/download
- document status

Allowed prototype file types:
PDF, JPG, PNG, DOCX

Do not expose storage URLs.
Use the backend download endpoint.
Do not implement hashing/encryption.
```

---

## Agent Task M1-05 — Trust Information

```text
Add security/trust display to Document Details.

Display API-provided:
- SHA-256
- integrityStatus
- blockchainStatus
- blockchainTxId
- version
- sealedAt

Do not calculate or validate hashes in frontend.
Do not call blockchain directly.
Provide clear VERIFIED/PENDING/MISMATCH states.
```

---

## Agent Task M1-06 — Verification

```text
Implement Verify Integrity UI.

Call:
POST /api/documents/:id/verify

Render:
- VERIFIED
- MISMATCH
- API ERROR
- PENDING/UNKNOWN if returned

Display:
originalHash
currentHash
blockchainHash
blockchainTxId

Make mismatch highly visible.
Do not infer verification locally.
```

---

## Agent Task M1-07 — Audit

```text
Implement document audit timeline.

Call:
GET /api/documents/:id/audit

Display:
timestamp
actor
action
document context

Do not allow the frontend to create audit records directly.
```

---

## Agent Task M1-08 — Version History

```text
Implement version history UI.

Display:
version
createdBy
createdAt
status
sha256
current badge

Add create-version action only if:
POST /api/documents/:id/versions
is available.

Never present version replacement as an overwrite.
```

---

# 39. Testing Plan

## Unit/component tests

Test:

```text
Login form validation
Case form validation
Upload form validation
Role-based UI visibility
Document status rendering
Integrity status rendering
Verification result rendering
Audit timeline rendering
```

## Integration tests

Test:

```text
Login
→ cases
→ open case
→ upload
→ document details
→ verify
```

## Browser test

One Playwright happy-path test:

```text
Login as Inspector
→ Open Cases
→ Create Case
→ Open Case
→ Upload PDF
→ Open Document
→ Verify
→ See VERIFIED
```

One negative UI state:

```text
API returns MISMATCH
→ UI shows TAMPER DETECTED
```

---

# 40. Frontend Acceptance Checklist

## Login

```text
[ ] Login works
[ ] Invalid login displays error
[ ] Logout works
[ ] Protected routes reject unauthenticated user
```

## Cases

```text
[ ] Case list loads
[ ] Search works
[ ] Create case works
[ ] Case details work
[ ] Classification displays
[ ] Status displays
```

## Documents

```text
[ ] Upload works
[ ] File metadata displays
[ ] Documents list works
[ ] Document details work
[ ] View works
[ ] Download uses authorized API
```

## Security UI

```text
[ ] Role-aware controls
[ ] SHA-256 displays
[ ] Integrity status displays
[ ] Blockchain status displays
[ ] TX ID displays
[ ] Verify action works
[ ] Mismatch state displays
```

## Audit

```text
[ ] Audit timeline loads
[ ] Actor displays
[ ] Timestamp displays
[ ] Event action displays
```

## UX

```text
[ ] Loading states
[ ] Empty states
[ ] Error states
[ ] Success notifications
[ ] No console errors
[ ] Build passes
```

---

# 41. Integration Rules With Other Team Members

## With Member 2 — Security/Blockchain

Member 1 needs these API fields:

```text
sha256
integrityStatus
blockchainStatus
blockchainTxId
sealedAt
verificationStatus
```

Member 1 does not need to know how those values are generated.

---

## With Member 3 — Backend/Integration

Agree on:

```text
request payloads
response payloads
HTTP status codes
validation errors
pagination format
upload limits
download behavior
```

Do this before writing large UI code.

---

# 42. API Error Format

Ask backend to standardize errors.

Preferred:

```json
{
  "error": {
    "code": "DOCUMENT_ACCESS_DENIED",
    "message": "You are not authorized to access this document."
  }
}
```

Other examples:

```text
AUTH_INVALID_CREDENTIALS
CASE_NOT_FOUND
CASE_ACCESS_DENIED
DOCUMENT_NOT_FOUND
FILE_TYPE_NOT_ALLOWED
FILE_TOO_LARGE
DOCUMENT_SEALED
VERIFY_FAILED
BLOCKCHAIN_PENDING
```

The frontend maps `code` to a user-friendly message.

---

# 43. Important UI Rule for Security Status

Use clear terminology.

### Good

```text
✅ VERIFIED
⚠ ANCHOR PENDING
🚨 TAMPER DETECTED
🔒 SEALED
```

### Avoid

```text
100% SAFE
IMMUTABLE FOREVER
LEGALLY VALID
COURT APPROVED
```

The project documentation explicitly says not to claim automatic legal admissibility, absolute tamper-proof status, or production government readiness.

---

# 44. What a Judge Should See From Member 1's Work

A judge should be able to understand the system in less than one minute.

Screen:

```text
CASE-2026-001
Highly Restricted
Active

Documents: 4

Forensic_Report.pdf
Version 1
🔒 SEALED
✅ VERIFIED
⛓ ANCHORED

[VIEW]
[VERIFY]
```

Click document:

```text
Document Details
────────────────────────
SHA-256: A81F92...
Blockchain: 0x82ab...
Integrity: VERIFIED
Version: 1
Sealed: 10:36 AM
```

Then:

```text
[VERIFY INTEGRITY]
```

This is what the frontend is supposed to make effortless.

---

# 45. What NOT to Spend Time On

Do not build:

```text
❌ Landing page
❌ Marketing website
❌ Pricing page
❌ Blog
❌ Chatbot
❌ AI assistant
❌ Huge analytics charts
❌ Advanced animation
❌ Mobile UI
❌ Theme customizer
❌ Complex settings
❌ User registration
❌ Full profile management
❌ Notification center
```

A submission prototype is judged on the product workflow, not the number of menu items.

---

# 46. Time Budget for Member 1

Target:

## Hour 0–1

```text
Project bootstrap
App shell
Routing
API client
```

## Hour 1–3

```text
Login
Auth state
Protected routes
Dashboard
```

## Hour 3–5

```text
Cases
Create case
Case details
```

## Hour 5–8

```text
Document list
Upload
Document details
```

## Hour 8–10

```text
Integrity status
Blockchain status
Verify
```

## Hour 10–12

```text
Audit
Version history
Basic transfer UI
```

## Hour 12+

```text
Bug fixing
Integration
Polish
Demo rehearsal
```

If backend/API is late, use typed mock adapters temporarily and replace them after the API is available.

---

# 47. Final Member 1 Deliverable

At the end of the first prototype, Member 1 should hand the team:

```text
frontend/
├── working login
├── working protected routes
├── dashboard
├── case list
├── create case
├── case details
├── upload document
├── document details
├── document viewer
├── verification result
├── audit timeline
└── version history
```

And the complete browser flow:

```text
LOGIN
 ↓
DASHBOARD
 ↓
CASES
 ↓
CASE DETAILS
 ↓
UPLOAD DOCUMENT
 ↓
DOCUMENT DETAILS
 ↓
VERIFY INTEGRITY
 ↓
SHOW VERIFIED / TAMPER DETECTED
```

---

# 48. Final Instruction to the Agent

The agent must optimize for:

```text
WORKING
+
INTEGRATED
+
DEMOABLE
```

not:

```text
MAXIMUM FEATURES
+
MAXIMUM CODE
+
MAXIMUM ABSTRACTIONS
```

Do not introduce architecture that the prototype does not need.

Do not build the features owned by Member 2 or Member 3.

Do not change the API contract without notifying the team.

Do not use fake blockchain data in the frontend when a real API value is available.

Do not fake integrity verification.

The frontend exists to make the security workflow visible and usable.

---

# 49. Final Prototype Success Condition

Member 1's work is considered successful when:

```text
Inspector logs in
    ↓
Sees assigned cases
    ↓
Creates/opens case
    ↓
Uploads Evidence.pdf
    ↓
Sees document details
    ↓
Sees SHA-256
    ↓
Sees SEALED status
    ↓
Sees blockchain anchor
    ↓
Clicks Verify
    ↓
Gets VERIFIED
```

and, after the security team modifies the file:

```text
Clicks Verify
    ↓
Gets TAMPER DETECTED
```

That is enough.

**Do not expand the frontend scope until this exact flow is working.**
