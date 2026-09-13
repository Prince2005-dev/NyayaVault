import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../app.js';
import { initializeEnvironment } from '../config/encryption.config.js';
import { getPrismaClient } from '../database/prisma.client.js';
import { PrismaUserRepository } from '../database/prisma-user.repository.js';
import { PasswordService } from '../services/password.service.js';
import { TokenService } from '../services/token.service.js';

describe('Case Management & Case-Level Authorization (M3-04)', () => {
  let server: Server;
  let baseUrl: string;
  const prisma = getPrismaClient();
  const userRepo = new PrismaUserRepository();

  // Test users
  let inspector1Id: string;
  let inspector2Id: string;
  let forensicId: string;
  let auditorId: string;
  let adminId: string;

  let inspector1Token: string;
  let inspector2Token: string;
  let forensicToken: string;
  let auditorToken: string;
  let adminToken: string;

  const testSuffix = Date.now();
  const createdCaseIds: string[] = [];

  before(async () => {
    initializeEnvironment();

    const app = createApp({ enableLogging: false });
    server = createServer(app);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });

    const pwdHash = await PasswordService.hashPassword('CaseTestPass@123');

    // Create isolated test users in PostgreSQL
    const u1 = await userRepo.create({
      email: `inspector1-${testSuffix}@nyayavault.local`,
      name: 'Inspector One',
      passwordHash: pwdHash,
      role: 'INSPECTOR',
    });
    inspector1Id = u1.id;
    inspector1Token = TokenService.generateToken({
      sub: u1.id,
      email: u1.email,
      role: 'INSPECTOR',
      name: u1.name,
    });

    const u2 = await userRepo.create({
      email: `inspector2-${testSuffix}@nyayavault.local`,
      name: 'Inspector Two',
      passwordHash: pwdHash,
      role: 'INSPECTOR',
    });
    inspector2Id = u2.id;
    inspector2Token = TokenService.generateToken({
      sub: u2.id,
      email: u2.email,
      role: 'INSPECTOR',
      name: u2.name,
    });

    const u3 = await userRepo.create({
      email: `forensic-${testSuffix}@nyayavault.local`,
      name: 'Dr. Forensic',
      passwordHash: pwdHash,
      role: 'FORENSIC_OFFICER',
    });
    forensicId = u3.id;
    forensicToken = TokenService.generateToken({
      sub: u3.id,
      email: u3.email,
      role: 'FORENSIC_OFFICER',
      name: u3.name,
    });

    const u4 = await userRepo.create({
      email: `auditor-${testSuffix}@nyayavault.local`,
      name: 'Auditor Official',
      passwordHash: pwdHash,
      role: 'AUDITOR',
    });
    auditorId = u4.id;
    auditorToken = TokenService.generateToken({
      sub: u4.id,
      email: u4.email,
      role: 'AUDITOR',
      name: u4.name,
    });

    const u5 = await userRepo.create({
      email: `admin-${testSuffix}@nyayavault.local`,
      name: 'System Admin',
      passwordHash: pwdHash,
      role: 'ADMIN',
    });
    adminId = u5.id;
    adminToken = TokenService.generateToken({
      sub: u5.id,
      email: u5.email,
      role: 'ADMIN',
      name: u5.name,
    });
  });

  after(async () => {
    // Clean up created cases and memberships
    if (createdCaseIds.length > 0) {
      await prisma.caseMember.deleteMany({
        where: { caseId: { in: createdCaseIds } },
      });
      await prisma.case.deleteMany({
        where: { id: { in: createdCaseIds } },
      });
    }

    // Clean up test users
    await prisma.user.deleteMany({
      where: {
        id: { in: [inspector1Id, inspector2Id, forensicId, auditorId, adminId] },
      },
    });

    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  // ==========================================
  // Section 34: Case Creation Tests (1 - 6)
  // ==========================================
  describe('Case Creation (POST /api/cases)', () => {
    it('1. authenticated user can create a case', async () => {
      const res = await fetch(`${baseUrl}/api/cases`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${inspector1Token}`,
        },
        body: JSON.stringify({
          title: 'Homicide Evidentiary Investigation',
          firNumber: `FIR/2026/${testSuffix}-001`,
          department: 'Special Crime Branch',
          policeStation: 'North PS',
        }),
      });

      assert.equal(res.status, 201);
      const data = await res.json() as {
        id: string;
        title: string;
        firNumber: string;
        investigatingOfficer: { id: string; name: string };
      };
      assert.ok(data.id);
      assert.equal(data.title, 'Homicide Evidentiary Investigation');
      createdCaseIds.push(data.id);
    });

    it('2. createdBy is automatically set from req.user.id', async () => {
      const latestCaseId = createdCaseIds[createdCaseIds.length - 1];
      const dbCase = await prisma.case.findUnique({
        where: { id: latestCaseId },
      });

      assert.ok(dbCase);
      assert.equal(dbCase.createdBy, inspector1Id, 'Database createdBy must match authenticated caller ID');
    });

    it('3. creator receives membership in the case', async () => {
      const latestCaseId = createdCaseIds[createdCaseIds.length - 1];
      const membership = await prisma.caseMember.findUnique({
        where: {
          caseId_userId: {
            caseId: latestCaseId,
            userId: inspector1Id,
          },
        },
      });

      assert.ok(membership, 'Creator must be added to case_members');
      assert.equal(membership.role, 'LEAD');
    });

    it('4. unauthenticated caller gets 401', async () => {
      const res = await fetch(`${baseUrl}/api/cases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Unauthorized Case Matter',
          firNumber: 'FIR/2026/999',
        }),
      });

      assert.equal(res.status, 401);
      const data = await res.json() as { error: { code: string } };
      assert.equal(data.error.code, 'UNAUTHORIZED');
    });

    it('5. invalid case request gets 400', async () => {
      // Title too short (< 3 chars)
      const res1 = await fetch(`${baseUrl}/api/cases`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${inspector1Token}`,
        },
        body: JSON.stringify({
          title: 'AB',
          firNumber: 'FIR/2026/001',
        }),
      });
      assert.equal(res1.status, 400);

      // Missing firNumber
      const res2 = await fetch(`${baseUrl}/api/cases`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${inspector1Token}`,
        },
        body: JSON.stringify({
          title: 'Valid Case Title',
        }),
      });
      assert.equal(res2.status, 400);
    });

    it('6. spoofed createdBy is ignored/rejected and cannot alter creator', async () => {
      const res = await fetch(`${baseUrl}/api/cases`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${inspector1Token}`,
        },
        body: JSON.stringify({
          title: 'Spoof Prevention Test Case',
          firNumber: `FIR/2026/${testSuffix}-002`,
          createdBy: inspector2Id, // Malicious spoof attempt
          ownerId: inspector2Id,   // Malicious spoof attempt
          actorId: inspector2Id,   // Malicious spoof attempt
        }),
      });

      assert.equal(res.status, 201);
      const data = await res.json() as { id: string; investigatingOfficer: { id: string } };
      createdCaseIds.push(data.id);

      // Verify the creator in DB remains inspector1
      const dbRecord = await prisma.case.findUnique({
        where: { id: data.id },
      });
      assert.ok(dbRecord);
      assert.equal(dbRecord.createdBy, inspector1Id, 'Spoofed createdBy in request body must be ignored');
      assert.notEqual(dbRecord.createdBy, inspector2Id);
      assert.equal(data.investigatingOfficer.id, inspector1Id);
    });
  });

  // ==========================================
  // Section 35: Case List Tests (7 - 11)
  // ==========================================
  describe('Case List (GET /api/cases)', () => {
    let caseForInspector1: string;
    let caseForInspector2: string;

    before(async () => {
      // Create a case specifically by inspector 1
      const res1 = await fetch(`${baseUrl}/api/cases`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${inspector1Token}`,
        },
        body: JSON.stringify({
          title: 'Inspector 1 Dedicated Matter',
          firNumber: `FIR/2026/${testSuffix}-101`,
        }),
      });
      const c1 = await res1.json() as { id: string };
      caseForInspector1 = c1.id;
      createdCaseIds.push(c1.id);

      // Create a case specifically by inspector 2
      const res2 = await fetch(`${baseUrl}/api/cases`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${inspector2Token}`,
        },
        body: JSON.stringify({
          title: 'Inspector 2 Dedicated Matter',
          firNumber: `FIR/2026/${testSuffix}-102`,
        }),
      });
      const c2 = await res2.json() as { id: string };
      caseForInspector2 = c2.id;
      createdCaseIds.push(c2.id);
    });

    it('7. authorized member sees their case', async () => {
      const res = await fetch(`${baseUrl}/api/cases`, {
        headers: { Authorization: `Bearer ${inspector1Token}` },
      });

      assert.equal(res.status, 200);
      const list = await res.json() as { id: string }[];
      const found = list.some((c) => c.id === caseForInspector1);
      assert.equal(found, true, 'Inspector 1 must see their own created case');
    });

    it('8. authorized member sees multiple assigned cases', async () => {
      // Add inspector 1 as member to caseForInspector2
      await prisma.caseMember.create({
        data: {
          caseId: caseForInspector2,
          userId: inspector1Id,
          role: 'MEMBER',
        },
      });

      const res = await fetch(`${baseUrl}/api/cases`, {
        headers: { Authorization: `Bearer ${inspector1Token}` },
      });

      assert.equal(res.status, 200);
      const list = await res.json() as { id: string }[];
      const hasCase1 = list.some((c) => c.id === caseForInspector1);
      const hasCase2 = list.some((c) => c.id === caseForInspector2);
      assert.equal(hasCase1 && hasCase2, true, 'Inspector 1 must see both assigned cases');
    });

    it('9. unauthorized user does not see another users case', async () => {
      // Auditor has no membership in caseForInspector2
      // Remove inspector1's membership in caseForInspector2 first to isolate test
      await prisma.caseMember.deleteMany({
        where: { caseId: caseForInspector2, userId: auditorId },
      });

      const res = await fetch(`${baseUrl}/api/cases`, {
        headers: { Authorization: `Bearer ${auditorToken}` },
      });

      assert.equal(res.status, 200);
      const list = await res.json() as { id: string }[];
      const hasUnauthorizedCase = list.some((c) => c.id === caseForInspector2);
      assert.equal(hasUnauthorizedCase, false, 'Auditor must not see case where they have no membership');
    });

    it('10. ADMIN can see all cases via global override', async () => {
      const res = await fetch(`${baseUrl}/api/cases`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      assert.equal(res.status, 200);
      const list = await res.json() as { id: string }[];
      const hasCase1 = list.some((c) => c.id === caseForInspector1);
      const hasCase2 = list.some((c) => c.id === caseForInspector2);
      assert.equal(hasCase1 && hasCase2, true, 'Admin must see all cases via explicit override');
    });

    it('11. non-admin role does not automatically receive all cases', async () => {
      // Forensic officer has no memberships assigned yet
      const res = await fetch(`${baseUrl}/api/cases`, {
        headers: { Authorization: `Bearer ${forensicToken}` },
      });

      assert.equal(res.status, 200);
      const list = await res.json() as { id: string }[];
      // Should not see caseForInspector1 or caseForInspector2
      const hasCase1 = list.some((c) => c.id === caseForInspector1);
      const hasCase2 = list.some((c) => c.id === caseForInspector2);
      assert.equal(hasCase1 || hasCase2, false, 'Forensic officer without membership must see neither case');
    });
  });

  // ==========================================
  // Section 36: Case Detail Tests (12 - 15)
  // ==========================================
  describe('Case Detail (GET /api/cases/:id)', () => {
    let privateCaseId: string;

    before(async () => {
      const res = await fetch(`${baseUrl}/api/cases`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${inspector1Token}`,
        },
        body: JSON.stringify({
          title: 'Restricted Forensic Evidence Case',
          firNumber: `FIR/2026/${testSuffix}-201`,
        }),
      });
      const c = await res.json() as { id: string };
      privateCaseId = c.id;
      createdCaseIds.push(c.id);
    });

    it('12. authorized member can retrieve case', async () => {
      const res = await fetch(`${baseUrl}/api/cases/${privateCaseId}`, {
        headers: { Authorization: `Bearer ${inspector1Token}` },
      });

      assert.equal(res.status, 200);
      const data = await res.json() as { id: string; title: string };
      assert.equal(data.id, privateCaseId);
      assert.equal(data.title, 'Restricted Forensic Evidence Case');
    });

    it('13. unauthorized member cannot retrieve case (receives 404 policy)', async () => {
      // Inspector 2 is NOT a member of privateCaseId
      const res = await fetch(`${baseUrl}/api/cases/${privateCaseId}`, {
        headers: { Authorization: `Bearer ${inspector2Token}` },
      });

      assert.equal(res.status, 404, 'Unauthorized lookup must return 404 to eliminate enumeration');
      const data = await res.json() as { error: { code: string } };
      assert.equal(data.error.code, 'CASE_NOT_FOUND');
    });

    it('14. unauthenticated request gets 401', async () => {
      const res = await fetch(`${baseUrl}/api/cases/${privateCaseId}`);
      assert.equal(res.status, 401);
      const data = await res.json() as { error: { code: string } };
      assert.equal(data.error.code, 'UNAUTHORIZED');
    });

    it('15. unknown case follows the chosen 404 policy', async () => {
      const res = await fetch(`${baseUrl}/api/cases/non-existent-case-id-999`, {
        headers: { Authorization: `Bearer ${inspector1Token}` },
      });

      assert.equal(res.status, 404);
      const data = await res.json() as { error: { code: string } };
      assert.equal(data.error.code, 'CASE_NOT_FOUND');
    });
  });

  // ==========================================
  // Section 37: Membership Management Tests (16 - 20)
  // ==========================================
  describe('Case Membership Management (POST /api/cases/:id/members)', () => {
    let targetCaseId: string;

    before(async () => {
      const res = await fetch(`${baseUrl}/api/cases`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${inspector1Token}`,
        },
        body: JSON.stringify({
          title: 'Multi-Agency Taskforce Case',
          firNumber: `FIR/2026/${testSuffix}-301`,
        }),
      });
      const c = await res.json() as { id: string };
      targetCaseId = c.id;
      createdCaseIds.push(c.id);
    });

    it('16. authorized ADMIN can add a member', async () => {
      const res = await fetch(`${baseUrl}/api/cases/${targetCaseId}/members`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          userId: forensicId,
          role: 'FORENSIC_EXAMINER',
        }),
      });

      assert.equal(res.status, 201);
      const data = await res.json() as { success: boolean; member: { userId: string; role: string } };
      assert.equal(data.success, true);
      assert.equal(data.member.userId, forensicId);
    });

    it('17. unauthorized non-admin cannot add a member', async () => {
      // Inspector 2 is NOT an admin or creator
      const res = await fetch(`${baseUrl}/api/cases/${targetCaseId}/members`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${inspector2Token}`,
        },
        body: JSON.stringify({
          userId: auditorId,
        }),
      });

      assert.equal(res.status, 403);
      const data = await res.json() as { error: { code: string } };
      assert.equal(data.error.code, 'CASE_ACCESS_DENIED');
    });

    it('18. duplicate membership is rejected', async () => {
      // Forensic is already a member from Test 16
      const res = await fetch(`${baseUrl}/api/cases/${targetCaseId}/members`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          userId: forensicId,
        }),
      });

      assert.equal(res.status, 409);
      const data = await res.json() as { error: { code: string } };
      assert.equal(data.error.code, 'CASE_MEMBER_ALREADY_EXISTS');
    });

    it('19. nonexistent target user is rejected', async () => {
      const res = await fetch(`${baseUrl}/api/cases/${targetCaseId}/members`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          userId: 'non-existent-user-uuid-999',
        }),
      });

      assert.equal(res.status, 404);
      const data = await res.json() as { error: { code: string } };
      assert.equal(data.error.code, 'USER_NOT_FOUND');
    });

    it('20. target user can become a case member and then access the case', async () => {
      // Auditor cannot access targetCaseId yet
      const preCheck = await fetch(`${baseUrl}/api/cases/${targetCaseId}`, {
        headers: { Authorization: `Bearer ${auditorToken}` },
      });
      assert.equal(preCheck.status, 404);

      // Add Auditor as member
      const addRes = await fetch(`${baseUrl}/api/cases/${targetCaseId}/members`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          userId: auditorId,
          role: 'AUDIT_OBSERVER',
        }),
      });
      assert.equal(addRes.status, 201);

      // Auditor can now access targetCaseId
      const postCheck = await fetch(`${baseUrl}/api/cases/${targetCaseId}`, {
        headers: { Authorization: `Bearer ${auditorToken}` },
      });
      assert.equal(postCheck.status, 200);
      const caseData = await postCheck.json() as { id: string };
      assert.equal(caseData.id, targetCaseId);
    });
  });

  // ==========================================
  // Section 38: Authorization Security Tests (21 - 27)
  // ==========================================
  describe('Authorization Security Boundaries', () => {
    let secretCaseId: string;

    before(async () => {
      const res = await fetch(`${baseUrl}/api/cases`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${inspector1Token}`,
        },
        body: JSON.stringify({
          title: 'Classified Top-Secret Case',
          firNumber: `FIR/2026/${testSuffix}-401`,
          classification: 'HIGHLY_RESTRICTED',
        }),
      });
      const c = await res.json() as { id: string };
      secretCaseId = c.id;
      createdCaseIds.push(c.id);
    });

    it('21. changing case ID in the URL cannot bypass access control', async () => {
      // Trying various manipulated IDs without authorization
      const res1 = await fetch(`${baseUrl}/api/cases/${secretCaseId}`, {
        headers: { Authorization: `Bearer ${inspector2Token}` },
      });
      assert.equal(res1.status, 404);

      const res2 = await fetch(`${baseUrl}/api/cases/${secretCaseId.toUpperCase()}`, {
        headers: { Authorization: `Bearer ${inspector2Token}` },
      });
      assert.equal(res2.status, 404);
    });

    it('22. modifying req/user-related request-body fields cannot spoof caller identity', async () => {
      const res = await fetch(`${baseUrl}/api/cases`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${inspector2Token}`,
        },
        body: JSON.stringify({
          title: 'Identity Spoof Attack Case',
          firNumber: `FIR/2026/${testSuffix}-402`,
          createdBy: adminId,
          userId: adminId,
          actorId: adminId,
          ownerId: adminId,
        }),
      });

      assert.equal(res.status, 201);
      const data = await res.json() as { id: string; investigatingOfficer: { id: string } };
      createdCaseIds.push(data.id);

      // Caller remains inspector2
      assert.equal(data.investigatingOfficer.id, inspector2Id);
      const dbRecord = await prisma.case.findUnique({ where: { id: data.id } });
      assert.equal(dbRecord?.createdBy, inspector2Id);
    });

    it('23. INSPECTOR without membership cannot access another case', async () => {
      const res = await fetch(`${baseUrl}/api/cases/${secretCaseId}`, {
        headers: { Authorization: `Bearer ${inspector2Token}` },
      });
      assert.equal(res.status, 404);
    });

    it('24. FORENSIC_OFFICER without membership cannot access another case', async () => {
      const res = await fetch(`${baseUrl}/api/cases/${secretCaseId}`, {
        headers: { Authorization: `Bearer ${forensicToken}` },
      });
      assert.equal(res.status, 404);
    });

    it('25. AUDITOR without membership cannot access another case', async () => {
      const res = await fetch(`${baseUrl}/api/cases/${secretCaseId}`, {
        headers: { Authorization: `Bearer ${auditorToken}` },
      });
      assert.equal(res.status, 404);
    });

    it('26. ADMIN override works explicitly', async () => {
      const res = await fetch(`${baseUrl}/api/cases/${secretCaseId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.equal(res.status, 200);
      const data = await res.json() as { id: string; title: string };
      assert.equal(data.id, secretCaseId);
      assert.equal(data.title, 'Classified Top-Secret Case');
    });

    it('27. role alone does not bypass membership for non-admin users', async () => {
      // Even though inspector2, forensic, and auditor have powerful global roles,
      // none of them can access secretCaseId without explicit membership
      const r1 = await fetch(`${baseUrl}/api/cases/${secretCaseId}`, {
        headers: { Authorization: `Bearer ${inspector2Token}` },
      });
      assert.equal(r1.status, 404);

      const r2 = await fetch(`${baseUrl}/api/cases/${secretCaseId}`, {
        headers: { Authorization: `Bearer ${forensicToken}` },
      });
      assert.equal(r2.status, 404);

      const r3 = await fetch(`${baseUrl}/api/cases/${secretCaseId}`, {
        headers: { Authorization: `Bearer ${auditorToken}` },
      });
      assert.equal(r3.status, 404);
    });
  });
});
