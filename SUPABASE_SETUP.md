# Supabase setup

## 1. Create the project

Create a Supabase project, copy its Project URL (`https://otvaswuedpltjuriurer.supabase.co` for the currently prepared project) and publishable key, and put them in `.env.local` as `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. The same two values are safe to expose to the browser. Do not add a service-role key.

## 2. Apply the schema

Run `supabase/migrations/20261005_private_workspace.sql` in the Supabase SQL editor, or use `supabase db push` after linking the project with the Supabase CLI. The migration creates owner-scoped tables, RLS policies, and narrow transactional RPCs for project mutations, snapshots, history, and authenticated review.

The repository has no Docker, PostgreSQL, or Supabase CLI available in this environment. `npm run test:supabase` does execute this migration in isolated PGlite and checks owner isolation, authenticated token review, anonymous denial, malformed payload rejection, approval locking, and proposal decisions. Hosted Supabase Auth claims, network behavior, and true concurrent transactions still need verification after activation.

## 3. Configure Auth

In Authentication → URL Configuration, set the Site URL to `http://127.0.0.1:3002` for local work and add these redirect URLs:

- `http://127.0.0.1:3002/auth/callback`
- `http://localhost:3002/auth/callback`
- `https://YOUR-DOMAIN/auth/callback`

For Vercel, set the same publishable variables plus `NEXT_PUBLIC_SITE_URL` and `APP_ORIGIN` to the exact production origin (for example `https://nexora-one-self.vercel.app`), and add that origin’s `/auth/callback` to Supabase Auth. Do not trust a preview origin in production unless it is explicitly added.

Use the same callback path in the email confirmation and password recovery templates. The app validates `next` as a same-site path before redirecting.

The default Supabase SMTP sender is intended for project-team addresses and is rate-limited. Configure a verified custom SMTP provider before inviting general users to sign up or recover passwords.

## 4. Run

Start with `npm run dev`, open `/auth/sign-up`, confirm the email, and create a project. Missing configuration intentionally shows a setup screen and returns JSON 503 from APIs. The runtime does not fall back to SQLite or browser demo storage.

## 5. Review access boundary

Client review is currently authenticated-only: a reviewer needs a Supabase account plus a valid snapshot token. The review RPCs are granted only to `authenticated`; no `anon` table grants or token-only RPCs are present. Do not enable anonymous review until its threat model and rate limits are approved, then add a narrow capability RPC that never exposes owner project queries.

## 6. Isolation checks before activation

Create two accounts and verify each sees only its own projects. Confirm a user cannot call owner RPCs with another project UUID, that updating an approved project fails, and that sharing revokes prior unapproved snapshots. Verify that a stale token cannot approve a newer snapshot, repeated approval returns the same approved review, and proposal decisions are idempotent while conflicting decisions fail.
