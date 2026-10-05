import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

async function main() {
  const migration = await readFile(
    new URL(
      "../supabase/migrations/20261005_private_workspace.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const db = new PGlite("memory://nexora-supabase-smoke", {
    extensions: { pgcrypto },
  });
  try {
    await db.exec(
      "create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); insert into auth.users values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002'),('00000000-0000-0000-0000-000000000003'); create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;",
    );
    await db.exec(migration);
    const tables = await db.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema='public' and table_name in ('projects','review_snapshots','review_comments','change_requests','change_proposals') order by table_name",
    );
    if (tables.rows.length !== 5)
      throw new Error(`Expected five Nexora tables, got ${tables.rows.length}`);
    const rpc = await db.query<{ proname: string }>(
      "select proname from pg_proc where proname in ('nexora_create_project','nexora_update_project','nexora_share_project','nexora_project_history','nexora_get_review','nexora_review_action')",
    );
    if (rpc.rows.length !== 6)
      throw new Error(`Expected six Nexora RPCs, got ${rpc.rows.length}`);
    const analysis = {
      mode: "local",
      summary: "A clear website brief summary.",
      audience: "Local customers",
      goals: ["Explain the offer"],
      pages: ["Home"],
      needs: ["Booking"],
      risks: ["Late content"],
      questions: ["Who approves content?"],
    };
    const scope = {
      deliverables: ["Website"],
      included: ["Home page"],
      excluded: ["Branding"],
      milestones: [
        { name: "Plan", detail: "Confirm structure", timing: "Week 1" },
      ],
      revisions: 2,
    };
    await db.exec(
      "set role authenticated; set session request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';",
    );
    let malformedDenied = false;
    try {
      await db.query("select public.nexora_create_project($1::jsonb)", [
        JSON.stringify({
          title: "Bad",
          client: "Client",
          brief: "This is a sufficiently long project brief for smoke testing.",
          analysis: {},
          scope: {},
        }),
      ]);
    } catch {
      malformedDenied = true;
    }
    if (!malformedDenied)
      throw new Error("Malformed project JSON was accepted by the RPC");
    const malformedCases = [
      { ...analysis, goals: undefined },
      { ...analysis, goals: ["   "] },
    ];
    for (const malformedAnalysis of malformedCases) {
      const candidate = {
        title: "Bad",
        client: "Client",
        brief: "This is a sufficiently long project brief for smoke testing.",
        analysis: malformedAnalysis,
        scope,
      };
      let rejected = false;
      try {
        await db.query("select public.nexora_create_project($1::jsonb)", [
          JSON.stringify(candidate),
        ]);
      } catch {
        rejected = true;
      }
      if (!rejected)
        throw new Error("Malformed analysis member was accepted by the RPC");
    }
    const stringRevisions = { ...scope, revisions: "2" };
    let revisionsRejected = false;
    try {
      await db.query("select public.nexora_create_project($1::jsonb)", [
        JSON.stringify({
          title: "Bad",
          client: "Client",
          brief: "This is a sufficiently long project brief for smoke testing.",
          analysis,
          scope: stringRevisions,
        }),
      ]);
    } catch {
      revisionsRejected = true;
    }
    if (!revisionsRejected)
      throw new Error("String revisions was accepted by the RPC");
    const created = await db.query<{ project: unknown }>(
      "select public.nexora_create_project($1::jsonb) as project",
      [
        JSON.stringify({
          title: "Owner one",
          client: "Client",
          brief: "This is a sufficiently long project brief for smoke testing.",
          analysis,
          scope,
        }),
      ],
    );
    const project = created.rows[0].project as { id: string };
    const shared = await db.query<{ project: { reviewToken: string } }>(
      "select public.nexora_share_project($1::uuid) as project",
      [project.id],
    );
    const token = shared.rows[0].project.reviewToken;
    await db.exec(
      "set session request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';",
    );
    const review = await db.query<{ review: { id: string } }>(
      "select public.nexora_get_review($1) as review",
      [token],
    );
    if (review.rows[0].review.id !== project.id)
      throw new Error("Reviewer could not read the token-scoped snapshot");
    await db.exec(
      "set session request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';",
    );
    const otherOwner = await db.query<{ count: string }>(
      "select count(*)::text as count from public.projects",
    );
    if (otherOwner.rows[0].count !== "0")
      throw new Error("RLS leaked projects across owners");
    await db.exec("set role anon");
    let anonymousDenied = false;
    try {
      await db.query("select public.nexora_get_review($1)", [token]);
    } catch {
      anonymousDenied = true;
    }
    if (!anonymousDenied)
      throw new Error("Anonymous review access was not denied");
    await db.exec(
      "set role authenticated; set session request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';",
    );
    const approvedReview = await db.query<{ review: any }>(
      "select public.nexora_review_action($1,$2::jsonb) as review",
      [
        token,
        JSON.stringify({
          action: "approval",
          name: "Reviewer",
          comment: "Approved.",
        }),
      ],
    );
    if (
      approvedReview.rows[0].review.approval?.name !== "Reviewer" ||
      approvedReview.rows[0].review.scope.deliverables[0] !== "Website"
    )
      throw new Error(
        "Approved review did not preserve approval metadata or scope",
      );
    await db.exec(
      "set session request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';",
    );
    const locked = await db.query<{ status: string }>(
      "select status from public.projects where id=$1",
      [project.id],
    );
    if (locked.rows[0].status !== "approved")
      throw new Error("Approval did not lock the project");
    let rejected = false;
    try {
      await db.query(
        "select public.nexora_update_project($1::uuid,$2::jsonb)",
        [
          project.id,
          JSON.stringify({
            title: "Changed",
            client: "Client",
            brief:
              "This is a sufficiently long project brief for smoke testing.",
            analysis,
            scope,
          }),
        ],
      );
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error("Approved project update was not rejected");
    await db.exec(
      "set session request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';",
    );
    const requested = await db.query<{ review: any }>(
      "select public.nexora_review_action($1,$2::jsonb) as review",
      [
        token,
        JSON.stringify({
          action: "change_request",
          name: "Reviewer",
          title: "Add booking section",
          details: "Please add a booking section.",
        }),
      ],
    );
    const requestId = requested.rows[0].review.changeRequests[0].id as string;
    await db.exec(
      "set session request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';",
    );
    const proposalInput = {
      requestId,
      title: "Booking section",
      details: "Add a booking section.",
      affectedDeliverables: ["Website"],
      priceAdjustment: 250,
      currency: "USD",
      timelineImpact: "Two days",
      rationale: "This is outside the approved baseline.",
    };
    for (const omittedKey of ["priceAdjustment", "currency"]) {
      const malformedProposal = { ...proposalInput } as Record<string, unknown>;
      delete malformedProposal[omittedKey];
      let malformedProposalDenied = false;
      try {
        await db.query(
          "select public.nexora_create_change_proposal($1::uuid,$2::jsonb)",
          [project.id, JSON.stringify(malformedProposal)],
        );
      } catch {
        malformedProposalDenied = true;
      }
      if (!malformedProposalDenied)
        throw new Error(`Proposal missing ${omittedKey} was accepted by the RPC`);
    }
    const proposal = await db.query<{ history: any }>(
      "select public.nexora_create_change_proposal($1::uuid,$2::jsonb) as history",
      [
        project.id,
        JSON.stringify(proposalInput),
      ],
    );
    const proposalId = proposal.rows[0].history.changeRequests[0].proposals[0]
      .id as string;
    await db.exec(
      "set session request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';",
    );
    await db.query("select public.nexora_review_action($1,$2::jsonb)", [
      token,
      JSON.stringify({
        action: "proposal_decision",
        proposalId,
        decision: "accepted",
        name: "Reviewer",
        comment: "Approved change.",
      }),
    ]);
    await db.query("select public.nexora_review_action($1,$2::jsonb)", [
      token,
      JSON.stringify({
        action: "proposal_decision",
        proposalId,
        decision: "accepted",
        name: "Reviewer",
        comment: "Repeated decision.",
      }),
    ]);
    let conflictingDenied = false;
    try {
      await db.query("select public.nexora_review_action($1,$2::jsonb)", [
        token,
        JSON.stringify({
          action: "proposal_decision",
          proposalId,
          decision: "declined",
          name: "Reviewer",
          comment: "Conflict.",
        }),
      ]);
    } catch {
      conflictingDenied = true;
    }
    if (!conflictingDenied)
      throw new Error("Conflicting proposal decision was accepted");
    console.log(
      "Supabase migration smoke passed: five tables and six RPCs created.",
    );
  } finally {
    await db.close();
  }
}
void main();
