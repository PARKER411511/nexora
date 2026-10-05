# Supabase setup

## 1. Create the project

Create a Supabase project, copy its Project URL (`https://otvaswuedpltjuriurer.supabase.co` for the currently prepared project) and publishable key, and put them in `.env.local` as `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. The same two values are safe to expose to the browser. Do not add a service-role key.

## 2. Apply the schema

Run `supabase/migrations/20261005_private_workspace.sql` followed by `supabase/migrations/20261005_accounts_admin.sql` in the Supabase SQL editor, or use `supabase db push` after linking the project with the Supabase CLI. The migrations create owner-scoped workspace tables, the self-only profile table, a private database-maintained admin allowlist, and narrow RPCs for project mutations, account profiles, admin summaries, snapshots, history, and authenticated review.

The repository has no Docker, PostgreSQL, or Supabase CLI available in this environment. `npm run test:supabase` executes both migrations in isolated PGlite and checks owner isolation, profile isolation, admin allowlist authorization, authenticated token review, anonymous denial, malformed payload rejection, approval locking, and proposal decisions. Hosted Supabase Auth claims, network behavior, and true concurrent transactions still need verification after activation.

### Bootstrap the first admin

After the account has been created and its email confirmed, run this reviewed SQL once in the hosted SQL editor. It grants no role based on email matching at runtime and does not expose the allowlist to clients:

```sql
insert into private.nexora_admins (user_id)
select id from auth.users where lower(email) = lower('nihalstar1000@gmail.com')
on conflict (user_id) do nothing;
```

Verify the result in the SQL editor before opening `/admin`. Future administrators should use the same explicit, reviewed process with the intended confirmed email; never add a signup metadata field or client route that can self-grant access.

## 3. Configure Auth

In Authentication → URL Configuration, set the Site URL to the deployed origin `https://nexora-one-self.vercel.app` and add these redirect URLs:

- `http://127.0.0.1:3002/auth/callback`
- `http://localhost:3002/auth/callback`
- `https://nexora-one-self.vercel.app/auth/callback`

For Vercel, set the same publishable variables plus `APP_ORIGIN=https://nexora-one-self.vercel.app`. The app uses this exact origin for mutation checks; do not trust a preview origin in production unless it is explicitly added.

Use the same callback path in the email confirmation and password recovery templates. The app validates `next` as a same-site path before redirecting.

The default Supabase SMTP sender is intended for project-team addresses and is rate-limited. This project does not send email itself. Configure a verified custom SMTP provider before inviting general users to sign up or recover passwords; until then, signup confirmation and password recovery may be delayed or unavailable.

## 4. Run

Start with `npm run dev`, open `/auth/sign-up`, confirm the email, and create a project. Missing configuration intentionally shows a setup screen and returns JSON 503 from APIs. The runtime does not fall back to SQLite or browser demo storage.

## 5. Review access boundary

Client review is currently authenticated-only: a reviewer needs a Supabase account plus a valid snapshot token. The review RPCs are granted only to `authenticated`; no `anon` table grants or token-only RPCs are present. Do not enable anonymous review until its threat model and rate limits are approved, then add a narrow capability RPC that never exposes owner project queries.

## 6. Isolation checks before activation

Create two accounts and verify each sees only its own projects. Confirm a user cannot call owner RPCs with another project UUID, that updating an approved project fails, and that sharing revokes prior unapproved snapshots. Verify that a stale token cannot approve a newer snapshot, repeated approval returns the same approved review, and proposal decisions are idempotent while conflicting decisions fail.
