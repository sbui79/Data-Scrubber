import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

const VERSION = 1;
const NONCE_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;

/** Builds the AES-GCM associated data that binds ciphertext to its table, column and row. */
export function fieldAad(table: string, column: string, rowId: string): Buffer {
  return Buffer.from(`${table}.${column}.${rowId}`, "utf8");
}

export function generateDek(): Buffer {
  return randomBytes(KEY_LEN);
}

/** Layout: version(1) || nonce(12) || ciphertext || tag(16). */
export function encryptField(dek: Buffer, plaintext: string, aad: Buffer): Buffer {
  assertKey(dek);
  const nonce = randomBytes(NONCE_LEN);
  const cipher = createCipheriv("aes-256-gcm", dek, nonce);
  cipher.setAAD(aad);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([Buffer.from([VERSION]), nonce, ct, cipher.getAuthTag()]);
}

export function decryptField(dek: Buffer, blob: Buffer, aad: Buffer): string {
  assertKey(dek);
  if (blob.length < 1 + NONCE_LEN + TAG_LEN || blob[0] !== VERSION) {
    throw new Error("Invalid ciphertext");
  }
  const nonce = blob.subarray(1, 1 + NONCE_LEN);
  const tag = blob.subarray(blob.length - TAG_LEN);
  const ct = blob.subarray(1 + NONCE_LEN, blob.length - TAG_LEN);
  const decipher = createDecipheriv("aes-256-gcm", dek, nonce);
  decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  } catch {
    // Deliberately generic: never echo key, AAD or data in errors.
    throw new Error("Decryption failed");
  }
}

/** Keyed hash for IP / user-agent values stored in consent and audit rows. */
export function hmacHash(value: string, pepper: string): string {
  return createHmac("sha256", pepper).update(value).digest("hex");
}

function assertKey(k: Buffer) {
  if (k.length !== KEY_LEN) throw new Error("Invalid key length");
}

/** Wraps/unwraps per-user data keys. Production: a cloud KMS. Local: MockKms. */
export interface KmsAdapter {
  wrap(dek: Buffer): Promise<{ wrapped: Buffer; keyId: string }>;
  unwrap(wrapped: Buffer, keyId: string): Promise<Buffer>;
}

/** Local-development KMS using an env-provided master key. Not for production. */
export class MockKms implements KmsAdapter {
  constructor(private readonly masterKey: Buffer, private readonly keyId = "mock-1") {
    assertKey(masterKey);
  }
  async wrap(dek: Buffer) {
    return { wrapped: encryptField(this.masterKey, dek.toString("base64"), Buffer.from(this.keyId)), keyId: this.keyId };
  }
  async unwrap(wrapped: Buffer, keyId: string) {
    return Buffer.from(decryptField(this.masterKey, wrapped, Buffer.from(keyId)), "base64");
  }
}
