import { readFile, writeFile } from "node:fs/promises";
import { encryptBuffer } from "./ops-crypto.mjs";

const [, , input, output] = process.argv;
if (!input || !output) throw new Error("Usage: node scripts/encrypt-backup.mjs input.json output.nexora-backup");
const secret = process.env.BACKUP_ENCRYPTION_KEY;
if (!secret) throw new Error("BACKUP_ENCRYPTION_KEY is required.");
const plaintext = await readFile(input);
const envelope = encryptBuffer(plaintext, secret);
await writeFile(output, envelope, { mode: 0o600 });
