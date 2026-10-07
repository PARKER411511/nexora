# Nexora implementation status

This document tracks the completion suite in the repository. Hosted Supabase
migrations, environment variables, external checks, and deployment remain
owned by the release operator.

## Hosted release: 7 October 2026

The completion suite is deployed at https://nexora-one-self.vercel.app/.
The three completion/operations migrations are applied. Production Vercel
runs `npm run verify:deployment` on Node 24, and its deployment and GitHub
gate passed after isolating test environment variables.

The server credential and encryption key are configured locally and in Vercel
only. GitHub holds the encrypted-download credential, with no Supabase or
decryption key. Hourly review reminders, daily private snapshots, daily
encrypted artifacts, and hourly uptime checks are active. Initial snapshot,
uptime, and encrypted-artifact runs passed. The downloaded artifact's SHA-256,
AES-GCM authentication, and 24-table schema were verified locally in memory.
No plaintext account-data file was produced.

## Implemented in source

- Personal and optional team workspaces with owner/admin/editor/viewer roles.
- Workspace invitations as persistent, copyable links with explicit
  `undelivered` status. SMTP is intentionally not configured.
- Project archive/restore, duplicate, delete confirmation, tags, deadlines,
  immutable versions, side-by-side version comparison, and JSON/PDF export.
- Review snapshots, threaded comment identity fields, proposal history, and
  in-app notifications.
- Database rate limits with fixed operation buckets and direct-RPC guards.
- Account suspension state, audit records, support requests, and client error
  capture.
- Attachment registration and private storage policies. Deletion uses a
  tombstone until the storage object removal succeeds.
- Optional TOTP MFA: AAL1 remains available for accounts without a verified
  factor; enrolled accounts require AAL2. Sensitive operations require a
  fresh 15-minute password AMR for unenrolled users, fresh TOTP AMR at AAL2
  for enrolled users, and fresh TOTP at AAL2 for administrators.
- Profile-photo registration with exact object-key binding and signed avatar
  display in the profile screen.
- Usable team screen with member role changes, removal, ownership transfer,
  persistent copyable invite links, invite acceptance, and explicit
  undelivered status.
- Brief and scope template pickers plus save-as-template controls in the
  new-project and project-editor flows. Applying a scope template marks the
  project draft dirty and requires an explicit project save.
- Review sharing panel with signed-in/invited-only modes, reviewer invite
  status/due date/revoke controls, approved-snapshot link revoke, threaded
  replies, bounded authorized mentions, and canonical signed-in identity.
- First-login onboarding, workspace/team navigation, notification links,
  pending decision/activity cards, friendly retry/error states, and save
  safeguards in the project editor.
- Admin customer/project detail routes, server-side search/sort/pagination,
  suspension/reactivation safeguards, support queue status controls, audit
  actor/target/payload display, role permission guidance, and service health.
- Profile security controls for email change and verification resend cooldown,
  standalone fresh-password reauthentication, password change with a fresh
  TOTP challenge for enrolled accounts, TOTP enrollment, global sign-out, JSON
  export, and a confirmed deletion request. The deletion worker claims and
  preserves retry state, runs an exact service-role Storage manifest check,
  removes personal objects, transfers team ownership idempotently, revokes
  accepted review invites, de-identifies invitation provenance, and treats
  successful Auth admin deletion as completion. Without the server-only
  `SUPABASE_SECRET_KEY`, the request remains visibly pending.

- Account deletion has serialized platform/legacy-admin claim guards, team-owner
  preflight checks, service-role-only Storage RPCs, and focused worker tests
  for orphan detection, cleanup/Auth failure, retry, completion, and ownership
  transfer paths.

- Operations export is service-role-only and fails closed for anonymous or
  authenticated callers. The backup route uses the server admin client; the
  GitHub artifact contains ciphertext and a checksum only.

## In progress / needs verification

- Hosted configuration is active. Provider-side account deletion has not
  been tested destructively against real accounts. The local smoke suite exercises fresh/stale MFA,
  serialized deletion claims, exact Storage ownership branches, nullable
  legacy metadata, and manifest orphan rejection; no hosted destructive test
  is run here.
- Signed-in owner/client/ordinary/admin persona checks remain a hosted release
  item. Public, signed-out, and auth-route mobile/redirect checks are complete.
- PDF rendering and text extraction are complete locally: the root release
  check passed a two-page PDF with searchable accents, wrapped text, and
  correct headers/footers without stranded headings.

