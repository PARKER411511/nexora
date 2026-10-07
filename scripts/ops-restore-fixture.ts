import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { decryptBackupBuffer, encryptBackupJsonStream } from "../src/lib/ops/crypto";
import { restoreBackupDocument } from "../src/lib/ops/restore";

const userOne = "00000000-0000-0000-0000-000000000001";
const userTwo = "00000000-0000-0000-0000-000000000002";
const workspaceId = "10000000-0000-0000-0000-000000000001";
const projectId = "20000000-0000-0000-0000-000000000001";
const snapshotToken = "fixture-review-token-0000000000000000000000000000";
const requestId = "30000000-0000-0000-0000-000000000001";

async function schema(db: PGlite) {
  await db.exec("create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, confirmed_at timestamptz, last_sign_in_at timestamptz, created_at timestamptz not null default now(), raw_user_meta_data jsonb not null default '{}'::jsonb); create table auth.sessions(id uuid primary key,user_id uuid not null); create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;");
  await db.query("insert into auth.users(id,email,email_confirmed_at,confirmed_at,created_at) values ($1,$2,now(),now(),now()),($3,$4,now(),now(),now())", [userOne, "one@example.com", userTwo, "two@example.com"]);
  await db.query("insert into auth.sessions(id,user_id) values ($1,$2),($3,$4)", ["10000000-0000-0000-0000-000000000001", userOne, "10000000-0000-0000-0000-000000000002", userTwo]);
  for (const path of [
    "20261005_private_workspace.sql",
    "20261005_accounts_admin.sql",
    "20261005_complete_suite.sql",
    "20261005_security_completion.sql",
    "20261006_operations.sql",
  ]) await db.exec(await readFile(new URL(`../supabase/migrations/${path}`, import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("../supabase/migrations/20261006_operations.sql", import.meta.url), "utf8"));
}

async function seed(db: PGlite) {
  const seedSql = `set role postgres; set session request.jwt.claim.sub = '${userOne}'; set session request.jwt.claims = '{"aal":"aal2","iat":9999999999,"session_id":"10000000-0000-0000-0000-000000000001","amr":[{"method":"totp","timestamp":9999999999}]}';
    insert into private.operations_export_secrets(secret_hash) values (repeat('a',64));
    insert into private.nexora_admins(user_id) values ($1);
    insert into public.profiles(id,full_name,company,role_title,website,bio) values ($1,'Fixture Owner','Nexora Test','Designer','https://example.com','Fixture profile');
    insert into public.workspaces(id,owner_id,name,personal) values ($3,$1,'Fixture Workspace',true);
    insert into public.workspace_members(workspace_id,user_id,role) values ($3,$1,'owner');
    insert into public.projects(id,owner_id,workspace_id,created_by,updated_by,title,client,brief,analysis,scope,status,archived,tags,version) values ($4,$1,$3,$1,$1,'Fixture project','Fixture client','This is a sufficiently long fixture project brief for restore testing.', '{"mode":"local","summary":"Fixture summary","audience":"Test users","goals":["Verify restore"],"pages":["Home"],"needs":["Review"],"risks":["None"],"questions":["None"]}', '{"deliverables":["Website"],"included":["Home"],"excluded":["Branding"],"milestones":[{"name":"Plan","detail":"Confirm structure","timing":"Week 1"}],"revisions":1}', 'draft',false,ARRAY['fixture'],1);
    insert into public.review_snapshots(token,project_id,owner_id,project_json,status) values ($5,$4,$1,'{"id":"20000000-0000-0000-0000-000000000001","title":"Fixture project"}','shared');
    insert into public.review_comments(snapshot_token,name,comment,action,author_id,author_email) values ($5,'Fixture reviewer','Looks good','feedback',$2,'two@example.com');
    insert into public.change_requests(id,project_id,snapshot_token,requester_name,requester_id,title,details,status) values ('30000000-0000-0000-0000-000000000001',$4,$5,'Fixture reviewer',$2,'Fixture request','Please confirm the fixture.','open');
    insert into public.change_proposals(request_id,version,title,details,affected_deliverables,price_adjustment,currency,timeline_impact,rationale) values ('30000000-0000-0000-0000-000000000001',1,'Fixture proposal','Fixture details','["Website"]',10,'USD','One week','Fixture rationale');
    insert into public.project_versions(project_id,version,project_json,changed_by) values ($4,1,'{"title":"Fixture project"}',$1);
    insert into public.brief_templates(owner_id,created_by,workspace_id,name,brief,tags) values ($1,$1,$3,'Fixture template','This fixture brief is sufficiently long for the template check.',ARRAY['fixture']);
    insert into public.workspace_invites(workspace_id,email,role,token_hash,expires_at,invited_by) values ($3,'two@example.com','viewer',decode('aa','hex'),now()+interval '1 day',$1);
    insert into public.review_invitations(project_id,snapshot_token,invited_email,invited_by,status,due_at,token_hash) values ($4,$5,'two@example.com',$1,'pending',now()+interval '1 day',decode('bb','hex'));
    insert into public.notifications(user_id,event_type,project_id,snapshot_token,actor_id,payload) values ($1,'system',$4,$5,$2,'{"fixture":true}');
    insert into public.project_attachments(project_id,snapshot_token,owner_id,uploaded_by,object_key,original_name,mime_type,byte_size) values ($4,$5,$1,$1,'00000000-0000-0000-0000-000000000001/fixture.txt','fixture.txt','text/plain',7);
    insert into public.support_requests(requester_id,subject,body) values ($1,'Fixture support','Fixture support body');
    insert into private.account_states(user_id,suspended,reason,changed_by) values ($1,false,'Fixture',$1);
    insert into private.platform_roles(user_id,role,granted_by) values ($1,'viewer',$1);
    insert into private.audit_events(actor_id,action,target_type,target_id,payload) values ($1,'fixture.created','project',$4,'{"fixture":true}');
    insert into private.app_errors(actor_id,request_id,source,message,context) values ($1,'fixture-request','fixture','Fixture error','{"fixture":true}');
    insert into private.rate_limits(bucket,subject_id,window_started_at,count) values ('fixture',$1,date_trunc('hour',now()),1);
    insert into private.application_backups(version,sha256,manifest,created_by) values ('fixture-1',repeat('a',64),'{"fixture":true}',$1);
    insert into private.account_deletion_requests(user_id,confirmation,reason,status) values ($2,'DELETE MY ACCOUNT','Fixture','cancelled');
    insert into private.profile_avatar_tombstones(user_id,object_key) values ($1,'fixture-avatar');
  `;
  await db.exec(seedSql.replaceAll("$1", `'${userOne}'`).replaceAll("$2", `'${userTwo}'`).replaceAll("$3", `'${workspaceId}'`).replaceAll("$4", `'${projectId}'`).replaceAll("$5", `'${snapshotToken}'`));
}

async function main() {
  const outputPath = process.argv[2];
  if (!outputPath) throw new Error("Usage: tsx scripts/ops-restore-fixture.ts restored.json");
  const source = new PGlite("memory://nexora-ops-source", { extensions: { pgcrypto } });
  const target = new PGlite("memory://nexora-ops-target", { extensions: { pgcrypto } });
  try {
    await schema(source);
    await seed(source);
    let boundedExportRejected = false;
    try {
      await source.query("select private.nexora_ops_build_snapshot(1) as payload");
    } catch {
      boundedExportRejected = true;
    }
    if (!boundedExportRejected) throw new Error("Bounded export silently truncated a table.");
    let anonymousReaderRejected = false;
    await source.exec("set role anon; set session request.jwt.claim.role = 'anon';");
    try {
      await source.query("select public.nexora_ops_export($1,5000) as payload", ["a".repeat(64)]);
    } catch (error) {
      anonymousReaderRejected = error instanceof Error && /operations export unavailable|permission denied/i.test(error.message);
    }
    if (!anonymousReaderRejected) throw new Error("Anonymous export reader was not rejected.");
    let authenticatedReaderRejected = false;
    await source.exec("set role authenticated; set session request.jwt.claim.role = 'authenticated';");
    try {
      await source.query("select public.nexora_ops_export($1,5000) as payload", ["a".repeat(64)]);
    } catch (error) {
      authenticatedReaderRejected = error instanceof Error && /operations export unavailable|permission denied/i.test(error.message);
    }
    if (!authenticatedReaderRejected) throw new Error("Authenticated export reader was not rejected.");
    let unknownReaderRejected = false;
    await source.exec("set role service_role; reset request.jwt.claim.role; set session request.jwt.claims = '{\"role\":\"service_role\"}';");
    try {
      await source.query("select public.nexora_ops_export($1,5000) as payload", ["b".repeat(64)]);
    } catch (error) {
      unknownReaderRejected = error instanceof Error && /operations export unavailable/i.test(error.message);
    }
    if (!unknownReaderRejected) throw new Error("Unknown export reader was not rejected.");
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await source.query("select public.nexora_ops_export($1,5000) as payload", ["a".repeat(64)]);
    }
    let rateLimited = false;
    try {
      await source.query("select public.nexora_ops_export($1,5000) as payload", ["a".repeat(64)]);
    } catch (error) {
      rateLimited = error instanceof Error && /operations export rate limit exceeded/i.test(error.message);
    }
    if (!rateLimited) throw new Error("Repeated valid-reader export was not rate limited.");
    await source.exec("set role postgres; reset request.jwt.claim.role;");
    const result = await source.query<{ payload: unknown }>("select private.nexora_ops_build_snapshot(5000) as payload");
    const document = result.rows[0].payload;
    const emojiPrefixBytes = Buffer.byteLength('{"payload":"', "utf8");
    const emojiJson = JSON.stringify({ payload: `${"x".repeat(65535 - emojiPrefixBytes)}😀tail` });
    if (Buffer.from(emojiJson, "utf8").indexOf(Buffer.from("😀", "utf8")) !== 65535) {
      throw new Error("Emoji fixture did not cross the streaming chunk boundary.");
    }
    const streamReader = encryptBackupJsonStream(emojiJson, "stream-key-with-more-than-32-bytes-for-tests").getReader();
    const streamChunks: Buffer[] = [];
    while (true) {
      const part = await streamReader.read();
      if (part.done) break;
      streamChunks.push(Buffer.from(part.value));
    }
    const streamedPlaintext = decryptBackupBuffer(
      Buffer.concat(streamChunks),
      "stream-key-with-more-than-32-bytes-for-tests",
    ).toString("utf8");
    if (streamedPlaintext !== emojiJson) throw new Error("UTF-8 streaming backup round-trip was corrupted.");
    await schema(target);
    await target.exec(`set role postgres; set session request.jwt.claim.sub = '${userOne}'; set session request.jwt.claims = '{"aal":"aal2","iat":9999999999,"session_id":"10000000-0000-0000-0000-000000000001","amr":[{"method":"totp","timestamp":9999999999}]}';`);
    const restored = await restoreBackupDocument(target, document, {
      targetKind: "isolated",
      authIdMap: { [userOne]: userOne, [userTwo]: userTwo },
    });
    const exportedTables = (document as { tables: Record<string, unknown[]> }).tables;
    if (restored.rows["public.projects"] !== exportedTables["public.projects"].length || restored.rows["public.notifications"] !== exportedTables["public.notifications"].length || restored.rows["private.audit_events"] !== exportedTables["private.audit_events"].length) throw new Error("Non-empty restore counts were not preserved.");
    await (await import("node:fs/promises")).writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, { mode: 0o600 });
    console.log(`PGlite logical restore passed for ${Object.keys(restored.rows).length} application tables.`);
  } finally {
    await source.close();
    await target.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
