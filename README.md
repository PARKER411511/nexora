# Nexora

Nexora is a private account workspace for freelance web designers and developers. Turn an unstructured brief into a practical scope, save it to a Supabase-backed workspace, and prepare an immutable review snapshot.

## Start locally

Run npm install, then npm run dev. The app binds to 127.0.0.1:3002. Copy .env.example to .env.local and add the publishable Supabase URL and key. Without those values Nexora fails closed and shows the setup screen; it does not fall back to SQLite or browser demo storage.

## Private workspace setup

Read SUPABASE_SETUP.md for project creation, migration, email redirects, local/Vercel variables, and RLS checks. The runtime uses only the Supabase publishable key and signed-in user JWT. Never add a service-role key to browser or server environment variables.

## Product flow

1. Create an account and confirm the email.
2. Create a project and paste a brief.
3. Analyze it with the built-in rules (or the optional server-only OpenAI adapter), then edit the scope.
4. Save and share an immutable snapshot.
5. Signed-in collaborators can leave feedback or approve. Approval locks that snapshot; later work remains separate change requests.
6. The owner can record explicit proposal price and timeline changes. Decisions are stored separately from the approved baseline.
7. Export the scope and response history as Markdown or print the review page.

## Optional analysis provider

Nexora always works with the built-in rule-based analyzer. To enable the optional server-only structured-output adapter, set OPENAI_API_KEY and optionally OPENAI_MODEL. The key is never sent to the browser. If the provider fails, the route falls back to built-in analysis.

## Current launch boundary

This repository prepares the private Supabase integration and migration. The actual migration, Auth email settings, and redirect URLs must be applied in your Supabase project before the workspace is usable. No billing or paid feature gates are implemented; pricing cards are illustrative portfolio examples and all workspace features are free.

Client review currently requires a signed-in Supabase account and a valid snapshot token. Anonymous token-only review is intentionally disabled until its access policy is explicitly approved and the corresponding narrow RPC is enabled. 23423423434234
