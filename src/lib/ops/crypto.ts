import { createCipheriv, createHash, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";

export const BACKUP_MAGIC_V1 = Buffer.from("NEXORA-BACKUP\x01", "ascii");
export const BACKUP_MAGIC_V2 = Buffer.from("NEXORA-BACKUP\x02", "ascii");
export const BACKUP_IV_BYTES = 12;
export const BACKUP_TAG_BYTES = 16;
export const MIN_SECRET_BYTES = 32;

export function assertStrongSecret(value: string, name: string) {
  if (Buffer.byteLength(value, "utf8") < MIN_SECRET_BYTES || /^(.)\1+$/.test(value)) {
    throw new Error(`${name} must be a high-entropy secret of at least ${MIN_SECRET_BYTES} UTF-8 bytes.`);
  }
}

export function deriveBackupKey(secret: string) {
  assertStrongSecret(secret, "BACKUP_ENCRYPTION_KEY");
  return createHash("sha256").update(secret, "utf8").digest();
}

export function hashExportSecret(secret: string) {
  assertStrongSecret(secret, "BACKUP_EXPORT_SECRET");
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export function secretsEqual(left: string, right: string) {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function encryptBackupJson(json: string, secret: string) {
  const iv = randomBytes(BACKUP_IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", deriveBackupKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(json, "utf8")), cipher.final()]);
  return Buffer.concat([BACKUP_MAGIC_V2, iv, ciphertext, cipher.getAuthTag()]);
}

export function decryptBackupBuffer(envelope: Buffer, secret: string) {
  const isV1 = envelope.subarray(0, BACKUP_MAGIC_V1.length).equals(BACKUP_MAGIC_V1);
  const isV2 = envelope.subarray(0, BACKUP_MAGIC_V2.length).equals(BACKUP_MAGIC_V2);
  if (!isV1 && !isV2) throw new Error("Unsupported backup envelope.");
  const magicLength = isV1 ? BACKUP_MAGIC_V1.length : BACKUP_MAGIC_V2.length;
  if (envelope.length < magicLength + BACKUP_IV_BYTES + BACKUP_TAG_BYTES + 1) {
    throw new Error("Backup envelope is truncated.");
  }
  const iv = envelope.subarray(magicLength, magicLength + BACKUP_IV_BYTES);
  const tagStart = isV1 ? magicLength + BACKUP_IV_BYTES : envelope.length - BACKUP_TAG_BYTES;
  const tag = isV1
    ? envelope.subarray(magicLength + BACKUP_IV_BYTES, magicLength + BACKUP_IV_BYTES + BACKUP_TAG_BYTES)
    : envelope.subarray(tagStart);
  const ciphertext = isV1
    ? envelope.subarray(magicLength + BACKUP_IV_BYTES + BACKUP_TAG_BYTES)
    : envelope.subarray(magicLength + BACKUP_IV_BYTES, tagStart);
  const decipher = createDecipheriv("aes-256-gcm", deriveBackupKey(secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function encryptBackupJsonStream(json: string, secret: string): ReadableStream<Uint8Array> {
  const iv = randomBytes(BACKUP_IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", deriveBackupKey(secret), iv);
  const plaintext = Buffer.from(json, "utf8");
  return new ReadableStream<Uint8Array>({
    start(controller) {
      try {
        controller.enqueue(Buffer.concat([BACKUP_MAGIC_V2, iv]));
        const chunkSize = 64 * 1024;
        for (let offset = 0; offset < plaintext.length; offset += chunkSize) {
          const encrypted = cipher.update(plaintext.subarray(offset, offset + chunkSize));
          if (encrypted.length) controller.enqueue(encrypted);
        }
        const final = cipher.final();
        if (final.length) controller.enqueue(final);
        controller.enqueue(cipher.getAuthTag());
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}
