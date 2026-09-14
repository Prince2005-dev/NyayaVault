import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { DomainError } from './errors/domain.errors.js';
import { createAuthRouter } from './routes/auth.routes.js';
import { createCaseRouter } from './routes/case.routes.js';
import { createDocumentRouter } from './routes/document.routes.js';

declare global {
  namespace Express {
    interface Request {
      id?: string;
    }
  }
}

/**
 * Maps known DomainErrors to appropriate HTTP status codes.
 */
function getDomainErrorStatusCode(err: DomainError): number {
  switch (err.code) {
    case 'DOCUMENT_NOT_FOUND':
    case 'FILE_NOT_FOUND':
    case 'CASE_NOT_FOUND':
    case 'USER_NOT_FOUND':
      return 404;
    case 'DOCUMENT_ALREADY_SEALED':
    case 'BLOCKCHAIN_ANCHOR_ALREADY_EXISTS':
    case 'CASE_MEMBER_ALREADY_EXISTS':
      return 409;
    case 'CASE_ACCESS_DENIED':
      return 403;
    case 'INVALID_DOCUMENT_STATE':
    case 'BLOCKCHAIN_INVALID_HASH':
    case 'BLOCKCHAIN_INVALID_ID':
    case 'INVALID_CASE_REQUEST':
    case 'INVALID_FILE_TYPE':
    case 'FILE_TOO_LARGE':
    case 'INVALID_UPLOAD_REQUEST':
      return 400;
    case 'UPLOAD_AUDIT_FAILED':
      return 500;
    case 'DECRYPTION_FAILED':
    case 'AUDIT_CHAIN_BROKEN':
      return 422;
    case 'BLOCKCHAIN_UNAVAILABLE':
      return 503;
    case 'BLOCKCHAIN_TRANSACTION_FAILED':
      return 502;
    default:
      return 500;
  }
}

import type { CaseController } from './controllers/case.controller.js';
import type { DocumentController } from './controllers/document.controller.js';

export interface CreateAppOptions {
  enableLogging?: boolean;
  configureRoutes?: (app: Express) => void;
  caseController?: CaseController;
  documentController?: DocumentController;
}

/**
 * Creates and configures the NyayaVault Express application foundation.
 *
 * Architecture:
 * - Request ID middleware assigns or propagates a unique request identifier.
 * - JSON body parser parses incoming JSON payloads.
 * - Minimal request logging tracks incoming requests without exposing secrets or bodies.
 * - GET /health reports liveness without leaking sensitive system details.
 * - Centralized 404 middleware returns uniform JSON error for unknown routes.
 * - Centralized error middleware formats domain and unexpected errors into safe JSON responses.
 */
export function createApp(options: CreateAppOptions = {}): Express {
  const app = express();

  // Disable X-Powered-By header to prevent technology fingerprinting
  app.disable('x-powered-by');

  // 1. Request ID Middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    const incomingId = req.headers['x-request-id'];
    const requestId =
      typeof incomingId === 'string' && incomingId.trim().length > 0
        ? incomingId.trim()
        : randomUUID();

    req.id = requestId;
    res.setHeader('X-Request-Id', requestId);
    next();
  });

  // 1b. CORS Middleware: Allow frontend origins and intercept preflight requests
  const allowedOrigins = new Set([
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ]);

  if (process.env.CORS_ORIGIN) {
    const configuredOrigins = process.env.CORS_ORIGIN.split(',').map((o) => o.trim());
    for (const origin of configuredOrigins) {
      if (origin && origin !== '*') {
        try {
          const parsed = new URL(origin);
          if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            allowedOrigins.add(parsed.origin);
          }
        } catch {
          // Ignore invalid URL formats safely without crashing
        }
      }
    }
  }

  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-Id');
    res.setHeader('Access-Control-Max-Age', '86400');

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // 2. JSON Body Parsing Middleware
  app.use(express.json());

  // 3. Minimal Request Logging (disabled in test runs unless explicitly enabled)
  const shouldLog = options.enableLogging ?? process.env.NODE_ENV !== 'test';
  if (shouldLog) {
    app.use((req: Request, res: Response, next: NextFunction) => {
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[${req.id}] ${req.method} ${req.originalUrl} ${res.statusCode} (${duration}ms)`);
      });
      next();
    });
  }

  // 4. Health Check Endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
  });

  // 4b. Canonical Authentication Routes (M3-03)
  app.use('/api/auth', createAuthRouter());

  // 4c. Canonical Case Management Routes (M3-04, M3-05B)
  app.use('/api/cases', createCaseRouter(options.caseController, options.documentController));

  // 4d. Canonical Document Routes (M3-05A, M3-06)
  app.use('/api/documents', createDocumentRouter(options.documentController));

  // 4e. Optional Route Registration (for feature modules and test endpoints)
  if (options.configureRoutes) {
    options.configureRoutes(app);
  }

  // 5. Centralized 404 Not Found Middleware (Catch-all for unmatched routes)

  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found.',
      },
    });
  });

  // 6. Centralized Error Handling Middleware
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    // Handle JSON syntax errors from express.json()
    if (err instanceof SyntaxError && 'body' in (err as unknown as Record<string, unknown>)) {
      res.status(400).json({
        error: {
          code: 'BAD_REQUEST',
          message: 'Malformed JSON in request body.',
        },
      });
      return;
    }

    // Handle Multer upload errors safely
    if (err && typeof err === 'object' && 'name' in err && err.name === 'MulterError') {
      const multerErr = err as { code?: string; message?: string };
      if (multerErr.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({
          error: {
            code: 'FILE_TOO_LARGE',
            message: 'Uploaded file exceeds the maximum permitted size of 25 MB.',
          },
        });
        return;
      }
      if (multerErr.code === 'LIMIT_UNEXPECTED_FILE') {
        res.status(400).json({
          error: {
            code: 'UNEXPECTED_FILE_FIELD',
            message: 'Unexpected multipart field encountered.',
          },
        });
        return;
      }
      res.status(400).json({
        error: {
          code: 'INVALID_MULTIPART_REQUEST',
          message: multerErr.message || 'Malformed multipart request.',
        },
      });
      return;
    }

    // Handle domain errors
    if (err instanceof DomainError) {
      const statusCode = getDomainErrorStatusCode(err);
      res.status(statusCode).json({
        error: {
          code: err.code,
          message: err.message,
        },
      });
      return;
    }

    // Temporary production diagnostic: log unexpected errors server-side only.
    console.error(`[${_req.id}] INTERNAL_ERROR`, err);

    // Handle unexpected internal errors (never expose stack traces or raw sensitive error messages)
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred.',
      },
    });
  });

  return app;
}
