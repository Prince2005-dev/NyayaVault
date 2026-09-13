/**
 * Encrypted payload produced by authenticated AES-256-GCM encryption.
 */
export interface EncryptedPayload {
  /**
   * Encrypted binary ciphertext.
   */
  ciphertext: Buffer;

  /**
   * Hexadecimal-encoded 12-byte initialization vector (IV), generated fresh per operation.
   */
  iv: string;

  /**
   * Hexadecimal-encoded 16-byte authentication tag ensuring integrity and authenticity.
   */
  authTag: string;

  /**
   * Key version identifier used to encrypt the payload (e.g. 'v1').
   */
  keyVersion: string;
}

/**
 * Standardized encryption service contract for document payload processing.
 */
export interface EncryptionService {
  encrypt(data: Buffer): Promise<EncryptedPayload>;
  decrypt(payload: EncryptedPayload): Promise<Buffer>;
}

/**
 * Serializes an EncryptedPayload into a self-contained Buffer for storage persistence.
 */
export function serializeEncryptedPayload(payload: EncryptedPayload): Buffer {
  return Buffer.from(
    JSON.stringify({
      v: payload.keyVersion,
      iv: payload.iv,
      tag: payload.authTag,
      ct: payload.ciphertext.toString('base64'),
    }),
    'utf-8'
  );
}

/**
 * Deserializes an EncryptedPayload from a stored Buffer.
 */
export function deserializeEncryptedPayload(buffer: Buffer): EncryptedPayload {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new TypeError('deserializeEncryptedPayload requires a valid non-empty Buffer.');
  }

  let json: { v?: string; iv?: string; tag?: string; ct?: string };
  try {
    json = JSON.parse(buffer.toString('utf-8'));
  } catch {
    throw new Error('Malformed encrypted payload: Failed to parse stored envelope.');
  }

  if (!json.v || !json.iv || !json.tag || !json.ct) {
    throw new Error('Malformed encrypted payload: Missing required envelope fields (v, iv, tag, ct).');
  }

  return {
    keyVersion: json.v,
    iv: json.iv,
    authTag: json.tag,
    ciphertext: Buffer.from(json.ct, 'base64'),
  };
}
