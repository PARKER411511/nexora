# Nexora

Nexora is a local brief-to-scope workspace for freelance web designers and developers. Turn an unstructured brief into a practical scope, send an immutable snapshot to a client for review, and capture feedback or approval in one place.

## Start locally

```bash
npm install
npm run dev
```

Open [http://localhost:3002](http://localhost:3002). The development server is deliberately bound to port `3002`.

The app creates `.data/nexora.db` on first use using Node 22's built-in SQLite driver. The database is local and single-owner; `.data` is ignored by git. The review URL is designed for local collaboration and is not public hosting. For deployment, provide durable shared storage and authentication before exposing it outside localhost.

Mutating browser requests require an Origin matching `http://localhost:3002` or `http://127.0.0.1:3002`. Set `APP_ORIGIN` in `.env.local` when the app is served from another exact origin. This protects a local optional AI key from cross-site browser posts; direct scripts should use the application through a browser origin.

## Browser demo mode

For a portfolio deployment without accounts or a hosted database, set `NEXORA_MODE=demo` in `.env.local` before starting Next.js. The demo keeps projects, review snapshots, feedback, approvals, change requests, and proposal decisions in that visitor’s browser `localStorage`; a copied review URL only works in the same browser profile and device. It never sends demo briefs to OpenAI, and it does not provide public shared storage or account isolation.

Vercel builds default to demo mode when `NEXORA_MODE` is unset. Set `NEXORA_MODE=local` when running the SQLite workflow in a server environment that has Node 22 and durable filesystem storage. The demo is the right mode for the public portfolio preview; the local mode is the complete single-owner workspace for private use.

## Optional analysis provider

Nexora always works with its built-in rule-based analyzer, labelled `Built-in analysis / local`. To enable the optional server-only OpenAI structured-output adapter, copy `.env.example` to `.env.local`, set `OPENAI_API_KEY`, and optionally set `OPENAI_MODEL`. The key is only read in the server route and never sent to the browser. If the provider is unavailable or times out, the route falls back to local analysis and tells the user which mode produced the result.

## Product flow

1. Create a project and paste a brief.
2. Analyze it locally (or with the optional server adapter).
3. Edit deliverables, included and excluded work, milestones, and revision rounds.
4. Save the scope and share a random, unguessable review token.
5. The client can leave feedback or approve. Approval locks the project scope; later notes remain independent change requests.
6. From the approved review page, the client can submit one or more change requests. The owner records a proposal with an explicit price adjustment, currency, affected deliverables, rationale, and timeline impact. The client can accept or decline each sent proposal; the approved baseline remains unchanged.

The owner editor's `Responses & changes` tab keeps feedback from current and superseded snapshots, approvals, requests, proposal versions, and client decisions. Sent proposals are immutable; a declined request can receive a new version. Export includes this history alongside the approved scope.

Markdown export is available from an editor's `Export markdown` action. The review page also has a print action for browser `Save as PDF`.

## Launch checklist

This build is complete for a local single-owner workflow. A public launch still needs a hosting target, durable shared storage, authentication and authorization, HTTPS, and an operational email or notification path. No public account, billing, or deployment provider is configured here.
