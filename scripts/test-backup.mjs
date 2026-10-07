import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const directory = await mkdtemp(join(tmpdir(), "nexora-backup-"));
const fixture = join(directory, "fixture.json");
const encrypted = join(directory, "backup.nexora-backup");
const restored = join(directory, "restored.json");
const tampered = join(directory, "tampered.nexora-backup");
const key = "local-isolated-encryption-key-with-more-than-32-bytes";
const wrongKey = "wrong-isolated-encryption-key-with-more-than-32-bytes";

function run(args, env = {}, inherit = true) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { env: { ...process.env, BACKUP_ENCRYPTION_KEY: key, ...env }, stdio: inherit ? "inherit" : "pipe" });
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

try {
  const fixtureCode = await run(["node_modules/tsx/dist/cli.mjs", "scripts/ops-restore-fixture.ts", fixture]);
  if (fixtureCode !== 0) throw new Error(`PGlite fixture exited ${fixtureCode}`);
  const plaintext = await readFile(fixture);
  await writeFile(join(directory, "input.json"), plaintext, { mode: 0o600 });
  if ((await run(["scripts/encrypt-backup.mjs", join(directory, "input.json"), encrypted])) !== 0) throw new Error("Encryption failed.");
  const ciphertext = await readFile(encrypted);
  if (ciphertext.includes("nexora-application-v2")) throw new Error("Ciphertext contains plaintext schema data.");
  if ((await run(["scripts/restore-backup.mjs", encrypted, restored])) !== 0) throw new Error("Restore failed.");
  const expected = JSON.parse(plaintext.toString("utf8"));
  const restoredValue = JSON.parse(await readFile(restored, "utf8"));
  if (JSON.stringify(restoredValue) !== JSON.stringify(expected)) throw new Error("Round-trip payload mismatch.");
  if ((await run(["scripts/restore-backup.mjs", encrypted, join(directory, "wrong.json")], { BACKUP_ENCRYPTION_KEY: wrongKey }, false)) === 0) throw new Error("Wrong-key restore unexpectedly succeeded.");
  const tamperedBytes = Buffer.from(ciphertext);
  tamperedBytes[tamperedBytes.length - 1] ^= 0x01;
  await writeFile(tampered, tamperedBytes, { mode: 0o600 });
  if ((await run(["scripts/restore-backup.mjs", tampered, join(directory, "tampered.json")], {}, false)) === 0) throw new Error("Tampered restore unexpectedly succeeded.");
  console.log("Encrypted v2 backup round-trip, PGlite logical restore, wrong-key, and tamper checks passed.");
} finally {
  await rm(directory, { recursive: true, force: true });
}
