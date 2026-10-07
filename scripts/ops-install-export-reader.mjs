import { createHash } from "node:crypto";

const secret = process.env.BACKUP_EXPORT_SECRET;
if (!secret) throw new Error("BACKUP_EXPORT_SECRET is required.");
if (Buffer.byteLength(secret, "utf8") < 32 || /^(.)\1+$/.test(secret)) throw new Error("BACKUP_EXPORT_SECRET must be a high-entropy secret of at least 32 UTF-8 bytes.");
const hash = createHash("sha256").update(secret, "utf8").digest("hex");
console.log(`-- Apply this generated statement manually in the Supabase SQL editor after review. Do not commit it.\nbegin;\ninsert into private.operations_export_secrets(id, secret_hash) values (true, '${hash}') on conflict (id) do update set secret_hash=excluded.secret_hash, rotated_at=now();\ncommit;`);
