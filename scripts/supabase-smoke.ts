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
  const accountsMigration = await readFile(
    new URL(
      "../supabase/migrations/20261005_accounts_admin.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const completeMigration = await readFile(
    new URL(
      "../supabase/migrations/20261005_complete_suite.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const securityMigration = await readFile(
    new URL(
      "../supabase/migrations/20261005_security_completion.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const db = new PGlite("memory://nexora-supabase-smoke", {
    extensions: { pgcrypto },
  });
  try {
    await db.exec(
      "create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, confirmed_at timestamptz, last_sign_in_at timestamptz, created_at timestamptz not null default now(), raw_user_meta_data jsonb not null default '{}'::jsonb); create table auth.sessions(id uuid primary key,user_id uuid not null); insert into auth.users(id,email,email_confirmed_at,confirmed_at,created_at) values ('00000000-0000-0000-0000-000000000001','one@example.com','2026-10-01T00:00:00Z','2026-10-01T00:00:00Z','2026-10-01T00:00:00Z'),('00000000-0000-0000-0000-000000000002','two@example.com','2026-10-02T00:00:00Z','2026-10-02T00:00:00Z','2026-10-02T00:00:00Z'),('00000000-0000-0000-0000-000000000003','three@example.com',null,null,'2026-10-03T00:00:00Z'); insert into auth.sessions(id,user_id) values ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001'),('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002'),('10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000003'); create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;",
    );
    await db.exec(migration);
    await db.exec(accountsMigration);
    await db.exec(completeMigration);
    await db.exec(securityMigration);
    await db.exec("set role postgres;");
    const reapplyReviewPrivileges = await db.query<{ legacy: boolean; wrapper: boolean }>("select has_function_privilege('authenticated','public.nexora_get_review_legacy(text)','execute') as legacy, has_function_privilege('authenticated','public.nexora_get_review(text)','execute') as wrapper");
    if (reapplyReviewPrivileges.rows[0].legacy || !reapplyReviewPrivileges.rows[0].wrapper) throw new Error("Review privilege boundary changed after migration reapply");
    await db.exec("set role authenticated;");
    await db.exec("set role postgres;");
    const reviewPrivileges = await db.query<{ legacy: boolean; wrapper: boolean }>("select has_function_privilege('authenticated','public.nexora_get_review_legacy(text)','execute') as legacy, has_function_privilege('authenticated','public.nexora_get_review(text)','execute') as wrapper");
    if (reviewPrivileges.rows[0].legacy || !reviewPrivileges.rows[0].wrapper) throw new Error("Review legacy RPC privilege boundary is incorrect");
    await db.exec("set role authenticated;");
    // A second application verifies the forward migration is idempotent under
    // the same privileged migration role used by the hosted deploy runner.
    await db.exec("set role postgres;");
    await db.exec(completeMigration);
    await db.exec(securityMigration);
    await db.exec("set role authenticated;");
    await db.exec("set role postgres;");
    const tables = await db.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema='public' and table_name in ('projects','review_snapshots','review_comments','change_requests','change_proposals','profiles') order by table_name",
    );
    if (tables.rows.length !== 6)
      throw new Error(`Expected six baseline Nexora tables, got ${tables.rows.length}`);
    const completeTables = await db.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema='public' and table_name in ('workspaces','workspace_members','project_versions','brief_templates','workspace_invites','review_invitations','notifications','project_attachments','support_requests') order by table_name",
    );
    if (completeTables.rows.length !== 9)
      throw new Error(`Expected nine complete-suite tables, got ${completeTables.rows.length}: ${completeTables.rows.map((row) => row.table_name).join(",")}`);
    const rpc = await db.query<{ proname: string }>(
      "select proname from pg_proc where proname in ('nexora_create_project','nexora_update_project','nexora_share_project','nexora_project_history','nexora_get_review','nexora_review_action','nexora_get_profile','nexora_update_profile','nexora_is_admin','nexora_admin_customers','nexora_admin_projects','nexora_admin_overview')",
    );
    if (rpc.rows.length !== 12)
      throw new Error(`Expected twelve baseline Nexora RPCs, got ${rpc.rows.length}`);
    const completeRpc = await db.query<{ proname: string }>(
      "select proname from pg_proc where proname in ('nexora_list_workspaces','nexora_create_workspace','nexora_archive_project','nexora_duplicate_project','nexora_delete_project','nexora_project_versions','nexora_compare_versions','nexora_workspace_invite','nexora_accept_workspace_invite','nexora_list_notifications','nexora_allow_request','nexora_transfer_workspace_ownership')",
    );
    if (completeRpc.rows.length !== 12)
      throw new Error(`Expected twelve complete-suite RPCs, got ${completeRpc.rows.length}`);
    await db.exec("set role authenticated;");
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
      "set role authenticated; set session request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001'; set session request.jwt.claims = '{\"aal\":\"aal2\",\"iat\":9999999999,\"session_id\":\"10000000-0000-0000-0000-000000000001\",\"amr\":[{\"method\":\"totp\",\"timestamp\":9999999999}]}'",
    );
    const initialProfile = await db.query<{ profile: any }>(
      "select public.nexora_update_profile($1::jsonb) as profile",
      [
        JSON.stringify({
          fullName: "Owner One",
          company: "Nexora Studio",
          roleTitle: "Designer",
          website: "https://example.com",
          bio: "A profile for smoke testing.",
        }),
      ],
    );
    if (initialProfile.rows[0].profile.fullName !== "Owner One")
      throw new Error("Profile update did not preserve the owner profile");
    const ownerIsAdmin = await db.query<{ is_admin: boolean }>(
      "select public.nexora_is_admin() as is_admin",
    );
    if (ownerIsAdmin.rows[0].is_admin !== false)
      throw new Error("A normal user was treated as an admin");
    await db.exec("reset role; insert into private.nexora_admins(user_id) values ('00000000-0000-0000-0000-000000000001'); set role authenticated;");
    const promotedIsAdmin = await db.query<{ is_admin: boolean }>(
      "select public.nexora_is_admin() as is_admin",
    );
    if (promotedIsAdmin.rows[0].is_admin !== true)
      throw new Error("Allowlisted user was not recognized as an admin");
    const adminOverview = await db.query<{ overview: any }>(
      "select public.nexora_admin_overview() as overview",
    );
    if (adminOverview.rows[0].overview.customerCount !== 3)
      throw new Error("Admin overview did not expose the customer count");
    await db.exec("set role postgres; create table auth.mfa_factors(user_id uuid, status text, factor_type text); insert into auth.mfa_factors(user_id,status,factor_type) values ('00000000-0000-0000-0000-000000000001','verified','totp'); set role authenticated;");
    const adminCustomerDetail = await db.query<{ detail: any }>(
      "select public.nexora_admin_customer_detail('00000000-0000-0000-0000-000000000001') as detail",
    );
    const detailProfile = adminCustomerDetail.rows[0].detail.profile;
    if (detailProfile.fullName !== "Owner One" || detailProfile.roleTitle !== "Designer")
      throw new Error("Admin customer detail did not return the canonical profile DTO");
    await db.exec(
      "set session request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002'; set session request.jwt.claims = '{\"aal\":\"aal2\",\"iat\":9999999999,\"session_id\":\"10000000-0000-0000-0000-000000000002\",\"amr\":[{\"method\":\"totp\",\"timestamp\":9999999999}]}'",
    );
    const ordinaryIsAdmin = await db.query<{ is_admin: boolean }>(
      "select public.nexora_is_admin() as is_admin",
    );
    if (ordinaryIsAdmin.rows[0].is_admin !== false)
      throw new Error("A non-allowlisted user was treated as an admin");
    let ordinaryAdminDenied = false;
    try {
      await db.query("select public.nexora_admin_overview()");
    } catch {
      ordinaryAdminDenied = true;
    }
    if (!ordinaryAdminDenied)
      throw new Error("A non-allowlisted user could read the admin overview");
    await db.exec("set role anon");
    let anonymousAdminDenied = false;
    try {
      await db.query("select public.nexora_is_admin()");
    } catch {
      anonymousAdminDenied = true;
    }
    if (!anonymousAdminDenied)
      throw new Error("Anonymous callers could invoke the admin RPC");
    await db.exec(
      "set role authenticated; set session request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002'; set session request.jwt.claims = '{\"aal\":\"aal2\",\"iat\":9999999999,\"session_id\":\"10000000-0000-0000-0000-000000000002\",\"amr\":[{\"method\":\"totp\",\"timestamp\":9999999999}]}'",
    );
    await db.query("select public.nexora_update_profile($1::jsonb)", [
      JSON.stringify({
        fullName: "Owner Two",
        company: "Other Studio",
        roleTitle: "Developer",
        website: "",
        bio: "Another private profile.",
      }),
    ]);
    await db.exec(
      "set session request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001'; set session request.jwt.claims = '{\"aal\":\"aal2\",\"iat\":9999999999,\"session_id\":\"10000000-0000-0000-0000-000000000001\",\"amr\":[{\"method\":\"totp\",\"timestamp\":9999999999}]}'",
    );
    const visibleProfiles = await db.query<{ count: string }>(
      "select count(*)::text as count from public.profiles",
    );
    if (visibleProfiles.rows[0].count !== "1")
      throw new Error("Profile RLS leaked another owner's profile");
    let selfPromotionDenied = false;
    try {
      await db.query(
        "insert into private.nexora_admins(user_id) values ('00000000-0000-0000-0000-000000000002')",
      );
    } catch {
      selfPromotionDenied = true;
    }
    if (!selfPromotionDenied)
      throw new Error("An authenticated user could insert an admin row");
    let selfAdminUpdateDenied = false;
    try {
      await db.query(
        "update private.nexora_admins set created_at=now() where user_id='00000000-0000-0000-0000-000000000001'",
      );
    } catch {
      selfAdminUpdateDenied = true;
    }
    if (!selfAdminUpdateDenied)
      throw new Error("An authenticated user could update the admin allowlist");
    let otherProfileUpdateDenied = false;
    try {
      await db.query(
        "update public.profiles set full_name='Tampered' where id='00000000-0000-0000-0000-000000000002'",
      );
    } catch {
      otherProfileUpdateDenied = true;
    }
    if (!otherProfileUpdateDenied)
      throw new Error("An authenticated user could update another profile");
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
    const personalWorkspace = await db.query<{ workspace: string }>(
      "select public.nexora_get_or_create_personal_workspace() as workspace",
    );
    const workspaceId = personalWorkspace.rows[0].workspace;
    const savedScopeTemplate = await db.query<{ template: any }>(
      "select public.nexora_create_scope_template($1::uuid,$2,$3,$4::jsonb,$5::text[]) as template",
      [workspaceId, "Launch scope", "This is a sufficiently long reusable scope brief for smoke testing.", JSON.stringify(scope), ["website", "launch"]],
    );
    if (savedScopeTemplate.rows[0].template.scope.revisions !== scope.revisions)
      throw new Error("Scope template did not preserve structured scope data");
    const listedScopeTemplates = await db.query<{ template: any }>(
      "select public.nexora_list_brief_templates($1::uuid) as template",
      [workspaceId],
    );
    if (!listedScopeTemplates.rows.some((row: any) => row.template?.scope?.deliverables?.[0] === "Website"))
      throw new Error("Scope template was not returned by the workspace picker RPC");
    const adminSummary = await db.query<{ overview: any }>(
      "select public.nexora_admin_overview() as overview",
    );
    const summaryText = JSON.stringify(adminSummary.rows[0].overview);
    for (const secretField of ["brief", "scope", "reviewToken", "token"])
      if (summaryText.includes(`\"${secretField}\"`))
        throw new Error(`Admin overview exposed ${secretField}`);
    const shared = await db.query<{ project: { reviewToken: string } }>(
      "select public.nexora_share_project($1::uuid) as project",
      [project.id],
    );
    const token = shared.rows[0].project.reviewToken;
    await db.query("select public.nexora_set_review_access($1::uuid,true)", [project.id]);
    const invite = await db.query<{ invitation: { id: string } }>("select public.nexora_create_review_invitation($1::uuid,$2,$3) as invitation", [project.id, token, "two@example.com"]);
    const inviteId = invite.rows[0].invitation.id;
    await db.exec(
      "set session request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002'; set session request.jwt.claims = '{\"aal\":\"aal2\",\"iat\":9999999999,\"session_id\":\"10000000-0000-0000-0000-000000000002\",\"amr\":[{\"method\":\"totp\",\"timestamp\":9999999999}]}'",
    );
    const review = await db.query<{ review: { id: string } }>(
      "select public.nexora_get_review($1) as review",
      [token],
    );
    if (review.rows[0].review.id !== project.id)
      throw new Error("Reviewer could not read the token-scoped snapshot");
    await db.exec("set role postgres;");
    const acceptedInvite = await db.query<{ status: string; accepted_by: string }>("select status,accepted_by from public.review_invitations where id=$1", [inviteId]);
    await db.exec("set role authenticated;");
    if (acceptedInvite.rows[0].status !== "accepted" || !acceptedInvite.rows[0].accepted_by)
      throw new Error("First invited review read did not bind the confirmed account");
    await db.exec(
      "set session request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003'; set session request.jwt.claims = '{\"aal\":\"aal2\",\"iat\":9999999999,\"session_id\":\"10000000-0000-0000-0000-000000000003\",\"amr\":[{\"method\":\"totp\",\"timestamp\":9999999999}]}'",
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
      "set role authenticated; set session request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002'; set session request.jwt.claims = '{\"aal\":\"aal2\",\"iat\":9999999999,\"session_id\":\"10000000-0000-0000-0000-000000000002\",\"amr\":[{\"method\":\"totp\",\"timestamp\":9999999999}]}'",
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
      approvedReview.rows[0].review.approval?.name !== "Owner Two" ||
      approvedReview.rows[0].review.scope.deliverables[0] !== "Website"
    )
      throw new Error(
        "Approved review did not preserve approval metadata or scope",
      );
    await db.exec(
      "set session request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001'; set session request.jwt.claims = '{\"aal\":\"aal2\",\"iat\":9999999999,\"session_id\":\"10000000-0000-0000-0000-000000000001\",\"amr\":[{\"method\":\"totp\",\"timestamp\":9999999999}]}'",
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
      "set session request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002'; set session request.jwt.claims = '{\"aal\":\"aal2\",\"iat\":9999999999,\"session_id\":\"10000000-0000-0000-0000-000000000002\",\"amr\":[{\"method\":\"totp\",\"timestamp\":9999999999}]}'",
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
      "set session request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001'; set session request.jwt.claims = '{\"aal\":\"aal2\",\"iat\":9999999999,\"session_id\":\"10000000-0000-0000-0000-000000000001\",\"amr\":[{\"method\":\"totp\",\"timestamp\":9999999999}]}'",
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
      "set session request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002'; set session request.jwt.claims = '{\"aal\":\"aal2\",\"iat\":9999999999,\"session_id\":\"10000000-0000-0000-0000-000000000002\",\"amr\":[{\"method\":\"totp\",\"timestamp\":9999999999}]}'",
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
    await db.exec(
      "set session request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001'; set session request.jwt.claims = '{\"aal\":\"aal2\",\"iat\":9999999999,\"session_id\":\"10000000-0000-0000-0000-000000000001\",\"amr\":[{\"method\":\"totp\",\"timestamp\":9999999999}]}'",
    );
    await db.query("select public.nexora_revoke_review_snapshot($1)", [token]);
    await db.exec("set role postgres;");
    const revokedApprovedSnapshot = await db.query<{ status: string }>("select status from public.review_snapshots where token=$1", [token]);
    if (revokedApprovedSnapshot.rows[0].status !== "revoked")
      throw new Error("Approved review snapshot could not be manually revoked");
    await db.exec("set role authenticated;");
    await db.query("select public.nexora_revoke_review_invitation($1::uuid)", [inviteId]);
    await db.exec(
      "set session request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002'; set session request.jwt.claims = '{\"aal\":\"aal2\",\"iat\":9999999999,\"session_id\":\"10000000-0000-0000-0000-000000000002\",\"amr\":[{\"method\":\"totp\",\"timestamp\":9999999999}]}'",
    );
    let revokedInviteDenied = false;
    try { await db.query("select public.nexora_get_review($1)", [token]); } catch { revokedInviteDenied = true; }
    if (!revokedInviteDenied) throw new Error("Revoked invited reviewer retained review access");
    const freshEpoch = Math.floor(Date.now() / 1000);
    await db.exec("set role postgres; insert into auth.mfa_factors(user_id,status,factor_type) values ('00000000-0000-0000-0000-000000000001','verified','totp'); set role authenticated;");
    // Ordinary unenrolled accounts may use a fresh password reauthentication,
    // but a stale password AMR must fail the sensitive-operation helper.
    await db.exec(`set session request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002'; set session request.jwt.claims = '{"aal":"aal1","iat":${freshEpoch},"session_id":"10000000-0000-0000-0000-000000000002","amr":[{"method":"password","timestamp":${freshEpoch}}]}'`);
    const passwordFresh = await db.query<{ allowed: boolean }>("select public.nexora_recent_mfa_satisfied() as allowed");
    if (!passwordFresh.rows[0].allowed) throw new Error("An unenrolled account failed a fresh password sensitive-operation check");
    await db.exec("set session request.jwt.claims = '{\"aal\":\"aal1\",\"iat\":0,\"session_id\":\"10000000-0000-0000-0000-000000000002\",\"amr\":[{\"method\":\"password\",\"timestamp\":0}]}'");
    const passwordStale = await db.query<{ allowed: boolean }>("select public.nexora_recent_mfa_satisfied() as allowed");
    if (passwordStale.rows[0].allowed) throw new Error("A stale password AMR passed the recent sensitive-operation check");
    let staleDeletionDenied = false;
    try { await db.query("select public.nexora_request_account_deletion($1,$2)", ["DELETE MY ACCOUNT", "stale smoke session"]); } catch { staleDeletionDenied = true; }
    if (!staleDeletionDenied) throw new Error("A stale password session could submit an account deletion request");
    // Enrolled accounts require AAL2 plus a fresh TOTP AMR; a password AMR
    // alone must never satisfy the helper.
    await db.exec(`set session request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001'; set session request.jwt.claims = '{"aal":"aal1","iat":${freshEpoch},"session_id":"10000000-0000-0000-0000-000000000001","amr":[{"method":"password","timestamp":${freshEpoch}}]}'`);
    const enrolledAal1 = await db.query<{ allowed: boolean }>("select public.nexora_mfa_satisfied() as allowed");
    if (enrolledAal1.rows[0].allowed) throw new Error("An enrolled MFA account was allowed to use an AAL1 application session");
    const enrolledPassword = await db.query<{ allowed: boolean }>("select public.nexora_recent_mfa_satisfied() as allowed");
    if (enrolledPassword.rows[0].allowed) throw new Error("An enrolled MFA account passed with a fresh password AMR only");
    await db.exec(`set session request.jwt.claims = '{"aal":"aal2","iat":${freshEpoch},"session_id":"10000000-0000-0000-0000-000000000001","amr":[{"method":"totp","timestamp":${freshEpoch}}]}'`);
    const totpFresh = await db.query<{ allowed: boolean }>("select public.nexora_recent_mfa_satisfied() as allowed");
    if (!totpFresh.rows[0].allowed) throw new Error("An enrolled account failed a fresh TOTP sensitive-operation check");
    await db.exec("set session request.jwt.claims = '{\"aal\":\"aal2\",\"iat\":0,\"session_id\":\"10000000-0000-0000-0000-000000000001\",\"amr\":[{\"method\":\"totp\",\"timestamp\":0}]}'");
    const totpStale = await db.query<{ allowed: boolean }>("select public.nexora_recent_mfa_satisfied() as allowed");
    if (totpStale.rows[0].allowed) throw new Error("A stale TOTP AMR passed the recent sensitive-operation check");
    await db.exec("set role postgres; insert into private.nexora_admins(user_id) values ('00000000-0000-0000-0000-000000000002') on conflict (user_id) do nothing; set role authenticated; set session request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';");
    let staleEnrolledDeletionDenied = false;
    try { await db.query("select public.nexora_request_account_deletion($1,$2)", ["DELETE MY ACCOUNT", "stale enrolled smoke session"]); } catch { staleEnrolledDeletionDenied = true; }
    if (!staleEnrolledDeletionDenied) throw new Error("A stale enrolled TOTP session could submit an account deletion request");
    await db.exec("set session request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002'; set session request.jwt.claims = '{\"aal\":\"aal2\",\"iat\":9999999999,\"session_id\":\"10000000-0000-0000-0000-000000000002\",\"amr\":[{\"method\":\"totp\",\"timestamp\":9999999999}]}'");
    const outsider = await db.query<{ allowed: boolean }>("select public.nexora_can_access_project($1::uuid,'viewer') as allowed", [project.id]);
    if (outsider.rows[0].allowed) throw new Error("A non-member could access a known project through the direct RPC");
    let outsiderUpdateDenied = false;
    try { await db.query("select public.nexora_update_project($1::uuid,$2::jsonb)", [project.id, JSON.stringify({ title: "Outsider", client: "Client", brief: "This is a sufficiently long project brief for smoke testing.", analysis, scope })]); } catch { outsiderUpdateDenied = true; }
    if (!outsiderUpdateDenied) throw new Error("A non-member could update a known project through the direct RPC");
    await db.exec("set session request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001'; set session request.jwt.claims = '{\"aal\":\"aal2\",\"iat\":9999999999,\"session_id\":\"10000000-0000-0000-0000-000000000001\",\"amr\":[{\"method\":\"totp\",\"timestamp\":9999999999}]}'");
    const recentBeforeRevoke = await db.query<{ allowed: boolean }>("select public.nexora_recent_mfa_satisfied() as allowed");
    if (!recentBeforeRevoke.rows[0].allowed) throw new Error("A live session failed the recent MFA check");
    await db.exec("set role postgres; delete from auth.sessions where id='10000000-0000-0000-0000-000000000001'; set role authenticated;");
    const recentAfterRevoke = await db.query<{ allowed: boolean }>("select public.nexora_recent_mfa_satisfied() as allowed");
    if (recentAfterRevoke.rows[0].allowed) throw new Error("A revoked session passed the recent MFA check");
    await db.exec("set role postgres; delete from auth.users where id='00000000-0000-0000-0000-000000000003'; set role authenticated; set session request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003'; set session request.jwt.claims = '{\"aal\":\"aal1\",\"iat\":9999999999,\"session_id\":\"10000000-0000-0000-0000-000000000003\",\"amr\":[{\"method\":\"password\",\"timestamp\":9999999999}]}'");
    const deletedSession = await db.query<{ allowed: boolean }>("select public.nexora_recent_mfa_satisfied() as allowed");
    if (deletedSession.rows[0].allowed) throw new Error("A deleted Auth user passed the recent session check");
    // Exercise both hosted Storage ownership columns, including a legacy row
    // where owner_id is populated and owner is NULL. The transfer RPC must
    // accept that compatible row, remain idempotent after transfer, reject a
    // conflicting owner, and let the exact manifest check catch an orphan.
    await db.exec("set role postgres; create schema storage; create table storage.objects(bucket_id text not null,name text not null,owner_id text,owner uuid); insert into public.workspaces(id,owner_id,name,personal) values ('90000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','Storage smoke team',false); insert into storage.objects(bucket_id,name,owner_id,owner) values ('nexora-private','legacy/team','00000000-0000-0000-0000-000000000001',null),('nexora-private','foreign/team','00000000-0000-0000-0000-000000000003',null),('nexora-profile-avatars','orphan/avatar','00000000-0000-0000-0000-000000000001',null); set role service_role; reset request.jwt.claim.role; set session request.jwt.claims = '{\"role\":\"service_role\"}';");
    const transferred = await db.query<{ transferred: boolean }>("select public.nexora_storage_reassign_owner($1,$2,$3,$4,$5) as transferred", ["nexora-private", "legacy/team", "00000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-000000000002", "90000000-0000-0000-0000-000000000002"]);
    if (!transferred.rows[0].transferred) throw new Error("Legacy nullable Storage ownership transfer was rejected");
    const repeatedTransfer = await db.query<{ transferred: boolean }>("select public.nexora_storage_reassign_owner($1,$2,$3,$4,$5) as transferred", ["nexora-private", "legacy/team", "00000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-000000000002", "90000000-0000-0000-0000-000000000002"]);
    if (!repeatedTransfer.rows[0].transferred) throw new Error("Already-transferred team Storage ownership was not idempotent");
    const foreignTransfer = await db.query<{ transferred: boolean }>("select public.nexora_storage_reassign_owner($1,$2,$3,$4,$5) as transferred", ["nexora-private", "foreign/team", "00000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-000000000002", "90000000-0000-0000-0000-000000000002"]);
    if (foreignTransfer.rows[0].transferred) throw new Error("Storage transfer accepted a conflicting foreign owner");
    const exactManifest = await db.query<{ result: { ok: boolean; untracked: number } }>("select public.nexora_storage_verify_deletion_manifest($1,$2::jsonb) as result", ["00000000-0000-0000-0000-000000000001", JSON.stringify([{ bucket: "nexora-private", object_key: "legacy/team", workspace_owner_id: "00000000-0000-0000-0000-000000000002", workspace_personal: false }])]);
    if (exactManifest.rows[0].result.ok || exactManifest.rows[0].result.untracked !== 1) throw new Error("Exact Storage manifest verification missed an unregistered owned object");
    await db.exec("set role postgres; drop table storage.objects; create table storage.objects(bucket_id text not null,name text not null,owner_id text); insert into storage.objects(bucket_id,name,owner_id) values ('nexora-private','owner-id-only','00000000-0000-0000-0000-000000000001'); set role service_role; reset request.jwt.claim.role; set session request.jwt.claims = '{\"role\":\"service_role\"}';");
    const ownerIdOnlyTransfer = await db.query<{ transferred: boolean }>("select public.nexora_storage_reassign_owner($1,$2,$3,$4,$5) as transferred", ["nexora-private", "owner-id-only", "00000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-000000000002", "90000000-0000-0000-0000-000000000002"]);
    if (!ownerIdOnlyTransfer.rows[0].transferred) throw new Error("owner_id-only Storage transfer failed");
    await db.exec("set role postgres; drop table storage.objects; create table storage.objects(bucket_id text not null,name text not null,owner uuid); insert into storage.objects(bucket_id,name,owner) values ('nexora-private','owner-only','00000000-0000-0000-0000-000000000001'); set role service_role; reset request.jwt.claim.role; set session request.jwt.claims = '{\"role\":\"service_role\"}';");
    const ownerOnlyTransfer = await db.query<{ transferred: boolean }>("select public.nexora_storage_reassign_owner($1,$2,$3,$4,$5) as transferred", ["nexora-private", "owner-only", "00000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-000000000002", "90000000-0000-0000-0000-000000000002"]);
    if (!ownerOnlyTransfer.rows[0].transferred) throw new Error("owner-only Storage transfer failed");
    const ownerOnlyRepeat = await db.query<{ transferred: boolean }>("select public.nexora_storage_reassign_owner($1,$2,$3,$4,$5) as transferred", ["nexora-private", "owner-only", "00000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-000000000002", "90000000-0000-0000-0000-000000000002"]);
    if (!ownerOnlyRepeat.rows[0].transferred) throw new Error("owner-only already-transferred Storage retry failed");
    await db.exec("set role postgres; drop table storage.objects; create table storage.objects(bucket_id text not null,name text not null,owner_id text,owner uuid); insert into storage.objects(bucket_id,name,owner_id,owner) values ('nexora-private','both-null',null,null),('nexora-private','foreign-owner','00000000-0000-0000-0000-000000000003',null); set role service_role; reset request.jwt.claim.role; set session request.jwt.claims = '{\"role\":\"service_role\"}';");
    const nullOwnerTransfer = await db.query<{ transferred: boolean }>("select public.nexora_storage_reassign_owner($1,$2,$3,$4,$5) as transferred", ["nexora-private", "both-null", "00000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-000000000002", "90000000-0000-0000-0000-000000000002"]);
    if (nullOwnerTransfer.rows[0].transferred) throw new Error("Storage transfer accepted an unowned object with nullable metadata");
    const foreignOwnerTransfer = await db.query<{ transferred: boolean }>("select public.nexora_storage_reassign_owner($1,$2,$3,$4,$5) as transferred", ["nexora-private", "foreign-owner", "00000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-000000000002", "90000000-0000-0000-0000-000000000002"]);
    if (foreignOwnerTransfer.rows[0].transferred) throw new Error("Storage transfer accepted a conflicting foreign owner");
    // Sequential overlapping-claim fixture: the first legacy-admin claim is
    // reserved, so a second claim cannot become the final administrator while
    // the first worker is still processing. This exercises the database guard;
    // it is not a provider-concurrency stress test.
    await db.exec("set role postgres; insert into private.nexora_admins(user_id) values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002') on conflict (user_id) do nothing; insert into private.account_deletion_requests(user_id,confirmation,status) values ('00000000-0000-0000-0000-000000000001','DELETE MY ACCOUNT','pending'),('00000000-0000-0000-0000-000000000002','DELETE MY ACCOUNT','pending'); set role service_role; reset request.jwt.claim.role; set session request.jwt.claims = '{\"role\":\"service_role\"}';");
    const firstAdminClaim = await db.query<{ claimed: boolean }>("select public.nexora_claim_account_deletion($1::uuid) as claimed", ["00000000-0000-0000-0000-000000000001"]);
    if (!firstAdminClaim.rows[0].claimed) throw new Error("The first overlapping admin deletion claim was not reserved");
    let secondAdminClaimDenied = false;
    try {
      await db.query("select public.nexora_claim_account_deletion($1::uuid)", ["00000000-0000-0000-0000-000000000002"]);
    } catch {
      secondAdminClaimDenied = true;
    }
    if (!secondAdminClaimDenied) throw new Error("A second overlapping final-admin deletion claim was accepted");
    await db.exec("set role postgres; update private.account_deletion_requests set status='cancelled' where user_id in ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002'); delete from private.nexora_admins where user_id in ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002'); set role authenticated; reset request.jwt.claim.role;");
    console.log(
      "Supabase migration smoke passed: six tables and twelve RPCs created.",
    );
  } finally {
    await db.close();
  }
}
void main();
