import { readFile, writeFile } from "node:fs/promises";
import { decryptBuffer } from "./ops-crypto.mjs";
import { validateBackupDocument } from "./ops-format.mjs";

const [, , input, output] = process.argv;
if (!input || !output) throw new Error("Usage: node scripts/restore-backup.mjs backup.nexora-backup restored.json");
const secret = process.env.BACKUP_ENCRYPTION_KEY;
if (!secret) throw new Error("BACKUP_ENCRYPTION_KEY is required.");
const envelope = await readFile(input);
const plaintext = decryptBuffer(envelope, secret);
const parsed = validateBackupDocument(JSON.parse(plaintext.toString("utf8")));
await writeFile(output, `${JSON.stringify(parsed, null, 2)}\n`, { mode: 0o600 });
