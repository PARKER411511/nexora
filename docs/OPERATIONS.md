# Nexora operations runbook

This runbook covers the application-level disaster-recovery controls. It does
not replace Supabase's managed database backup, Supabase Auth export, or a
provider backup of Storage object bytes.

## Logical backup contract

`GET /api/ops/backup?limit=5000` returns an AES-256-GCM ciphertext stream. It
requires an exact `Authorization: Bearer …` header. The endpoint checks the
server-only `BACKUP_EXPORT_SECRET`, hashes that secret before calling the
narrow `nexora_ops_export` RPC, and encrypts the returned v2 logical document
with the server-only `BACKUP_ENCRYPTION_KEY`.

The RPC has an explicit table allowlist covering profiles, projects, review
history, workspaces, versions, templates, invitations, notifications,
attachments metadata, support, private audit/error/rate-limit state, admin
allowlist metadata, and account-deletion metadata. Each table is capped by the
`limit` query parameter (1–10,000; default 5,000). The response also includes
an explicit metadata-only Storage manifest. It never includes object bytes or
presigned URLs. The exporter counts every allowlisted table and fails closed if
any table or the Storage manifest exceeds the selected bound, so an artifact is
never silently partial.

Use high-entropy values of at least 32 UTF-8 bytes for both secrets. Keep
`BACKUP_EXPORT_SECRET` in local development, Vercel runtime configuration, and
GitHub Actions secrets. Keep `BACKUP_ENCRYPTION_KEY` and the server-only
`SUPABASE_SECRET_KEY` in local development and Vercel runtime configuration
only. `SUPABASE_SECRET_KEY` is required for the service-role export RPC and
must never be placed in GitHub. The GitHub workflow receives ciphertext and the
bearer secret; it never receives the encryption key or the Supabase service key.

The public repository must contain no secret, generated hash, plaintext backup,
or decrypted artifact. The workflow uploads only the encrypted file and its
checksum. A failed health check or backup request fails the workflow, which
uses GitHub's normal failure notification path for uptime/error alerting.

## Install the private export reader

Apply `supabase/migrations/20261006_operations.sql` after the existing four
20261005 migrations. The migration creates the private export-secret table but
does not generate or persist a credential.

After a deliberate operator review, set `BACKUP_EXPORT_SECRET` locally and run:

```text
node scripts/ops-install-export-reader.mjs > /path/to/private-reader.sql
```

Review the generated hash statement, apply it in the Supabase SQL editor as a
database owner, then securely delete the temporary file. Never commit it. The
script performs no network call and does not activate the reader by itself.

## Encryption and local restore

Encrypt a validated JSON document locally:

```text
BACKUP_ENCRYPTION_KEY="…" node scripts/encrypt-backup.mjs input.json backup.nexora-backup
BACKUP_ENCRYPTION_KEY="…" node scripts/restore-backup.mjs backup.nexora-backup restored.json
```

The v2 envelope places the tag at the end so the API can stream ciphertext.
The restore script authenticates the whole envelope, validates the exact
schema/table allowlist, and writes a local JSON document with mode `0600`.
Wrong-key and tamper failures are intentional hard errors.

`src/lib/ops/restore.ts` is the isolated logical importer. It requires
`targetKind: "isolated"`, an explicit source-auth-ID to target-auth-ID map,
and an empty target application schema. It never deletes rows and refuses a
non-isolated or existing target. Auth users, passwords, sessions, MFA factors,
and provider-owned Storage bytes are not part of this importer; provision
target Auth identities separately and map their IDs before restore. The
importer preserves application primary keys and identity values with explicit
`OVERRIDING SYSTEM VALUE` inserts, then verifies row counts.

Run the meaningful local fixture, round-trip, wrong-key, and tamper checks with:

```text
npm run test:backup
```

The fixture uses PGlite with the existing application migrations plus the
operations migration, seeds related non-empty records, restores into a fresh
isolated target, and verifies counts and relationships. It does not query a
hosted project or install any job. A passing fixture proves the encrypted
logical application export/import path only; it does not back up or restore
Supabase Auth identities, MFA/session state, or Storage object bytes.

## Reviewed pg_cron installer

`supabase/operations/install-pg-cron.sql` is a separate, manually reviewed
installer. It schedules:

- hourly in-app due-review reminder insertion with duplicate suppression;
- daily private logical snapshots with a 5,000-row per-table cap and 14-row
  retention.

The daily snapshots are private database records and are not a substitute for
the encrypted GitHub artifact. Run the installer only as the database owner,
then inspect `cron.job` and `private.operations_snapshots`. No SMTP, email,
Turnstile, payments, Auth deletion worker, physical database restore, or
Storage-object deletion is included.
