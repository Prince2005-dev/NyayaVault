import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from './app.js';
import { DocumentNotFoundError } from './errors/domain.errors.js';

describe('Application Bootstrap: Express Foundation (M3-01)', () => {
  let server: Server;
  let baseUrl: string;

  before(async () => {
    const app = createApp({
      enableLogging: false,
      configureRoutes: (router) => {
        // Test route for domain error mapping
        router.get('/test/domain-error', () => {
          throw new DocumentNotFoundError('doc_case_999');
        });

        // Test route for unexpected error handling (with sensitive content that must be hidden)
        router.get('/test/unexpected-error', () => {
          throw new Error('Database password leaked: super_secret_pass_123');
        });

        // Test route for JSON parsing
        router.post('/test/echo-json', (req, res) => {
          res.status(200).json({ received: req.body });
        });
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
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  // Test 1: createApp() works
  it('should instantiate an Express application instance', () => {
    const app = createApp({ enableLogging: false });
    assert.ok(app);
    assert.equal(typeof app.listen, 'function');
  });

  // Test 2, 3, 4: GET /health returns 200, JSON, and status="ok"
  it('should return 200 OK with {"status": "ok"} from GET /health', async () => {
    const res = await fetch(`${baseUrl}/health`);

    // Status is 200
    assert.equal(res.status, 200);

    // Header is application/json
    const contentType = res.headers.get('content-type');
    assert.ok(contentType?.includes('application/json'));

    // Body contains {"status": "ok"}
    const body = (await res.json()) as { status?: string };
    assert.deepEqual(body, { status: 'ok' });
  });

  // Test 5: Unknown route returns JSON 404
  it('should return JSON 404 for unknown routes', async () => {
    const res = await fetch(`${baseUrl}/api/non-existent-endpoint`);

    assert.equal(res.status, 404);

    const contentType = res.headers.get('content-type');
    assert.ok(contentType?.includes('application/json'));

    const body = (await res.json()) as { error?: { code?: string; message?: string } };
    assert.ok(body.error);
    assert.equal(body.error.code, 'NOT_FOUND');
    assert.equal(body.error.message, 'Route not found.');
  });

  // Test 6: Response does not expose secrets
  it('should not expose sensitive headers, file paths, or cryptographic keys in responses', async () => {
    const res = await fetch(`${baseUrl}/health`);
    const rawText = await res.text();

    // Headers must not expose server technology details or secrets
    assert.equal(res.headers.get('x-powered-by'), null);

    // Body must not leak keys or environment paths
    assert.doesNotMatch(rawText, /secret/i);
    assert.doesNotMatch(rawText, /private/i);
    assert.doesNotMatch(rawText, /key/i);
    assert.doesNotMatch(rawText, /storage/i);
    assert.doesNotMatch(rawText, /rpc/i);
  });

  // Test 7: Central error middleware handles domain errors and maps status codes
  it('should format domain errors into safe JSON responses with appropriate HTTP status', async () => {
    const res = await fetch(`${baseUrl}/test/domain-error`);

    assert.equal(res.status, 404);

    const body = (await res.json()) as { error?: { code?: string; message?: string } };
    assert.ok(body.error);
    assert.equal(body.error.code, 'DOCUMENT_NOT_FOUND');
    assert.match(body.error.message || '', /doc_case_999/);
  });

  // Test 8: Central error middleware suppresses stack traces and raw error messages for unexpected errors
  it('should handle unexpected errors safely without exposing internal messages or stack traces', async () => {
    const res = await fetch(`${baseUrl}/test/unexpected-error`);

    assert.equal(res.status, 500);

    const rawText = await res.text();
    const body = JSON.parse(rawText) as { error?: { code?: string; message?: string; stack?: unknown } };

    // Standard safe response
    assert.ok(body.error);
    assert.equal(body.error.code, 'INTERNAL_ERROR');
    assert.equal(body.error.message, 'An unexpected error occurred.');

    // No stack trace in response
    assert.equal(body.error.stack, undefined);

    // The sensitive string must NOT appear in the response payload
    assert.ok(!rawText.includes('super_secret_pass_123'));
  });

  // Test 9: Request ID header is returned and propagates custom request IDs
  it('should assign a unique X-Request-Id header to every response', async () => {
    const res1 = await fetch(`${baseUrl}/health`);
    const reqId1 = res1.headers.get('x-request-id');
    assert.ok(reqId1);
    assert.match(reqId1, /^[0-9a-fA-F-]{36}$/); // UUID format

    // Pass custom request ID and verify it is preserved
    const customId = 'req_custom_trace_8829';
    const res2 = await fetch(`${baseUrl}/health`, {
      headers: { 'X-Request-Id': customId },
    });
    assert.equal(res2.headers.get('x-request-id'), customId);
  });

  // Test 10: JSON parsing handles valid JSON payloads
  it('should parse incoming JSON payloads correctly', async () => {
    const payload = { documentName: 'Affidavit.pdf', caseId: 'CASE_2026_01' };
    const res = await fetch(`${baseUrl}/test/echo-json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as { received?: typeof payload };
    assert.deepEqual(body.received, payload);
  });

  // Test 11: JSON parsing handles malformed JSON safely
  it('should return 400 Bad Request with JSON error when given malformed JSON', async () => {
    const res = await fetch(`${baseUrl}/test/echo-json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ this is not valid json }',
    });

    assert.equal(res.status, 400);

    const body = (await res.json()) as { error?: { code?: string; message?: string } };
    assert.ok(body.error);
    assert.equal(body.error.code, 'BAD_REQUEST');
    assert.match(body.error.message || '', /Malformed JSON/i);
  });
});
