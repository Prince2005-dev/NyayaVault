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
import { authenticate, requireRole } from '../middleware/auth.middleware.js';

describe('Authentication & Basic RBAC (M3-03)', () => {
  let server: Server;
  let baseUrl: string;
  const prisma = getPrismaClient();
  const userRepo = new PrismaUserRepository();

  const TEST_PASSWORD = 'TestPassword@123';
  let testUserActiveId: string;
  let testUserInactiveId: string;
  let testAdminId: string;

  const testActiveEmail = `test-active-${Date.now()}@nyayavault.local`;
  const testInactiveEmail = `test-inactive-${Date.now()}@nyayavault.local`;
  const testAdminEmail = `test-admin-${Date.now()}@nyayavault.local`;

  before(async () => {
    initializeEnvironment();

    // Configure test application with RBAC test routes
    const app = createApp({
      enableLogging: false,
      configureRoutes: (router) => {
        // RBAC test endpoint requiring ADMIN role
        router.get(
          '/api/test/admin-only',
          authenticate,
          requireRole('ADMIN'),
          (req, res) => {
            res.status(200).json({ allowed: true, user: req.user });
          }
        );

        // RBAC test endpoint requiring INSPECTOR or FORENSIC_OFFICER
        router.get(
          '/api/test/officers-only',
          authenticate,
          requireRole('INSPECTOR', 'FORENSIC_OFFICER'),
          (req, res) => {
            res.status(200).json({ allowed: true, user: req.user });
          }
        );
      },
    });

    server = createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });

    // Seed test users in real PostgreSQL
    const passwordHash = await PasswordService.hashPassword(TEST_PASSWORD);

    const activeUser = await userRepo.create({
      email: testActiveEmail,
      name: 'Test Inspector',
      passwordHash,
      role: 'INSPECTOR',
      isActive: true,
    });
    testUserActiveId = activeUser.id;

    const inactiveUser = await userRepo.create({
      email: testInactiveEmail,
      name: 'Test Suspended Officer',
      passwordHash,
      role: 'INSPECTOR',
      isActive: false,
    });
    testUserInactiveId = inactiveUser.id;

    const adminUser = await userRepo.create({
      email: testAdminEmail,
      name: 'Test Super Admin',
      passwordHash,
      role: 'ADMIN',
      isActive: true,
    });
    testAdminId = adminUser.id;
  });

  after(async () => {
    // Clean up created test users from PostgreSQL
    await prisma.user.deleteMany({
      where: {
        id: { in: [testUserActiveId, testUserInactiveId, testAdminId] },
      },
    });

    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  // ==========================================
  // Registration / Persistence / Hashing Tests
  // ==========================================
  describe('User Persistence & Argon2id Hashing', () => {
    it('1. user can be persisted with password hash', async () => {
      const persisted = await userRepo.findById(testUserActiveId);
      assert.ok(persisted, 'User should be found in PostgreSQL');
      assert.equal(persisted.email, testActiveEmail);
      assert.ok(persisted.passwordHash.length > 0);
    });

    it('2. plaintext password is not stored', async () => {
      const persisted = await userRepo.findById(testUserActiveId);
      assert.ok(persisted);
      assert.notEqual(persisted.passwordHash, TEST_PASSWORD, 'Plaintext password must never be stored');
      assert.ok(persisted.passwordHash.startsWith('$argon2id$'), 'Hash must be formatted as Argon2id');
    });

    it('3. password hash is not returned in safe user projection', async () => {
      const persisted = await userRepo.findById(testUserActiveId);
      assert.ok(persisted);
      const safe = PrismaUserRepository.toSafeUser(persisted);
      assert.equal('passwordHash' in safe, false, 'Safe projection must not contain passwordHash');
      assert.equal((safe as unknown as Record<string, unknown>).passwordHash, undefined);
    });
  });

  // ==========================================
  // Login Endpoint Tests
  // ==========================================
  describe('POST /api/auth/login', () => {
    it('4. valid credentials return successful authentication with JWT', async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testActiveEmail,
          password: TEST_PASSWORD,
        }),
      });

      assert.equal(res.status, 200);
      const data = await res.json() as { user: Record<string, unknown>; token: string };
      assert.ok(data.token, 'Response must contain a JWT token');
      assert.equal(data.user.email, testActiveEmail);
      assert.equal(data.user.role, 'INSPECTOR');
      assert.equal('passwordHash' in data.user, false, 'Response user must not contain passwordHash');
    });

    it('5. wrong password is rejected with generic 401', async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testActiveEmail,
          password: 'CompletelyWrongPassword123!',
        }),
      });

      assert.equal(res.status, 401);
      const data = await res.json() as { error: { code: string; message: string } };
      assert.equal(data.error.code, 'INVALID_CREDENTIALS');
      assert.equal(data.error.message, 'Invalid credentials.');
    });

    it('6. unknown user is rejected with identical generic 401', async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'nonexistent-user-999@nyayavault.local',
          password: TEST_PASSWORD,
        }),
      });

      assert.equal(res.status, 401);
      const data = await res.json() as { error: { code: string; message: string } };
      assert.equal(data.error.code, 'INVALID_CREDENTIALS');
      assert.equal(data.error.message, 'Invalid credentials.');
    });

    it('7. inactive user is rejected with generic 401', async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testInactiveEmail,
          password: TEST_PASSWORD,
        }),
      });

      assert.equal(res.status, 401);
      const data = await res.json() as { error: { code: string; message: string } };
      assert.equal(data.error.code, 'INVALID_CREDENTIALS');
      assert.equal(data.error.message, 'Invalid credentials.');
    });

    it('8. invalid request body is rejected safely with 400', async () => {
      // Missing password
      const res1 = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testActiveEmail }),
      });
      assert.equal(res1.status, 400);

      // Empty body
      const res2 = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.equal(res2.status, 400);
    });
  });

  // ==========================================
  // JWT Authentication Tests
  // ==========================================
  describe('JWT Verification & Middleware', () => {
    it('9. valid JWT authenticates', async () => {
      const token = TokenService.generateToken({
        sub: testUserActiveId,
        email: testActiveEmail,
        role: 'INSPECTOR',
        name: 'Test Inspector',
      });

      const decoded = TokenService.verifyToken(token);
      assert.equal(decoded.sub, testUserActiveId);
      assert.equal(decoded.email, testActiveEmail);
      assert.equal(decoded.role, 'INSPECTOR');
    });

    it('10. expired JWT is rejected', async () => {
      const expiredToken = TokenService.generateToken(
        {
          sub: testUserActiveId,
          email: testActiveEmail,
          role: 'INSPECTOR',
          name: 'Test Inspector',
        },
        undefined,
        '-1s' // expired 1 second ago
      );

      const res = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${expiredToken}` },
      });

      assert.equal(res.status, 401);
      const data = await res.json() as { error: { code: string } };
      assert.equal(data.error.code, 'UNAUTHORIZED');
    });

    it('11. malformed JWT is rejected', async () => {
      const res = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: 'Bearer this.is.not.a.valid.jwt.token' },
      });

      assert.equal(res.status, 401);
      const data = await res.json() as { error: { code: string } };
      assert.equal(data.error.code, 'UNAUTHORIZED');
    });

    it('12. invalid signature is rejected', async () => {
      const foreignToken = TokenService.generateToken(
        {
          sub: testUserActiveId,
          email: testActiveEmail,
          role: 'INSPECTOR',
          name: 'Test Inspector',
        },
        'an-entirely-different-secret-key-32-chars-long'
      );

      const res = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${foreignToken}` },
      });

      assert.equal(res.status, 401);
      const data = await res.json() as { error: { code: string } };
      assert.equal(data.error.code, 'UNAUTHORIZED');
    });
  });

  // ==========================================
  // GET /api/auth/me Endpoint Tests
  // ==========================================
  describe('GET /api/auth/me', () => {
    it('13. authenticated user can access /api/auth/me', async () => {
      const token = TokenService.generateToken({
        sub: testUserActiveId,
        email: testActiveEmail,
        role: 'INSPECTOR',
        name: 'Test Inspector',
      });

      const res = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      assert.equal(res.status, 200);
      const data = await res.json() as { user: Record<string, unknown> };
      assert.equal(data.user.id, testUserActiveId);
      assert.equal(data.user.email, testActiveEmail);
      assert.equal(data.user.role, 'INSPECTOR');
    });

    it('14. unauthenticated request is rejected', async () => {
      const res = await fetch(`${baseUrl}/api/auth/me`);
      assert.equal(res.status, 401);
      const data = await res.json() as { error: { code: string } };
      assert.equal(data.error.code, 'UNAUTHORIZED');
    });

    it('15. returned user does not contain passwordHash', async () => {
      const token = TokenService.generateToken({
        sub: testUserActiveId,
        email: testActiveEmail,
        role: 'INSPECTOR',
        name: 'Test Inspector',
      });

      const res = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      assert.equal(res.status, 200);
      const data = await res.json() as { user: Record<string, unknown> };
      assert.equal('passwordHash' in data.user, false);
      assert.equal(data.user.passwordHash, undefined);
    });
  });

  // ==========================================
  // POST /api/auth/logout Tests
  // ==========================================
  describe('POST /api/auth/logout', () => {
    it('16. logout endpoint returns the expected response', async () => {
      const res = await fetch(`${baseUrl}/api/auth/logout`, {
        method: 'POST',
      });

      assert.equal(res.status, 200);
      const data = await res.json() as { success: boolean };
      assert.equal(data.success, true);
    });
  });

  // ==========================================
  // Role-Based Access Control (RBAC) Tests
  // ==========================================
  describe('Basic Role-Based Access Control (RBAC)', () => {
    it('17. allowed role succeeds', async () => {
      const adminToken = TokenService.generateToken({
        sub: testAdminId,
        email: testAdminEmail,
        role: 'ADMIN',
        name: 'Test Super Admin',
      });

      const res = await fetch(`${baseUrl}/api/test/admin-only`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      assert.equal(res.status, 200);
      const data = await res.json() as { allowed: boolean };
      assert.equal(data.allowed, true);
    });

    it('18. disallowed role returns 403 Forbidden', async () => {
      const inspectorToken = TokenService.generateToken({
        sub: testUserActiveId,
        email: testActiveEmail,
        role: 'INSPECTOR',
        name: 'Test Inspector',
      });

      const res = await fetch(`${baseUrl}/api/test/admin-only`, {
        headers: { Authorization: `Bearer ${inspectorToken}` },
      });

      assert.equal(res.status, 403);
      const data = await res.json() as { error: { code: string; message: string } };
      assert.equal(data.error.code, 'FORBIDDEN');
      assert.equal(data.error.message, 'Access denied: insufficient permissions.');
    });

    it('19. unauthenticated user returns 401 Unauthorized', async () => {
      const res = await fetch(`${baseUrl}/api/test/admin-only`);
      assert.equal(res.status, 401);
      const data = await res.json() as { error: { code: string } };
      assert.equal(data.error.code, 'UNAUTHORIZED');
    });
  });
});
