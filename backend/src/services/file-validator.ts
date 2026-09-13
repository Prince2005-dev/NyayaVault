import path from 'node:path';
import { InvalidFileTypeError, FileTooLargeError, InvalidUploadRequestError } from '../errors/domain.errors.js';

export const MAX_UPLOAD_SIZE_BYTES =
  Number(process.env.MAX_UPLOAD_SIZE_BYTES) || 25 * 1024 * 1024; // 25 MB default

export interface ValidatedFile {
  buffer: Buffer;
  originalName: string;
  extension: string;
  mimeType: string;
  sizeBytes: number;
}

export const ALLOWED_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.docx']);

export const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

/**
 * Checks file magic bytes directly from buffer.
 */
export function verifyMagicBytes(buffer: Buffer, extension: string): boolean {
  if (!buffer || buffer.length < 4) {
    return false;
  }

  const ext = extension.toLowerCase();

  // 1. PDF: %PDF (0x25, 0x50, 0x44, 0x46)
  if (ext === '.pdf') {
    return (
      buffer[0] === 0x25 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x44 &&
      buffer[3] === 0x46
    );
  }

  // 2. JPEG: 0xFF, 0xD8, 0xFF
  if (ext === '.jpg' || ext === '.jpeg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }

  // 3. PNG: 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A
  if (ext === '.png') {
    if (buffer.length < 8) return false;
    return (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    );
  }

  // 4. DOCX: ZIP archive header PK\x03\x04 (0x50, 0x4B, 0x03, 0x04)
  if (ext === '.docx') {
    return (
      buffer[0] === 0x50 &&
      buffer[1] === 0x4b &&
      buffer[2] === 0x03 &&
      buffer[3] === 0x04
    );
  }

  return false;
}

/**
 * Normalizes and validates an uploaded file against extension, MIME type, size, and magic bytes.
 */
export function validateUploadedFile(file: Express.Multer.File | undefined): ValidatedFile {
  if (!file) {
    throw new InvalidUploadRequestError('No file was uploaded.');
  }

  if (!file.buffer || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
    throw new InvalidUploadRequestError('Uploaded file is empty.');
  }

  if (file.buffer.length > MAX_UPLOAD_SIZE_BYTES) {
    throw new FileTooLargeError(
      `File size (${file.buffer.length} bytes) exceeds maximum permitted limit (${MAX_UPLOAD_SIZE_BYTES} bytes).`
    );
  }

  const ext = path.extname(file.originalname || '').toLowerCase();
  if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
    throw new InvalidFileTypeError(
      `Unsupported file extension "${ext}". Allowed extensions: PDF, JPG, PNG, DOCX.`
    );
  }

  const rawMime = (file.mimetype || '').toLowerCase().trim();
  // Allow matching MIME types
  if (!ALLOWED_MIME_TYPES.has(rawMime)) {
    // Also accept octet-stream only if extension and magic bytes match exactly
    if (rawMime !== 'application/octet-stream') {
      throw new InvalidFileTypeError(
        `Unsupported MIME type "${file.mimetype}". Allowed types: application/pdf, image/jpeg, image/png, application/vnd.openxmlformats-officedocument.wordprocessingml.document.`
      );
    }
  }

  // Verify magic bytes
  const isSignatureValid = verifyMagicBytes(file.buffer, ext);
  if (!isSignatureValid) {
    throw new InvalidFileTypeError(
      `File binary signature (magic bytes) does not match expected format for extension "${ext}".`
    );
  }

  // Standardize MIME type based on extension if client sent generic
  let canonicalMime = rawMime;
  if (rawMime === 'application/octet-stream' || !ALLOWED_MIME_TYPES.has(rawMime)) {
    if (ext === '.pdf') canonicalMime = 'application/pdf';
    else if (ext === '.jpg' || ext === '.jpeg') canonicalMime = 'image/jpeg';
    else if (ext === '.png') canonicalMime = 'image/png';
    else if (ext === '.docx')
      canonicalMime =
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }

  return {
    buffer: file.buffer,
    originalName: file.originalname || `document${ext}`,
    extension: ext,
    mimeType: canonicalMime,
    sizeBytes: file.buffer.length,
  };
}
