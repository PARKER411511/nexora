-- Nexora operations: bounded, logical application exports and reviewed
-- pg_cron targets. This migration never stores a bearer secret or Storage
-- object bytes. Apply after the 20261005 migrations.

create schema if not exists private;
create extension if not exists pgcrypto with schema extensions;

create table if not exists private.operations_export_secrets (
  id boolean primary key default true check (id),
  secret_hash text not null check (secret_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  rotated_at timestamptz not null default now()
);

create table if not exists private.operations_snapshots (
  id uuid primary key default extensions.gen_random_uuid(),
  schema_name text not null check (schema_name = 'nexora-application-v2'),
  payload jsonb not null,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  source text not null default 'pg_cron' check (source in ('pg_cron','operator')),
  created_at timestamptz not null default now()
);
create index if not exists operations_snapshots_created_idx
  on private.operations_snapshots(created_at desc);

-- The reader capability is deliberately rate limited at the database boundary.
-- This fixed hourly budget applies to the valid capability, not to client input.
-- Unknown hashes are rejected before this row can be touched.
create table if not exists private.operations_export_rate_limits (
  id boolean primary key default true check (id),
  window_started_at timestamptz not null default date_trunc('hour', now()),
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now()
);

alter table private.operations_export_secrets enable row level security;
alter table private.operations_snapshots enable row level security;
alter table private.operations_export_rate_limits enable row level security;
revoke all on private.operations_export_secrets, private.operations_snapshots, private.operations_export_rate_limits from public, anon, authenticated;

create or replace function private.nexora_ops_build_snapshot(p_limit integer default 5000)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  row_limit integer := greatest(1, least(coalesce(p_limit, 5000), 10000));
  storage_objects jsonb := '[]'::jsonb;
  table_name text;
  table_count bigint;
begin
  -- Never emit a partial logical snapshot. Every allowlisted table must fit
  -- within the same bounded per-table load or the operation fails closed.
  for table_name in
    select unnest(array[
      'public.profiles', 'public.projects', 'public.review_snapshots',
      'public.review_comments', 'public.change_requests', 'public.change_proposals',
      'public.workspaces', 'public.workspace_members', 'public.project_versions',
      'public.brief_templates', 'public.workspace_invites', 'public.review_invitations',
      'public.notifications', 'public.project_attachments', 'public.support_requests',
      'private.nexora_admins', 'private.account_states', 'private.platform_roles',
      'private.audit_events', 'private.app_errors', 'private.rate_limits',
      'private.application_backups', 'private.account_deletion_requests',
      'private.profile_avatar_tombstones'
    ])
  loop
    execute format('select count(*) from %I.%I', split_part(table_name, '.', 1), split_part(table_name, '.', 2)) into table_count;
    if table_count > row_limit then
      raise exception 'Operations export exceeds bounded row limit for %', table_name;
    end if;
  end loop;

  -- A Storage manifest is deliberately metadata-only. The application export
  -- must never read or pretend to remove object bytes.
  if to_regclass('storage.objects') is not null then
    execute 'select count(*) from storage.objects' into table_count;
    if table_count > row_limit then raise exception 'Operations export exceeds bounded row limit for Storage manifest'; end if;
    execute $query$
      select coalesce(jsonb_agg(jsonb_build_object(
        'bucketId', o.bucket_id,
        'objectKey', o.name,
        'ownerId', o.owner_id,
        'size', case when coalesce(o.metadata->>'size','') ~ '^[0-9]+$' then (o.metadata->>'size')::bigint else null end,
        'mimeType', o.metadata->>'mimetype',
        'metadata', o.metadata,
        'createdAt', o.created_at,
        'updatedAt', o.updated_at
      ) order by o.bucket_id, o.name), '[]'::jsonb)
      from (
        select bucket_id, name, owner_id, metadata, created_at, updated_at
        from storage.objects
        order by bucket_id, name
        limit $1
      ) o
    $query$ into storage_objects using row_limit;
  end if;

  return jsonb_build_object(
    'schema', 'nexora-application-v2',
    'version', '2',
    'app', 'nexora',
    'generatedAt', now(),
    'rowLimit', row_limit,
    'tables', jsonb_build_object(
      'public.profiles', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from (select * from public.profiles order by id limit row_limit) t), '[]'::jsonb),
      'public.projects', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from (select * from public.projects order by id limit row_limit) t), '[]'::jsonb),
      'public.review_snapshots', coalesce((select jsonb_agg(to_jsonb(t) order by t.token) from (select * from public.review_snapshots order by token limit row_limit) t), '[]'::jsonb),
      'public.review_comments', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from (select * from public.review_comments order by id limit row_limit) t), '[]'::jsonb),
      'public.change_requests', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from (select * from public.change_requests order by id limit row_limit) t), '[]'::jsonb),
      'public.change_proposals', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from (select * from public.change_proposals order by id limit row_limit) t), '[]'::jsonb),
      'public.workspaces', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from (select * from public.workspaces order by id limit row_limit) t), '[]'::jsonb),
      'public.workspace_members', coalesce((select jsonb_agg(to_jsonb(t) order by t.workspace_id, t.user_id) from (select * from public.workspace_members order by workspace_id, user_id limit row_limit) t), '[]'::jsonb),
      'public.project_versions', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from (select * from public.project_versions order by id limit row_limit) t), '[]'::jsonb),
      'public.brief_templates', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from (select * from public.brief_templates order by id limit row_limit) t), '[]'::jsonb),
      'public.workspace_invites', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from (select * from public.workspace_invites order by id limit row_limit) t), '[]'::jsonb),
      'public.review_invitations', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from (select * from public.review_invitations order by id limit row_limit) t), '[]'::jsonb),
      'public.notifications', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from (select * from public.notifications order by id limit row_limit) t), '[]'::jsonb),
      'public.project_attachments', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from (select * from public.project_attachments order by id limit row_limit) t), '[]'::jsonb),
      'public.support_requests', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from (select * from public.support_requests order by id limit row_limit) t), '[]'::jsonb),
      'private.nexora_admins', coalesce((select jsonb_agg(to_jsonb(t) order by t.user_id) from (select * from private.nexora_admins order by user_id limit row_limit) t), '[]'::jsonb),
      'private.account_states', coalesce((select jsonb_agg(to_jsonb(t) order by t.user_id) from (select * from private.account_states order by user_id limit row_limit) t), '[]'::jsonb),
      'private.platform_roles', coalesce((select jsonb_agg(to_jsonb(t) order by t.user_id) from (select * from private.platform_roles order by user_id limit row_limit) t), '[]'::jsonb),
      'private.audit_events', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from (select * from private.audit_events order by id limit row_limit) t), '[]'::jsonb),
      'private.app_errors', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from (select * from private.app_errors order by id limit row_limit) t), '[]'::jsonb),
      'private.rate_limits', coalesce((select jsonb_agg(to_jsonb(t) order by t.bucket, t.subject_id, t.window_started_at) from (select * from private.rate_limits order by bucket, subject_id, window_started_at limit row_limit) t), '[]'::jsonb),
      'private.application_backups', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from (select * from private.application_backups order by id limit row_limit) t), '[]'::jsonb),
      'private.account_deletion_requests', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from (select * from private.account_deletion_requests order by id limit row_limit) t), '[]'::jsonb),
      'private.profile_avatar_tombstones', coalesce((select jsonb_agg(to_jsonb(t) order by t.object_key) from (select * from private.profile_avatar_tombstones order by object_key limit row_limit) t), '[]'::jsonb)
    ),
    'storageManifest', jsonb_build_object(
      'objects', storage_objects,
      'note', 'metadata-only; Storage object bytes require a separate provider backup'
    )
  );
