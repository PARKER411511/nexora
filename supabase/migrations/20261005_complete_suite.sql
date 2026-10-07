-- Nexora complete suite extension.
-- This migration is forward-only and keeps the original owner-only schema
-- usable while adding optional team workspaces, immutable versions, review
-- invitations, notifications, attachments metadata, rate limits, and audit
-- records. Email delivery intentionally remains unconfigured.

create schema if not exists private;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.workspaces (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  personal boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists workspaces_one_personal_per_owner
  on public.workspaces(owner_id) where personal;

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  role text not null check (role in ('owner','admin','editor','viewer')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index if not exists workspace_members_user_idx on public.workspace_members(user_id, workspace_id);

alter table public.projects add column if not exists workspace_id uuid references public.workspaces(id) on delete restrict;
alter table public.projects add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.projects add column if not exists archived boolean not null default false;
alter table public.projects add column if not exists tags text[] not null default '{}';
alter table public.projects add column if not exists deadline date;
alter table public.projects add column if not exists version integer not null default 1;
alter table public.projects add column if not exists updated_by uuid references auth.users(id) on delete set null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'projects_tags_bounds' and conrelid = 'public.projects'::regclass) then
    alter table public.projects add constraint projects_tags_bounds check (coalesce(array_length(tags, 1), 0) <= 20);
  end if;
end $$;

create table if not exists public.project_versions (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  version integer not null check (version > 0),
  project_json jsonb not null,
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (project_id, version)
);
create index if not exists project_versions_project_idx on public.project_versions(project_id, version desc);

create table if not exists public.brief_templates (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  brief text not null check (char_length(brief) between 24 and 20000),
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.brief_templates alter column owner_id drop not null;
alter table public.brief_templates add column if not exists created_by uuid references auth.users(id) on delete set null;
do $$ declare constraint_name text; begin
  select conname into constraint_name from pg_constraint where conrelid='public.brief_templates'::regclass and contype='f' and pg_get_constraintdef(oid) like '%owner_id%';
  if constraint_name is not null then execute format('alter table public.brief_templates drop constraint %I',constraint_name); end if;
  if not exists (select 1 from pg_constraint where conname = 'brief_templates_owner_fk' and conrelid = 'public.brief_templates'::regclass) then
    alter table public.brief_templates add constraint brief_templates_owner_fk foreign key(owner_id) references auth.users(id) on delete set null;
  end if;
end $$;
update public.brief_templates t set owner_id=w.owner_id from public.workspaces w where t.workspace_id=w.id and t.workspace_id is not null;

create table if not exists public.workspace_invites (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null check (char_length(email) between 3 and 320),
  role text not null check (role in ('admin','editor','viewer')),
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  invited_by uuid not null references auth.users(id) on delete restrict,
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  email_delivery_status text not null default 'undelivered' check (email_delivery_status in ('undelivered','queued','sent','failed')),
  created_at timestamptz not null default now()
);
create index if not exists workspace_invites_lookup_idx on public.workspace_invites(workspace_id, email, expires_at);

create table if not exists public.review_invitations (
  id uuid primary key default extensions.gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  snapshot_token text not null references public.review_snapshots(token) on delete cascade,
  invited_email text not null check (char_length(invited_email) between 3 and 320),
  invited_by uuid not null references auth.users(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','accepted','responded','revoked')),
  due_at timestamptz,
  token_hash bytea unique,
  email_delivery_status text not null default 'undelivered' check (email_delivery_status in ('undelivered','queued','sent','failed')),
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.review_comments add column if not exists author_id uuid references auth.users(id) on delete set null;
alter table public.review_comments add column if not exists author_email text;
alter table public.review_comments add column if not exists parent_id bigint references public.review_comments(id) on delete cascade;
alter table public.review_comments add column if not exists mentioned_user_ids uuid[] not null default '{}';
alter table public.change_requests add column if not exists requester_id uuid references auth.users(id) on delete set null;
alter table public.change_proposals add column if not exists decided_by_id uuid references auth.users(id) on delete set null;
create index if not exists review_comments_thread_idx on public.review_comments(snapshot_token, parent_id, id);

create table if not exists public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('feedback','approval','change_request','proposal','mention','workspace_invite','review_invite','system')),
  project_id uuid references public.projects(id) on delete cascade,
  snapshot_token text references public.review_snapshots(token) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  payload jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications(user_id, read_at, created_at desc);

create table if not exists public.project_attachments (
  id uuid primary key default extensions.gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  snapshot_token text references public.review_snapshots(token) on delete cascade,
  owner_id uuid references auth.users(id) on delete set null,
  uploaded_by uuid references auth.users(id) on delete set null,
  object_key text not null unique,
  original_name text not null check (char_length(original_name) between 1 and 180),
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp','application/pdf','text/plain','text/markdown','application/zip')),
  byte_size bigint not null check (byte_size between 1 and 3145728),
  created_at timestamptz not null default now()
);
create index if not exists project_attachments_project_idx on public.project_attachments(project_id, snapshot_token);
alter table public.project_attachments alter column owner_id drop not null;
alter table public.project_attachments add column if not exists delete_requested_at timestamptz;
alter table public.project_attachments add column if not exists delete_requested_by uuid references auth.users(id) on delete set null;

create table if not exists private.account_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  suspended boolean not null default false,
  reason text,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);

create table if not exists private.platform_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('platform_owner','operator','viewer')),
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists private.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists audit_events_created_idx on private.audit_events(created_at desc);

create table if not exists private.app_errors (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  request_id text,
  source text not null,
  message text not null,
  context jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists private.rate_limits (
  bucket text not null,
  subject_id uuid not null references auth.users(id) on delete cascade,
  window_started_at timestamptz not null,
  count integer not null default 0,
  primary key (bucket, subject_id, window_started_at)
);

create table if not exists private.application_backups (
  id uuid primary key default extensions.gen_random_uuid(),
  version text not null unique,
  sha256 text not null check (char_length(sha256)=64),
  manifest jsonb not null default '{}',
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.support_requests (
  id uuid primary key default extensions.gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  subject text not null check (char_length(btrim(subject)) between 1 and 160),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  status text not null default 'open' check (status in ('open','in_progress','resolved','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.project_versions enable row level security;
alter table public.brief_templates enable row level security;
alter table public.workspace_invites enable row level security;
alter table public.review_invitations enable row level security;
alter table public.notifications enable row level security;
alter table public.project_attachments enable row level security;
alter table public.support_requests enable row level security;
alter table private.account_states enable row level security;
alter table private.platform_roles enable row level security;
alter table private.audit_events enable row level security;
alter table private.app_errors enable row level security;
alter table private.rate_limits enable row level security;
alter table private.application_backups enable row level security;

create or replace function public.nexora_is_suspended()
returns boolean language sql security definer stable set search_path = '' as $$
  select auth.uid() is null or exists (select 1 from private.account_states s where s.user_id = auth.uid() and s.suspended)
$$;

create or replace function public.nexora_require_active_actor()
returns boolean language plpgsql security definer stable set search_path = '' as $$
begin
  if auth.uid() is null or exists (select 1 from private.account_states s where s.user_id=auth.uid() and s.suspended) then raise exception 'Account is unavailable'; end if;
  return true;
end $$;

create or replace function public.nexora_workspace_role(p_workspace_id uuid)
returns text language sql security definer stable set search_path = '' as $$
  select case when public.nexora_is_suspended() then null else m.role end
  from public.workspace_members m where m.workspace_id = p_workspace_id and m.user_id = auth.uid()
$$;

create or replace function public.nexora_can_access_project(p_project_id uuid, p_min_role text default 'viewer')
returns boolean language plpgsql security definer stable set search_path = '' as $$
declare p public.projects; role_name text;
begin
  if public.nexora_is_suspended() then return false; end if;
  select * into p from public.projects where id = p_project_id;
  if not found then return false; end if;
  if p.workspace_id is null then return p.owner_id = auth.uid(); end if;
  role_name := public.nexora_workspace_role(p.workspace_id);
  return case p_min_role
    when 'viewer' then role_name in ('owner','admin','editor','viewer')
    when 'editor' then role_name in ('owner','admin','editor')
    when 'admin' then role_name in ('owner','admin')
    when 'owner' then role_name = 'owner'
    else false end;
end $$;

revoke all on function public.nexora_is_suspended(), public.nexora_require_active_actor(), public.nexora_workspace_role(uuid), public.nexora_can_access_project(uuid,text) from public, anon;
grant execute on function public.nexora_is_suspended(), public.nexora_require_active_actor(), public.nexora_workspace_role(uuid), public.nexora_can_access_project(uuid,text) to authenticated;

create or replace function public.nexora_allow_request(p_operation text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare started timestamptz := to_timestamp(floor(extract(epoch from now()) / 60) * 60); current_count integer; operation_limit integer;
begin
  if auth.uid() is null or public.nexora_is_suspended() then return false; end if;
  operation_limit := case p_operation when 'project_create' then 20 when 'analyze' then 30 when 'sharing' then 20 when 'account_action' then 5 when 'notification' then 60 else 10 end;
  insert into private.rate_limits(bucket,subject_id,window_started_at,count) values(p_operation,auth.uid(),started,1) on conflict (bucket,subject_id,window_started_at) do update set count=private.rate_limits.count+1 returning count into current_count;
  return current_count <= operation_limit;
end $$;
revoke all on function public.nexora_allow_request(text) from public, anon;
grant execute on function public.nexora_allow_request(text) to authenticated;

-- Storage objects are registered before upload. The generated key is returned
-- by this RPC, so clients cannot choose another user's prefix or attach a file
-- to an unrelated project. The storage INSERT policy below requires this exact
-- pending row and matching metadata; an unreferenced object is rejected.
create or replace function public.nexora_register_attachment(
  p_project_id uuid,
  p_original_name text,
  p_mime_type text,
  p_byte_size bigint,
  p_snapshot_token text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.projects; attachment public.project_attachments; object_key text;
begin
  perform public.nexora_require_active_actor();
  if not public.nexora_can_access_project(p_project_id,'editor') then raise exception 'Project not found'; end if;
  select * into p from public.projects where id=p_project_id for update;
  if p.archived then raise exception 'Restore the archived project before adding attachments'; end if;
  if p_mime_type not in ('image/jpeg','image/png','image/webp','application/pdf','text/plain','text/markdown','application/zip') then raise exception 'Unsupported attachment type'; end if;
  if p_byte_size is null or p_byte_size not between 1 and 3145728 then raise exception 'Attachment size must be between 1 byte and 3 MB'; end if;
  if p_original_name is null or char_length(p_original_name) not between 1 and 180
    or position('/' in p_original_name) > 0 or position('\\' in p_original_name) > 0
    or position('<' in p_original_name) > 0 or position('>' in p_original_name) > 0
    or position(':' in p_original_name) > 0 or position('"' in p_original_name) > 0
    or position('|' in p_original_name) > 0 or position('?' in p_original_name) > 0
    or position('*' in p_original_name) > 0 then raise exception 'Invalid attachment filename'; end if;
  if p_snapshot_token is not null and not exists (select 1 from public.review_snapshots s where s.token=p_snapshot_token and s.project_id=p_project_id and s.status<>'revoked') then raise exception 'Snapshot is not available for attachments'; end if;
  object_key := auth.uid()::text || '/' || p_project_id::text || '/' || encode(extensions.gen_random_bytes(18),'hex');
  insert into public.project_attachments(project_id,snapshot_token,owner_id,uploaded_by,object_key,original_name,mime_type,byte_size)
    values(p_project_id,p_snapshot_token,p.owner_id,auth.uid(),object_key,btrim(p_original_name),p_mime_type,p_byte_size)
    returning * into attachment;
  return jsonb_build_object('id',attachment.id,'projectId',attachment.project_id,'snapshotToken',attachment.snapshot_token,'objectKey',attachment.object_key,'originalName',attachment.original_name,'mimeType',attachment.mime_type,'byteSize',attachment.byte_size);
end $$;

create or replace function public.nexora_delete_attachment(p_attachment_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.project_attachments;
begin
  perform public.nexora_require_active_actor();
  select * into a from public.project_attachments where id=p_attachment_id for update;
  if not found or not public.nexora_can_access_project(a.project_id,'editor') then raise exception 'Attachment not found'; end if;
  update public.project_attachments set delete_requested_at=coalesce(delete_requested_at,now()),delete_requested_by=auth.uid() where id=p_attachment_id;
  return jsonb_build_object('id',a.id,'objectKey',a.object_key,'pending',true);
end $$;

revoke all on function public.nexora_register_attachment(uuid,text,text,bigint,text), public.nexora_delete_attachment(uuid) from public, anon;
grant execute on function public.nexora_register_attachment(uuid,text,text,bigint,text), public.nexora_delete_attachment(uuid) to authenticated;

-- Backfill existing owner projects into personal workspaces and immutable v1.
insert into public.workspaces(owner_id, name, personal)
select distinct p.owner_id, 'Personal workspace', true
from public.projects p
where not exists (select 1 from public.workspaces w where w.owner_id = p.owner_id and w.personal);
insert into public.workspace_members(workspace_id, user_id, role)
select w.id, w.owner_id, 'owner' from public.workspaces w
where not exists (select 1 from public.workspace_members m where m.workspace_id = w.id and m.user_id = w.owner_id);
update public.projects p set workspace_id = w.id, updated_by = p.owner_id
from public.workspaces w where w.owner_id = p.owner_id and w.personal and p.workspace_id is null;
update public.projects set created_by = owner_id where created_by is null;
insert into public.project_versions(project_id, version, project_json, changed_by, created_at)
select p.id, 1, jsonb_build_object('id',p.id,'title',p.title,'client',p.client,'brief',p.brief,'analysis',p.analysis,'scope',p.scope,'status',p.status,'reviewToken',p.review_token,'approval',p.approval,'createdAt',p.created_at,'updatedAt',p.updated_at), p.owner_id, p.created_at
from public.projects p where not exists (select 1 from public.project_versions v where v.project_id=p.id);

drop policy if exists projects_owner_select on public.projects;
drop policy if exists projects_workspace_select on public.projects;
create policy projects_workspace_select on public.projects for select to authenticated using (public.nexora_can_access_project(id, 'viewer'));
drop policy if exists snapshots_owner_select on public.review_snapshots;
drop policy if exists snapshots_workspace_select on public.review_snapshots;
create policy snapshots_workspace_select on public.review_snapshots for select to authenticated using (public.nexora_can_access_project(project_id, 'viewer'));
drop policy if exists comments_owner_select on public.review_comments;
drop policy if exists comments_workspace_select on public.review_comments;
create policy comments_workspace_select on public.review_comments for select to authenticated using (exists (select 1 from public.review_snapshots s where s.token=snapshot_token and public.nexora_can_access_project(s.project_id, 'viewer')));
drop policy if exists requests_owner_select on public.change_requests;
drop policy if exists requests_workspace_select on public.change_requests;
create policy requests_workspace_select on public.change_requests for select to authenticated using (public.nexora_can_access_project(project_id, 'viewer'));
drop policy if exists proposals_owner_select on public.change_proposals;
drop policy if exists proposals_workspace_select on public.change_proposals;
create policy proposals_workspace_select on public.change_proposals for select to authenticated using (exists (select 1 from public.change_requests r where r.id=request_id and public.nexora_can_access_project(r.project_id, 'viewer')));
drop policy if exists workspaces_member_select on public.workspaces;
drop policy if exists workspaces_member_select on public.workspaces;
create policy workspaces_member_select on public.workspaces for select to authenticated using (exists (select 1 from public.workspace_members m where m.workspace_id=id and m.user_id=auth.uid()));
drop policy if exists workspace_members_self_or_admin on public.workspace_members;
drop policy if exists workspace_members_self_or_admin on public.workspace_members;
create policy workspace_members_self_or_admin on public.workspace_members for select to authenticated using (user_id=auth.uid() or public.nexora_workspace_role(workspace_id) in ('owner','admin'));
drop policy if exists versions_project_select on public.project_versions;
drop policy if exists versions_project_select on public.project_versions;
create policy versions_project_select on public.project_versions for select to authenticated using (public.nexora_can_access_project(project_id, 'viewer'));
drop policy if exists templates_owner_select on public.brief_templates;
drop policy if exists templates_owner_select on public.brief_templates;
create policy templates_owner_select on public.brief_templates for select to authenticated using (owner_id=auth.uid() or (workspace_id is not null and public.nexora_workspace_role(workspace_id) is not null));
drop policy if exists notifications_self_select on public.notifications;
drop policy if exists notifications_self_select on public.notifications;
create policy notifications_self_select on public.notifications for select to authenticated using (user_id=auth.uid());
drop policy if exists notifications_self_update on public.notifications;
drop policy if exists notifications_self_update on public.notifications;
create policy notifications_self_update on public.notifications for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
drop policy if exists attachment_project_select on public.project_attachments;
drop policy if exists attachment_project_select on public.project_attachments;
create policy attachment_project_select on public.project_attachments for select to authenticated using (public.nexora_can_access_project(project_id, 'viewer'));
drop policy if exists support_self_select on public.support_requests;
drop policy if exists support_self_select on public.support_requests;
create policy support_self_select on public.support_requests for select to authenticated using (requester_id=auth.uid());
drop policy if exists support_self_insert on public.support_requests;
drop policy if exists support_self_insert on public.support_requests;
create policy support_self_insert on public.support_requests for insert to authenticated with check (requester_id=auth.uid());

create or replace function private.nexora_stamp_review_identity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.nexora_require_active_actor();
  new.author_id := auth.uid();
  select coalesce(email,'') into new.author_email from auth.users where id=auth.uid();
  return new;
end $$;
drop trigger if exists nexora_stamp_review_identity on public.review_comments;
create trigger nexora_stamp_review_identity before insert on public.review_comments for each row execute function private.nexora_stamp_review_identity();

create or replace function private.nexora_stamp_change_request_identity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.nexora_require_active_actor();
  new.requester_id := auth.uid();
  return new;
end $$;
drop trigger if exists nexora_stamp_change_request_identity on public.change_requests;
create trigger nexora_stamp_change_request_identity before insert on public.change_requests for each row execute function private.nexora_stamp_change_request_identity();

create or replace function private.nexora_notify_review_comment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare snapshot_project uuid; project_owner uuid;
begin
  select s.project_id, p.owner_id into snapshot_project, project_owner from public.review_snapshots s join public.projects p on p.id=s.project_id where s.token=new.snapshot_token;
  if project_owner is not null then
    insert into public.notifications(user_id,event_type,project_id,snapshot_token,actor_id,payload) values(project_owner,case when new.action='approval' then 'approval' else 'feedback' end,snapshot_project,new.snapshot_token,new.author_id,jsonb_build_object('title',case when new.action='approval' then 'Scope approved' else 'New review feedback' end,'message',left(new.comment,180),'commentId',new.id));
  end if;
  return new;
end $$;
drop trigger if exists nexora_notify_review_comment on public.review_comments;
create trigger nexora_notify_review_comment after insert on public.review_comments for each row execute function private.nexora_notify_review_comment();

-- Guard legacy security-definer entry points without mutating the immutable
-- baseline migration. The legacy implementations remain available only to
-- these wrappers and are never executable by API roles directly.
do $$ begin
  if to_regprocedure('public.nexora_share_project(uuid)') is not null and to_regprocedure('public.nexora_share_project_legacy(uuid)') is null then alter function public.nexora_share_project(uuid) rename to nexora_share_project_legacy; end if;
  if to_regprocedure('public.nexora_project_history(uuid)') is not null and to_regprocedure('public.nexora_project_history_legacy(uuid)') is null then alter function public.nexora_project_history(uuid) rename to nexora_project_history_legacy; end if;
  -- Change proposals are implemented by the guarded function below. Keep the
  -- original function name so upgrades never depend on a fragile rename.
  if to_regprocedure('public.nexora_get_review(text)') is not null and to_regprocedure('public.nexora_get_review_legacy(text)') is null then alter function public.nexora_get_review(text) rename to nexora_get_review_legacy; end if;
  if to_regprocedure('public.nexora_review_action(text,jsonb)') is not null and to_regprocedure('public.nexora_review_action_legacy(text,jsonb)') is null then alter function public.nexora_review_action(text,jsonb) rename to nexora_review_action_legacy; end if;
  if to_regprocedure('public.nexora_is_admin()') is not null and to_regprocedure('public.nexora_is_admin_legacy()') is null then alter function public.nexora_is_admin() rename to nexora_is_admin_legacy; end if;
  if to_regprocedure('public.nexora_get_profile()') is not null and to_regprocedure('public.nexora_get_profile_legacy()') is null then alter function public.nexora_get_profile() rename to nexora_get_profile_legacy; end if;
  if to_regprocedure('public.nexora_update_profile(jsonb)') is not null and to_regprocedure('public.nexora_update_profile_legacy(jsonb)') is null then alter function public.nexora_update_profile(jsonb) rename to nexora_update_profile_legacy; end if;
end $$;

create or replace function public.nexora_share_project(p_project_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.projects; token text := encode(extensions.gen_random_bytes(32),'hex');
begin
  perform public.nexora_require_active_actor();
  if not public.nexora_allow_request('sharing') then raise exception 'Sharing is temporarily rate limited'; end if;
  select * into p from public.projects where id=p_project_id and public.nexora_can_access_project(id,'editor') for update;
  if not found then raise exception 'Project not found'; end if;
  if p.archived then raise exception 'Restore the archived project before sharing'; end if;
  if p.status='approved' then raise exception 'Approved scopes are locked and cannot be reshared'; end if;
  if p.status='shared' and p.review_token is not null then return public.nexora_get_project(p_project_id); end if;
  update public.review_snapshots set status='revoked' where project_id=p_project_id and status<>'approved';
  update public.projects set review_token=token,status='shared',updated_at=now(),updated_by=auth.uid() where id=p_project_id;
  insert into public.review_snapshots(token,project_id,owner_id,project_json,status) select token,id,owner_id,jsonb_build_object('id',id,'title',title,'client',client,'brief',brief,'analysis',analysis,'scope',scope,'status',status,'reviewToken',token,'createdAt',created_at,'updatedAt',updated_at),'shared' from public.projects where id=p_project_id;
  return public.nexora_get_project(p_project_id);
end $$;

create or replace function public.nexora_project_history(p_project_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  perform public.nexora_require_active_actor();
  if not public.nexora_can_access_project(p_project_id,'viewer') then raise exception 'Project not found'; end if;
  select jsonb_build_object(
    'responses', coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'comment',c.comment,'action',c.action,'createdAt',c.created_at,'token',c.snapshot_token,'snapshotCreatedAt',s.created_at,'snapshotStatus',case when s.status='approved' then 'approved' when s.status='revoked' then 'revoked' when p.review_token=c.snapshot_token then 'current' else 'superseded' end) order by c.id desc) from public.review_comments c join public.review_snapshots s on s.token=c.snapshot_token where s.project_id=p_project_id),'[]'::jsonb),
    'changeRequests', coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'projectId',r.project_id,'token',r.snapshot_token,'requesterName',r.requester_name,'title',r.title,'details',r.details,'status',r.status,'createdAt',r.created_at,'updatedAt',r.updated_at,'proposals',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'requestId',q.request_id,'version',q.version,'title',q.title,'details',q.details,'affectedDeliverables',q.affected_deliverables,'priceAdjustment',q.price_adjustment,'currency',q.currency,'timelineImpact',q.timeline_impact,'rationale',q.rationale,'status',q.status,'createdAt',q.created_at,'decidedBy',q.decided_by,'decisionComment',q.decision_comment,'decidedAt',q.decided_at) order by q.version) from public.change_proposals q where q.request_id=r.id),'[]'::jsonb)) order by r.created_at desc) from public.change_requests r where r.project_id=p_project_id),'[]'::jsonb)
  ) into result from public.projects p where p.id=p_project_id;
  return result;
