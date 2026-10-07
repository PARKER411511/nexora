import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export const MAGIC_V1 = Buffer.from("NEXORA-BACKUP\x01", "ascii");
export const MAGIC_V2 = Buffer.from("NEXORA-BACKUP\x02", "ascii");
const IV_BYTES = 12;
const TAG_BYTES = 16;
const MIN_SECRET_BYTES = 32;

export function assertStrongSecret(secret, name) {
  if (typeof secret !== "string" || Buffer.byteLength(secret, "utf8") < MIN_SECRET_BYTES || /^(.)\1+$/.test(secret)) {
    throw new Error(`${name} must be a high-entropy secret of at least ${MIN_SECRET_BYTES} UTF-8 bytes.`);
  }
}

export function deriveKey(secret) {
  assertStrongSecret(secret, "BACKUP_ENCRYPTION_KEY");
  return createHash("sha256").update(secret, "utf8").digest();
}

export function encryptBuffer(plaintext, secret) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([MAGIC_V2, iv, ciphertext, cipher.getAuthTag()]);
}

export function decryptBuffer(envelope, secret) {
  const isV1 = envelope.subarray(0, MAGIC_V1.length).equals(MAGIC_V1);
  const isV2 = envelope.subarray(0, MAGIC_V2.length).equals(MAGIC_V2);
  if (!isV1 && !isV2) throw new Error("Unsupported backup envelope.");
  const headerLength = isV1 ? MAGIC_V1.length : MAGIC_V2.length;
  if (envelope.length < headerLength + IV_BYTES + TAG_BYTES + 1) throw new Error("Backup envelope is truncated.");
  const iv = envelope.subarray(headerLength, headerLength + IV_BYTES);
  const tagStart = isV1 ? headerLength + IV_BYTES : envelope.length - TAG_BYTES;
  const tag = isV1
    ? envelope.subarray(headerLength + IV_BYTES, headerLength + IV_BYTES + TAG_BYTES)
    : envelope.subarray(tagStart);
  const ciphertext = isV1
    ? envelope.subarray(headerLength + IV_BYTES + TAG_BYTES)
    : envelope.subarray(headerLength + IV_BYTES, tagStart);
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