## Requested product checklist

- **Profile/account:** profile photo API/UI, verified-email resend through
  Supabase with client cooldown messaging, password reset/change, global
  sign-out, TOTP enrollment/challenge, JSON account export, and a guarded
  deletion flow. Final Auth deletion runs only when the server-only
  `SUPABASE_SECRET_KEY` worker credential is present; otherwise the API returns
  an explicit pending status.
- **Projects:** archive/restore/delete confirmation/duplicate, brief and scope
  fields, tags/deadlines, version comparison, JSON/Markdown/PDF exports, and
  save error handling are present. Template RPCs and both template picker/save
  flows are wired; hosted persona verification remains.
- **Collaboration:** copyable workspace invites, role RPCs, review links,
  notification read/unread state, due-date fields, and snapshot revocation are
  present. Threaded replies, bounded authorized mentions, canonical reviewer
  identity, invitation response/revoke states, approved-snapshot revocation,
  and invited-only reviewer gating are wired. Hosted persona verification
  remains.
- **Workspace navigation:** workspace selector, notifications, profile/security
  navigation, empty states, and onboarding walkthrough are present. Recent
  activity and pending-decision cards need a hosted persona check.
- **Admin/support:** existing overview plus customer search/pagination/detail,
  suspension/reactivation safeguards, service health/error summaries, support
  creation/status queue, audit records, and role checks are present in
  APIs/RPCs/UI. Hosted admin persona verification remains.
- **Operations:** predeployment GitHub gate and hourly health workflow are
  present. AES-256-GCM encryption, decryption, schema validation, and isolated
  restore scripts pass locally. The daily ciphertext artifact workflow is active and its first run passed.
- **Quality:** `npm test`, `npm run test:supabase`, `npm run test:backup`,
  `npm run typecheck`, and `npm run build` pass locally. `npm run
  verify:deployment` passed locally, in GitHub, and in Vercel. Mobile, keyboard,
  screen-reader, performance, and hosted owner/client/ordinary/admin persona
  checks remain release verification tasks.

## Release configuration and remaining verification

- Apply migrations in order:
  `20261005_private_workspace.sql`, `20261005_accounts_admin.sql`,
  `20261005_complete_suite.sql`, `20261005_security_completion.sql`, and
  `20261006_operations.sql`.
- Confirm Supabase Auth TOTP settings and verify an AAL2 challenge with a
  hosted test persona before enabling sensitive operations.
- Configure the private storage buckets/policies through the migrations and
  verify provider upload metadata (`mimetype`, `contentLength`).
- Configure the Vercel build command as `npm run verify:deployment` and Node
  24.x after the clean-checkout gate passes. GitHub workflow actions are pinned
  to reviewed release SHAs.
- SMTP and Turnstile are explicitly excluded for this release. No email is
  sent by Nexora; invitation and review delivery status remains undelivered.
- `SUPABASE_SECRET_KEY` is the optional server-only credential for the Auth
  deletion worker. It belongs in Vercel server environment settings only and
  must never be prefixed with `NEXT_PUBLIC_`, placed in browser code, or
  committed to the repository.
- Managed database backups, storage asset backups, isolated restore tests,
  and external uptime checks require the release operator's Supabase/Vercel/
  GitHub credentials and must be tested before claiming disaster recovery.



## Account design and workspace UI follow-up

- Sign-in, sign-up, recovery, reset, and MFA share a responsive Nexora auth
  composition with red artwork, clearer form hierarchy, focus states, and
  accessible feedback. Authentication behavior remains unchanged.
- The project editor exposes PDF export, private attachments, and review
  comments, replies, and authorized mentions. Profile settings expose account
  data export and a private support request form.
- Workspace selection is synchronized across the header, project library,
  overview, and new brief. Stored history summaries stay scoped to the selected
  workspace. First-user personal-workspace conflicts receive one bounded retry
  in both bootstrap and project creation.
- The deployment gate passes with 35 tests, migration smoke, logical backup and
  restore checks, TypeScript, and a production build. Independent review found no
  material blockers in the new attachment access or workspace concurrency paths.
- Hosted ordinary-account creation, saving after reload, navigation, and review
  snapshot creation passed before the browser test runtime became unavailable.
  Fresh auth screenshots, mobile/keyboard checks of this follow-up, and hosted
  admin/client persona checks remain unverified. No account credentials, grants,
  or existing user projects were changed during these checks.