end
$$;

create or replace function public.nexora_ops_export(p_secret_hash text, p_limit integer default 5000)
returns jsonb
language plpgsql
security definer
volatile
set search_path = ''
as $$
declare
  current_count integer;
  current_window timestamptz := date_trunc('hour', now());
begin
  -- This RPC is intentionally callable only from the server-side export
  -- route. A bearer hash is not a database capability: exposing EXECUTE to
  -- anon/authenticated would let a reader bypass Vercel's encryption key.
  if not private.nexora_is_service_role() then
    raise exception 'Operations export unavailable';
  end if;
  if p_secret_hash is null or p_secret_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Operations export unavailable';
  end if;
  if not exists (select 1 from private.operations_export_secrets where id = true and secret_hash = p_secret_hash) then
    raise exception 'Operations export unavailable';
  end if;
  -- Debit only after the exact hash matches. The caller cannot choose the
  -- budget or bypass it with a different capability-shaped value.
  insert into private.operations_export_rate_limits(id, window_started_at, request_count, updated_at)
  values (true, current_window, 1, now())
  on conflict (id) do update set
    window_started_at = case
      when private.operations_export_rate_limits.window_started_at < current_window then current_window
      else private.operations_export_rate_limits.window_started_at
    end,
    request_count = case
      when private.operations_export_rate_limits.window_started_at < current_window then 1
      else private.operations_export_rate_limits.request_count + 1
    end,
    updated_at = now()
  returning request_count into current_count;
  if current_count > 3 then
    raise exception 'Operations export rate limit exceeded';
  end if;
  return private.nexora_ops_build_snapshot(p_limit);
