# Nexora

Nexora is a local brief-to-scope workspace for freelance web designers and developers. Turn an unstructured brief into a practical scope, send an immutable snapshot to a client for review, and capture feedback or approval in one place.

## Start locally

```bash
npm install
npm run dev
```

Open [http://localhost:3002](http://localhost:3002). The development server is deliberately bound to port `3002`.

The app creates `.data/nexora.db` on first use using Node 22's built-in SQLite driver. The database is local and single-owner; `.data` is ignored by git. The review URL is designed for local collaboration and is not public hosting. For deployment, provide durable shared storage and authentication before exposing it outside localhost.

## Optional analysis provider

Nexora always works with its built-in rule-based analyzer, labelled `Built-in analysis / local`. To enable the optional server-only OpenAI structured-output adapter, copy `.env.example` to `.env.local`, set `OPENAI_API_KEY`, and optionally set `OPENAI_MODEL`. The key is only read in the server route and never sent to the browser. If the provider is unavailable or times out, the route falls back to local analysis and tells the user which mode produced the result.

## Product flow

1. Create a project and paste a brief.
2. Analyze it locally (or with the optional server adapter).
3. Edit deliverables, included and excluded work, milestones, and revision rounds.
4. Save the scope and share a random, unguessable review token.
5. The client can leave feedback or approve. Approval locks the project scope; later notes remain independent change requests.

Markdown export is available from an editor's `Export markdown` action. The review page also has a print action for browser `Save as PDF`.
