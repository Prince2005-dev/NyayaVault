import multer from 'multer';
import type { Request, Response, NextFunction } from 'express';
import { MAX_UPLOAD_SIZE_BYTES } from '../services/file-validator.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_SIZE_BYTES,
    files: 1,
  },
});

/**
 * Middleware handling single multipart file upload for document ingestion.
 *
 * Security & Reliability:
 * - Uses memory storage exclusively: plaintext bytes are buffered in RAM only and never touch disk unencrypted.
 * - Enforces strict 25 MB file size limit before processing.
 * - Catches MulterErrors immediately and translates them to uniform JSON error format.
 */
export function documentUploadMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  upload.single('file')(req, res, (err: unknown) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          res.status(400).json({
            error: {
              code: 'FILE_TOO_LARGE',
              message: `Uploaded file exceeds the maximum permitted size of ${
                MAX_UPLOAD_SIZE_BYTES / (1024 * 1024)
              } MB.`,
            },
          });
          return;
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          res.status(400).json({
            error: {
              code: 'UNEXPECTED_FILE_FIELD',
              message: `Unexpected multipart field "${err.field}". Document file must be supplied in "file" field.`,
            },
          });
          return;
        }
        res.status(400).json({
          error: {
            code: 'INVALID_MULTIPART_REQUEST',
            message: err.message || 'Malformed multipart upload request.',
          },
        });
        return;
      }
      next(err);
      return;
    }
    next();
  });
}