end
$$;
revoke all on function public.nexora_ops_export(text, integer) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname='service_role') then
    grant execute on function public.nexora_ops_export(text, integer) to service_role;
  end if;
end $$;
revoke all on function private.nexora_ops_build_snapshot(integer) from public, anon, authenticated;

create or replace function private.nexora_ops_run_review_reminders()
returns integer
language plpgsql
security definer
volatile
set search_path = ''
as $$
declare inserted_count integer;
begin
  insert into public.notifications(user_id, event_type, project_id, snapshot_token, actor_id, payload)
  select i.invited_by, 'review_invite', i.project_id, i.snapshot_token, null,
    jsonb_build_object(
      'source', 'review_due',
      'invitationId', i.id,
      'dueAt', i.due_at,
      'title', 'Review reminder',
      'message', 'A client review is due within the next day.'
    )
  from public.review_invitations i
  where i.status in ('pending','accepted')
    and i.invited_by is not null
    and i.due_at is not null
    and i.due_at between now() - interval '7 days' and now() + interval '24 hours'
    and not exists (
      select 1 from public.notifications n
      where n.user_id = i.invited_by
        and n.event_type = 'review_invite'
        and n.payload->>'source' = 'review_due'
        and n.payload->>'invitationId' = i.id::text
    );
  get diagnostics inserted_count = row_count;
  return inserted_count;
end
$$;
revoke all on function private.nexora_ops_run_review_reminders() from public, anon, authenticated;

create or replace function private.nexora_ops_run_daily_snapshot(p_limit integer default 5000, p_retention integer default 14)
returns uuid
language plpgsql
security definer
volatile
set search_path = ''
as $$
declare
  payload jsonb;
  snapshot_id uuid;
begin
  if p_retention < 1 or p_retention > 90 then raise exception 'Invalid snapshot retention'; end if;
  payload := private.nexora_ops_build_snapshot(p_limit);
  insert into private.operations_snapshots(schema_name, payload, sha256, source)
  values ('nexora-application-v2', payload, encode(extensions.digest(convert_to(payload::text, 'utf8'), 'sha256'), 'hex'), 'pg_cron')
  returning id into snapshot_id;
  delete from private.operations_snapshots
  where id in (
    select id from private.operations_snapshots
    order by created_at desc
    offset p_retention
  );
  return snapshot_id;
end
$$;
revoke all on function private.nexora_ops_run_daily_snapshot(integer, integer) from public, anon, authenticated;