end $$;

create or replace function public.nexora_get_review(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare project_id uuid; archived boolean;
begin
  perform public.nexora_require_active_actor();
  select s.project_id,p.archived into project_id,archived from public.review_snapshots s join public.projects p on p.id=s.project_id where s.token=p_token and s.status<>'revoked';
  if project_id is null or archived then raise exception 'Review link not found or no longer active'; end if;
  return public.nexora_get_review_legacy(p_token);
end $$;

create or replace function public.nexora_review_action(p_token text,p_action jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare project_id uuid; archived boolean;
begin
  perform public.nexora_require_active_actor();
  if not public.nexora_allow_request('review_action') then raise exception 'Review actions are temporarily rate limited'; end if;
  select s.project_id,p.archived into project_id,archived from public.review_snapshots s join public.projects p on p.id=s.project_id where s.token=p_token and s.status<>'revoked';
  if project_id is null or archived then raise exception 'Review link not found or no longer active'; end if;
  return public.nexora_review_action_legacy(p_token,p_action);
end $$;

create or replace function public.nexora_create_change_proposal(p_project_id uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.change_requests; latest public.change_proposals; p public.projects; next_version integer;
begin
  perform public.nexora_require_active_actor();
  if not public.nexora_can_access_project(p_project_id,'admin') then raise exception 'Project not found'; end if;
  if not public.nexora_allow_request('proposal') then raise exception 'Proposal actions are temporarily rate limited'; end if;
  select * into p from public.projects where id=p_project_id for update;
  if p.status <> 'approved' or p.archived then raise exception 'Proposals can only be written against an approved active scope'; end if;
  if p_input is null or jsonb_typeof(p_input) is distinct from 'object' or not (p_input ?& array['requestId','title','details','affectedDeliverables','priceAdjustment','currency','timelineImpact','rationale']) then raise exception 'Malformed proposal'; end if;
  if jsonb_typeof(p_input->'requestId') is distinct from 'string' or char_length(btrim(coalesce(p_input->>'requestId',''))) = 0 or jsonb_typeof(p_input->'title') is distinct from 'string' or char_length(btrim(coalesce(p_input->>'title',''))) not between 1 and 160 or jsonb_typeof(p_input->'details') is distinct from 'string' or char_length(btrim(coalesce(p_input->>'details',''))) not between 1 and 4000 or jsonb_typeof(p_input->'timelineImpact') is distinct from 'string' or char_length(btrim(coalesce(p_input->>'timelineImpact',''))) not between 1 and 500 or jsonb_typeof(p_input->'rationale') is distinct from 'string' or char_length(btrim(coalesce(p_input->>'rationale',''))) not between 1 and 2000 or jsonb_typeof(p_input->'currency') is distinct from 'string' or not (p_input->>'currency' ~ '^[A-Z]{3}$') or jsonb_typeof(p_input->'priceAdjustment') is distinct from 'number' or not (p_input->>'priceAdjustment' ~ '^-?[0-9]+(\.[0-9]{1,2})?$') or abs((p_input->>'priceAdjustment')::numeric) > 10000000 or jsonb_typeof(p_input->'affectedDeliverables') is distinct from 'array' or jsonb_array_length(p_input->'affectedDeliverables') > 30 or exists(select 1 from jsonb_array_elements(p_input->'affectedDeliverables') e where jsonb_typeof(e) is distinct from 'string' or char_length(btrim(e #>> '{}')) not between 1 and 300) then raise exception 'Malformed proposal'; end if;
  select * into r from public.change_requests where id=(p_input->>'requestId')::uuid and project_id=p_project_id for update;
  if not found then raise exception 'Change request not found for this project'; end if;
  select * into latest from public.change_proposals where request_id=r.id order by version desc limit 1;
  if latest.status='sent' then raise exception 'This change request already has a proposal waiting for a decision'; end if;
  if r.status='accepted' then raise exception 'This change request was accepted'; end if;
  next_version := coalesce(latest.version,0)+1;
  insert into public.change_proposals(request_id,version,title,details,affected_deliverables,price_adjustment,currency,timeline_impact,rationale) values(r.id,next_version,p_input->>'title',p_input->>'details',p_input->'affectedDeliverables',(p_input->>'priceAdjustment')::numeric,p_input->>'currency',p_input->>'timelineImpact',p_input->>'rationale');
  update public.change_requests set status='proposed',updated_at=now() where id=r.id;
  return public.nexora_project_history(p_project_id);
exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'Malformed proposal';
end $$;

create or replace function public.nexora_is_admin()
returns boolean language sql security definer stable set search_path = '' as $$ select not public.nexora_is_suspended() and public.nexora_is_admin_legacy() $$;

create or replace function public.nexora_get_profile()
returns jsonb language plpgsql security definer stable set search_path = '' as $$
begin perform public.nexora_require_active_actor(); return public.nexora_get_profile_legacy(); end $$;

create or replace function public.nexora_update_profile(p_profile jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin perform public.nexora_require_active_actor(); return public.nexora_update_profile_legacy(p_profile); end $$;

revoke all on function public.nexora_share_project_legacy(uuid), public.nexora_project_history_legacy(uuid), public.nexora_get_review_legacy(text), public.nexora_review_action_legacy(text,jsonb), public.nexora_is_admin_legacy(), public.nexora_get_profile_legacy(), public.nexora_update_profile_legacy(jsonb) from public, anon, authenticated;
revoke all on function public.nexora_is_admin(), public.nexora_get_profile(), public.nexora_update_profile(jsonb), public.nexora_project_history(uuid), public.nexora_share_project(uuid), public.nexora_get_review(text), public.nexora_review_action(text,jsonb), public.nexora_create_change_proposal(uuid,jsonb) from public, anon;
grant execute on function public.nexora_is_admin(), public.nexora_get_profile(), public.nexora_update_profile(jsonb), public.nexora_project_history(uuid), public.nexora_share_project(uuid), public.nexora_get_review(text), public.nexora_review_action(text,jsonb), public.nexora_create_change_proposal(uuid,jsonb) to authenticated;

revoke all on public.workspaces, public.workspace_members, public.project_versions, public.brief_templates, public.workspace_invites, public.review_invitations, public.notifications, public.project_attachments, public.support_requests from public, anon, authenticated;
grant select on public.workspaces, public.workspace_members, public.project_versions, public.brief_templates, public.notifications, public.project_attachments, public.support_requests to authenticated;
grant update (read_at) on public.notifications to authenticated;
revoke all on private.account_states, private.platform_roles, private.audit_events, private.app_errors, private.rate_limits, private.application_backups from public, anon, authenticated;

create or replace function public.nexora_list_workspaces()
returns setof jsonb language sql security definer stable set search_path = '' as $$
  select jsonb_build_object('id',w.id,'name',w.name,'personal',w.personal,'role',m.role,'createdAt',w.created_at,'updatedAt',w.updated_at)
  from public.workspaces w join public.workspace_members m on m.workspace_id=w.id and m.user_id=auth.uid()
  where not public.nexora_is_suspended() order by w.personal desc, w.updated_at desc
$$;

create or replace function public.nexora_create_workspace(p_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare w public.workspaces;
begin
  perform public.nexora_require_active_actor();
  if char_length(btrim(coalesce(p_name,''))) not between 1 and 120 then raise exception 'Workspace name must be 1 to 120 characters'; end if;
  insert into public.workspaces(owner_id,name) values (auth.uid(),btrim(p_name)) returning * into w;
  insert into public.workspace_members(workspace_id,user_id,role) values(w.id,auth.uid(),'owner');
  return jsonb_build_object('id',w.id,'name',w.name,'personal',false,'role','owner','createdAt',w.created_at,'updatedAt',w.updated_at);
end $$;

create or replace function public.nexora_get_or_create_personal_workspace()
returns uuid language plpgsql security definer set search_path = '' as $$
declare workspace_id uuid;
begin
  select id into workspace_id from public.workspaces where owner_id=auth.uid() and personal for update;
  if workspace_id is null then
    insert into public.workspaces(owner_id,name,personal) values(auth.uid(),'Personal workspace',true) returning id into workspace_id;
    insert into public.workspace_members(workspace_id,user_id,role) values(workspace_id,auth.uid(),'owner');
  end if;
  return workspace_id;
end $$;

-- Re-declare the existing RPCs with workspace authorization and version writes.
create or replace function public.nexora_list_projects()
returns setof jsonb language sql security definer stable set search_path = '' as $$
  select jsonb_build_object('id',p.id,'title',p.title,'client',p.client,'brief',p.brief,'analysis',p.analysis,'scope',p.scope,'status',p.status,'reviewToken',p.review_token,'approval',p.approval,'createdAt',p.created_at,'updatedAt',p.updated_at,'workspaceId',p.workspace_id,'archived',p.archived,'tags',p.tags,'deadline',p.deadline,'version',p.version,'role',coalesce(public.nexora_workspace_role(p.workspace_id),'owner'))
  from public.projects p where public.nexora_can_access_project(p.id,'viewer') order by p.updated_at desc limit 100
$$;

create or replace function public.nexora_get_project(p_project_id uuid)
returns jsonb language sql security definer stable set search_path = '' as $$
  select jsonb_build_object('id',p.id,'title',p.title,'client',p.client,'brief',p.brief,'analysis',p.analysis,'scope',p.scope,'status',p.status,'reviewToken',p.review_token,'approval',p.approval,'createdAt',p.created_at,'updatedAt',p.updated_at,'workspaceId',p.workspace_id,'archived',p.archived,'tags',p.tags,'deadline',p.deadline,'version',p.version,'role',coalesce(public.nexora_workspace_role(p.workspace_id),'owner'))
  from public.projects p where p.id=p_project_id and public.nexora_can_access_project(p.id,'viewer')
$$;

create or replace function public.nexora_create_project(p_project jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.projects; workspace_id uuid; requested_workspace uuid; workspace_owner uuid; now_at timestamptz := now();
begin
  perform public.nexora_require_active_actor();
  if not public.nexora_allow_request('project_create') then raise exception 'Project creation is temporarily rate limited'; end if;
  if public.nexora_valid_project_json(p_project) is not true then raise exception 'Malformed project'; end if;
  workspace_id := public.nexora_get_or_create_personal_workspace();
  if jsonb_typeof(p_project->'workspaceId')='string' then requested_workspace := (p_project->>'workspaceId')::uuid; if public.nexora_workspace_role(requested_workspace) in ('owner','admin','editor') then workspace_id := requested_workspace; end if; end if;
  select owner_id into workspace_owner from public.workspaces where id=workspace_id;
  insert into public.projects(owner_id,workspace_id,created_by,title,client,brief,analysis,scope,status,tags,deadline,updated_by) values(coalesce(workspace_owner,auth.uid()),workspace_id,auth.uid(),p_project->>'title',p_project->>'client',p_project->>'brief',p_project->'analysis',p_project->'scope','draft',case when jsonb_typeof(p_project->'tags')='array' then array(select jsonb_array_elements_text(p_project->'tags')) else '{}' end,case when jsonb_typeof(p_project->'deadline')='string' and p_project->>'deadline'<>'' then (p_project->>'deadline')::date else null end,auth.uid()) returning * into p;
  insert into public.project_versions(project_id,version,project_json,changed_by,created_at) values(p.id,1,jsonb_build_object('id',p.id,'title',p.title,'client',p.client,'brief',p.brief,'analysis',p.analysis,'scope',p.scope,'status',p.status,'createdAt',p.created_at,'updatedAt',p.updated_at),auth.uid(),now_at);
  return public.nexora_get_project(p.id);
end $$;

create or replace function public.nexora_update_project(p_project_id uuid,p_project jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.projects; old public.projects; next_version integer;
begin
  if auth.uid() is null or public.nexora_is_suspended() then raise exception 'Account is unavailable'; end if;
  if not public.nexora_allow_request('project_update') then raise exception 'Project updates are temporarily rate limited'; end if;
  select * into old from public.projects where id=p_project_id and public.nexora_can_access_project(id,'editor') for update;
  if not found then raise exception 'Project not found'; end if;
  if old.archived then raise exception 'Archived projects must be restored before editing'; end if;
  if old.status='approved' then raise exception 'Approved scopes are locked'; end if;
  if public.nexora_valid_project_json(p_project) is not true then raise exception 'Malformed project'; end if;
  if old.title=p_project->>'title' and old.client=p_project->>'client' and old.brief=p_project->>'brief' and old.analysis=p_project->'analysis' and old.scope=p_project->'scope' then return public.nexora_get_project(p_project_id); end if;
  next_version := old.version + 1;
  if old.review_token is not null then update public.review_snapshots set status='revoked' where token=old.review_token and status<>'approved'; end if;
  update public.projects set title=p_project->>'title',client=p_project->>'client',brief=p_project->>'brief',analysis=p_project->'analysis',scope=p_project->'scope',tags=case when jsonb_typeof(p_project->'tags')='array' then array(select jsonb_array_elements_text(p_project->'tags')) else tags end,deadline=case when jsonb_typeof(p_project->'deadline')='string' and p_project->>'deadline'<>'' then (p_project->>'deadline')::date else deadline end,status='draft',review_token=null,updated_at=now(),updated_by=auth.uid(),version=next_version where id=p_project_id returning * into p;
  insert into public.project_versions(project_id,version,project_json,changed_by) values(p.id,p.version,jsonb_build_object('id',p.id,'title',p.title,'client',p.client,'brief',p.brief,'analysis',p.analysis,'scope',p.scope,'status',p.status,'createdAt',p.created_at,'updatedAt',p.updated_at),auth.uid());
  return public.nexora_get_project(p.id);
end $$;

create or replace function public.nexora_archive_project(p_project_id uuid, p_archived boolean default true)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.projects;
begin
  if not public.nexora_allow_request('project_lifecycle') then raise exception 'Project lifecycle actions are temporarily rate limited'; end if;
  select * into p from public.projects where id=p_project_id and public.nexora_can_access_project(id,'editor') for update;
  if not found then raise exception 'Project not found'; end if;
  if p_archived then update public.review_snapshots set status='revoked' where project_id=p_project_id; end if;
  update public.projects set archived=p_archived, review_token=case when p_archived then null else review_token end, updated_at=now(),updated_by=auth.uid() where id=p_project_id returning * into p;
  insert into private.audit_events(actor_id,action,target_type,target_id,payload) values(auth.uid(),case when p_archived then 'project.archived' else 'project.restored' end,'project',p.id::text,jsonb_build_object('workspaceId',p.workspace_id));
  return public.nexora_get_project(p.id);
end $$;

create or replace function public.nexora_duplicate_project(p_project_id uuid, p_title text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare source public.projects; copy public.projects; workspace_owner uuid;
begin
  if not public.nexora_allow_request('project_lifecycle') then raise exception 'Project lifecycle actions are temporarily rate limited'; end if;
  select * into source from public.projects where id=p_project_id and public.nexora_can_access_project(id,'viewer');
  if not found then raise exception 'Project not found'; end if;
  if coalesce(public.nexora_workspace_role(source.workspace_id),'') not in ('owner','admin','editor') then raise exception 'Editor access required'; end if;
  select owner_id into workspace_owner from public.workspaces where id=source.workspace_id;
  insert into public.projects(owner_id,workspace_id,created_by,title,client,brief,analysis,scope,status,updated_by) values(coalesce(workspace_owner,auth.uid()),source.workspace_id,auth.uid(),coalesce(nullif(btrim(p_title),''),source.title||' copy'),source.client,source.brief,source.analysis,source.scope,'draft',auth.uid()) returning * into copy;
  insert into public.project_versions(project_id,version,project_json,changed_by) values(copy.id,1,jsonb_build_object('id',copy.id,'title',copy.title,'client',copy.client,'brief',copy.brief,'analysis',copy.analysis,'scope',copy.scope,'status',copy.status,'createdAt',copy.created_at,'updatedAt',copy.updated_at),auth.uid());
  return public.nexora_get_project(copy.id);
end $$;

create or replace function public.nexora_delete_project(p_project_id uuid, p_confirmation text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare p public.projects;
begin
  if p_confirmation is distinct from 'DELETE' then raise exception 'Type DELETE to confirm this irreversible action'; end if;
  if not public.nexora_allow_request('project_lifecycle') then raise exception 'Project lifecycle actions are temporarily rate limited'; end if;
  select * into p from public.projects where id=p_project_id and public.nexora_can_access_project(id,'owner') for update;
  if not found then raise exception 'Project not found'; end if;
  delete from public.projects where id=p_project_id;
  insert into private.audit_events(actor_id,action,target_type,target_id) values(auth.uid(),'project.deleted','project',p_project_id::text);
  return true;
end $$;

create or replace function public.nexora_project_versions(p_project_id uuid)
returns setof jsonb language sql security definer stable set search_path = '' as $$
  select jsonb_build_object('version',v.version,'project',v.project_json,'changedBy',v.changed_by,'createdAt',v.created_at) from public.project_versions v where v.project_id=p_project_id and public.nexora_can_access_project(p_project_id,'viewer') order by v.version desc limit 50
$$;

create or replace function public.nexora_compare_versions(p_project_id uuid,p_left integer,p_right integer)
returns jsonb language plpgsql security definer stable set search_path = '' as $$
declare left_version jsonb; right_version jsonb; changed jsonb := '[]'::jsonb; key_name text;
begin
  if not public.nexora_can_access_project(p_project_id,'viewer') then raise exception 'Project not found'; end if;
  select project_json into left_version from public.project_versions where project_id=p_project_id and version=p_left;
  select project_json into right_version from public.project_versions where project_id=p_project_id and version=p_right;
  if left_version is null or right_version is null then raise exception 'Version not found'; end if;
  foreach key_name in array array['title','client','brief','analysis','scope','status'] loop
    if left_version->key_name is distinct from right_version->key_name then changed := changed || jsonb_build_array(jsonb_build_object('field',key_name,'left',left_version->key_name,'right',right_version->key_name)); end if;
  end loop;
  return jsonb_build_object('projectId',p_project_id,'leftVersion',p_left,'rightVersion',p_right,'changedFields',changed);
end $$;

create or replace function public.nexora_workspace_invite(p_workspace_id uuid,p_email text,p_role text default 'viewer')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare token text := encode(extensions.gen_random_bytes(32),'base64url'); inv public.workspace_invites; normalized text := lower(btrim(coalesce(p_email,''))); role_name text := lower(btrim(coalesce(p_role,'viewer')));
begin
  perform public.nexora_require_recent_mfa();
  if coalesce(public.nexora_workspace_role(p_workspace_id),'') not in ('owner','admin') then raise exception 'Workspace admin access required'; end if;
  if not public.nexora_allow_request('workspace_invite') then raise exception 'Workspace invites are temporarily rate limited'; end if;
  if normalized !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or role_name not in ('admin','editor','viewer') then raise exception 'Valid email and role are required'; end if;
  insert into public.workspace_invites(workspace_id,email,role,token_hash,expires_at,invited_by) values(p_workspace_id,normalized,role_name,digest(token,'sha256'),now()+interval '7 days',auth.uid()) returning * into inv;
  insert into private.audit_events(actor_id,action,target_type,target_id,payload) values(auth.uid(),'workspace.invite.created','workspace',p_workspace_id::text,jsonb_build_object('email',normalized,'role',role_name,'emailDeliveryStatus','undelivered'));
  return jsonb_build_object('id',inv.id,'email',inv.email,'role',inv.role,'expiresAt',inv.expires_at,'status','pending','emailDeliveryStatus',inv.email_delivery_status,'token',token);
end $$;

create or replace function public.nexora_accept_workspace_invite(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare inv public.workspace_invites; user_email text; confirmed_at timestamptz; member public.workspace_members;
begin
  perform public.nexora_require_active_actor();
  select email,email_confirmed_at into user_email,confirmed_at from auth.users where id=auth.uid();
  if user_email is null or confirmed_at is null then raise exception 'Confirm your email before accepting workspace invitations'; end if;
  select * into inv from public.workspace_invites where token_hash=digest(coalesce(p_token,''),'sha256') and revoked_at is null and accepted_at is null and expires_at>now() for update;
  if not found then raise exception 'Invite is expired, revoked, or already used'; end if;
  if lower(coalesce(user_email,''))<>lower(inv.email) then raise exception 'Invite email does not match the signed-in account'; end if;
  insert into public.workspace_members(workspace_id,user_id,role,invited_by) values(inv.workspace_id,auth.uid(),inv.role,inv.invited_by) on conflict (workspace_id,user_id) do update set role=excluded.role,updated_at=now() returning * into member;
  update public.workspace_invites set accepted_by=auth.uid(),accepted_at=now() where id=inv.id;
  insert into private.audit_events(actor_id,action,target_type,target_id) values(auth.uid(),'workspace.invite.accepted','workspace_invite',inv.id::text);
  return jsonb_build_object('workspaceId',member.workspace_id,'role',member.role,'acceptedAt',now());
end $$;

create or replace function public.nexora_set_workspace_member_role(p_workspace_id uuid,p_user_id uuid,p_role text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare current_role text; owner_count bigint;
begin
  perform public.nexora_require_recent_mfa();
  if coalesce(public.nexora_workspace_role(p_workspace_id),'') not in ('owner','admin') then raise exception 'Workspace admin access required'; end if;
  if p_role not in ('admin','editor','viewer') or p_user_id=auth.uid() then raise exception 'Invalid member role change'; end if;
  select role into current_role from public.workspace_members where workspace_id=p_workspace_id and user_id=p_user_id for update;
  if current_role is null then raise exception 'Member not found'; end if;
  if current_role='owner' then raise exception 'Transfer ownership explicitly before changing the owner'; end if;
  update public.workspace_members set role=p_role,updated_at=now() where workspace_id=p_workspace_id and user_id=p_user_id;
  insert into private.audit_events(actor_id,action,target_type,target_id,payload) values(auth.uid(),'workspace.member.role_changed','workspace_member',p_user_id::text,jsonb_build_object('workspaceId',p_workspace_id,'role',p_role));
  return true;
end $$;

create or replace function public.nexora_remove_workspace_member(p_workspace_id uuid,p_user_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare role_name text; owner_count bigint;
begin
  perform public.nexora_require_recent_mfa();
  if coalesce(public.nexora_workspace_role(p_workspace_id),'') not in ('owner','admin') then raise exception 'Workspace admin access required'; end if;
  if p_user_id=auth.uid() then raise exception 'You cannot remove yourself from a workspace'; end if;
  select role into role_name from public.workspace_members where workspace_id=p_workspace_id and user_id=p_user_id for update;
  if role_name is null then raise exception 'Member not found'; end if;
  if role_name='owner' then select count(*) into owner_count from public.workspace_members where workspace_id=p_workspace_id and role='owner'; if owner_count<=1 then raise exception 'Transfer ownership before removing the last owner'; end if; end if;
  delete from public.workspace_members where workspace_id=p_workspace_id and user_id=p_user_id;
  return true;
end $$;

create or replace function public.nexora_transfer_workspace_ownership(p_workspace_id uuid,p_new_owner uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare current_owner uuid; new_role text;
begin
  perform public.nexora_require_recent_mfa();
  perform public.nexora_require_active_actor();
  select owner_id into current_owner from public.workspaces where id=p_workspace_id for update;
  if current_owner is null or current_owner<>auth.uid() then raise exception 'Workspace owner access required'; end if;
  if p_new_owner is null or p_new_owner=auth.uid() then raise exception 'Choose another verified member'; end if;
  select role into new_role from public.workspace_members where workspace_id=p_workspace_id and user_id=p_new_owner for update;
  if new_role is null then raise exception 'New owner must already be a workspace member'; end if;
  update public.workspaces set owner_id=p_new_owner,updated_at=now() where id=p_workspace_id;
  update public.workspace_members set role=case when user_id=p_new_owner then 'owner' else case when role='owner' then 'admin' else role end end,updated_at=now() where workspace_id=p_workspace_id and user_id in (auth.uid(),p_new_owner);
  update public.projects set owner_id=p_new_owner where workspace_id=p_workspace_id;
  update public.review_snapshots set owner_id=p_new_owner where project_id in (select id from public.projects where workspace_id=p_workspace_id);
  update public.project_attachments set owner_id=p_new_owner where project_id in (select id from public.projects where workspace_id=p_workspace_id);
  if to_regclass('storage.objects') is not null then
    if exists(select 1 from information_schema.columns where table_schema='storage' and table_name='objects' and column_name='owner') then
      execute 'update storage.objects o set owner_id=$1, owner=$2 where o.bucket_id=''nexora-private'' and o.owner_id=$3 and o.owner=$4 and exists (select 1 from public.project_attachments a where a.object_key=o.name and a.project_id in (select id from public.projects where workspace_id=$5))' using p_new_owner::text,p_new_owner,auth.uid()::text,auth.uid(),p_workspace_id;
    else
      execute 'update storage.objects o set owner_id=$1 where o.bucket_id=''nexora-private'' and o.owner_id=$2 and exists (select 1 from public.project_attachments a where a.object_key=o.name and a.project_id in (select id from public.projects where workspace_id=$3))' using p_new_owner::text,auth.uid()::text,p_workspace_id;
    end if;
  end if;
  update public.brief_templates set owner_id=p_new_owner where workspace_id=p_workspace_id;
  insert into private.audit_events(actor_id,action,target_type,target_id,payload) values(auth.uid(),'workspace.ownership.transferred','workspace',p_workspace_id::text,jsonb_build_object('from',auth.uid(),'to',p_new_owner));
  return true;
end $$;

create or replace function private.nexora_block_owner_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('nexora:platform-owner-delete',0));
  if exists (select 1 from public.workspaces where owner_id=old.id) or exists (select 1 from public.workspace_members where user_id=old.id and role='owner') then
    raise exception 'Transfer workspace ownership before deleting this account';
  end if;
  if exists(select 1 from private.platform_roles where user_id=old.id and role='platform_owner')
     and (select count(*) from private.platform_roles where role='platform_owner') <= 1 then
    raise exception 'The last platform owner must transfer administrator ownership before deleting this account';
  end if;
  if exists(select 1 from private.nexora_admins where user_id=old.id)
     and (select count(*) from private.nexora_admins) <= 1
     and not exists(select 1 from private.platform_roles where role='platform_owner' and user_id<>old.id) then
    raise exception 'The last administrator must transfer administrator ownership before deleting this account';
  end if;
  return old;
end $$;
drop trigger if exists nexora_block_workspace_owner_delete on auth.users;
create trigger nexora_block_workspace_owner_delete before delete on auth.users for each row execute function private.nexora_block_owner_delete();

create or replace function public.nexora_list_notifications(p_limit integer default 50)
returns setof jsonb language sql security definer stable set search_path = '' as $$
  select jsonb_build_object('id',n.id,'eventType',n.event_type,'projectId',n.project_id,'snapshotToken',n.snapshot_token,'actorId',n.actor_id,'payload',n.payload,'readAt',n.read_at,'createdAt',n.created_at) from public.notifications n where n.user_id=auth.uid() order by n.created_at desc limit least(greatest(coalesce(p_limit,50),1),100)
$$;

create or replace function public.nexora_unread_notification_count()
returns integer language sql security definer stable set search_path = '' as $$ select count(*)::integer from public.notifications where user_id=auth.uid() and read_at is null $$;

create or replace function public.nexora_mark_notification_read(p_id bigint)
returns boolean language sql security definer set search_path = '' as $$ update public.notifications set read_at=coalesce(read_at,now()) where id=p_id and user_id=auth.uid() returning true $$;

create or replace function public.nexora_record_client_error(p_source text,p_message text,p_context jsonb default '{}')
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or char_length(btrim(coalesce(p_source,''))) not between 1 and 80 or char_length(coalesce(p_message,'')) not between 1 and 1000 then return false; end if;
  insert into private.app_errors(actor_id,source,message,context) values(auth.uid(),btrim(p_source),btrim(p_message),coalesce(p_context,'{}'::jsonb));
  return true;
end $$;

create or replace function public.nexora_create_support_request(p_subject text,p_body text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare ticket public.support_requests;
begin
  if auth.uid() is null or char_length(btrim(coalesce(p_subject,''))) not between 1 and 160 or char_length(btrim(coalesce(p_body,''))) not between 1 and 4000 then raise exception 'Support subject and message are required'; end if;
  insert into public.support_requests(requester_id,subject,body) values(auth.uid(),btrim(p_subject),btrim(p_body)) returning * into ticket;
  insert into private.audit_events(actor_id,action,target_type,target_id) values(auth.uid(),'support.request.created','support_request',ticket.id::text);
  return jsonb_build_object('id',ticket.id,'subject',ticket.subject,'status',ticket.status,'createdAt',ticket.created_at);
end $$;

create or replace function public.nexora_is_platform_admin()
returns boolean language sql security definer stable set search_path = '' as $$ select auth.uid() is not null and exists(select 1 from private.platform_roles r where r.user_id=auth.uid()) $$;

-- Seed the confirmed product owner as the only platform owner if the account exists.
insert into private.platform_roles(user_id,role)
select id,'platform_owner' from auth.users where id='c28c6c5f-607c-4833-9d48-83d12905c369'
on conflict (user_id) do update set role='platform_owner';

revoke all on function public.nexora_list_workspaces(), public.nexora_create_workspace(text), public.nexora_get_or_create_personal_workspace(), public.nexora_archive_project(uuid,boolean), public.nexora_duplicate_project(uuid,text), public.nexora_delete_project(uuid,text), public.nexora_project_versions(uuid), public.nexora_compare_versions(uuid,integer,integer), public.nexora_workspace_invite(uuid,text,text), public.nexora_accept_workspace_invite(text), public.nexora_set_workspace_member_role(uuid,uuid,text), public.nexora_remove_workspace_member(uuid,uuid), public.nexora_transfer_workspace_ownership(uuid,uuid), public.nexora_list_notifications(integer), public.nexora_unread_notification_count(), public.nexora_mark_notification_read(bigint), public.nexora_allow_request(text), public.nexora_record_client_error(text,text,jsonb), public.nexora_create_support_request(text,text), public.nexora_is_platform_admin() from public, anon;
grant execute on function public.nexora_list_workspaces(), public.nexora_create_workspace(text), public.nexora_get_or_create_personal_workspace(), public.nexora_archive_project(uuid,boolean), public.nexora_duplicate_project(uuid,text), public.nexora_delete_project(uuid,text), public.nexora_project_versions(uuid), public.nexora_compare_versions(uuid,integer,integer), public.nexora_workspace_invite(uuid,text,text), public.nexora_accept_workspace_invite(text), public.nexora_set_workspace_member_role(uuid,uuid,text), public.nexora_remove_workspace_member(uuid,uuid), public.nexora_transfer_workspace_ownership(uuid,uuid), public.nexora_list_notifications(integer), public.nexora_unread_notification_count(), public.nexora_mark_notification_read(bigint), public.nexora_allow_request(text), public.nexora_record_client_error(text,text,jsonb), public.nexora_create_support_request(text,text), public.nexora_is_platform_admin() to authenticated;
grant execute on function public.nexora_list_projects(), public.nexora_get_project(uuid), public.nexora_create_project(jsonb), public.nexora_update_project(uuid,jsonb), public.nexora_project_history(uuid), public.nexora_share_project(uuid), public.nexora_create_change_proposal(uuid,jsonb), public.nexora_get_review(text), public.nexora_review_action(text,jsonb) to authenticated;

-- Storage is private by default. These guards make the migration safe to run
-- in PGlite, where Supabase's storage schema is absent.
do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('nexora-private','nexora-private',false,3145728,array['image/jpeg','image/png','image/webp','application/pdf','text/plain','text/markdown','application/zip']) on conflict (id) do update set public=false,file_size_limit=3145728;
    if to_regclass('storage.objects') is not null then
      execute 'drop policy if exists nexora_private_read on storage.objects';
      execute 'drop policy if exists nexora_private_insert on storage.objects';
      execute 'drop policy if exists nexora_private_delete on storage.objects';
      execute $policy$create policy nexora_private_read on storage.objects for select to authenticated using (bucket_id='nexora-private' and exists (select 1 from public.project_attachments a where a.object_key=name and public.nexora_can_access_project(a.project_id,'viewer')))$policy$;
      execute $policy$create policy nexora_private_insert on storage.objects for insert to authenticated with check (
        bucket_id='nexora-private'
        and not public.nexora_is_suspended()
        and split_part(name,'/',1)=auth.uid()::text
        and octet_length(name)<=240
         and owner_id=auth.uid()::text
        and exists (
          select 1 from public.project_attachments a
          where a.object_key=name
            and a.uploaded_by=auth.uid()
            and public.nexora_can_access_project(a.project_id,'editor')
            and (metadata->>'mimetype')=a.mime_type
            and (coalesce(metadata->>'size','') ~ '^[0-9]+$' and (metadata->>'size')::bigint=a.byte_size)
        )
      )$policy$;
      execute $policy$create policy nexora_private_delete on storage.objects for delete to authenticated using (bucket_id='nexora-private' and exists (select 1 from public.project_attachments a where a.object_key=name and public.nexora_can_access_project(a.project_id,'editor')))$policy$;
    end if;
  end if;
end $$;
