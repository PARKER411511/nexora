-- Forward-only hardening for the complete suite. Apply after
-- 20261005_complete_suite.sql. No SMTP, CAPTCHA, or service-role assumptions.

create schema if not exists private;

alter table public.profiles add column if not exists avatar_object_key text;
alter table public.profiles add column if not exists avatar_pending_key text;
alter table public.profiles add column if not exists avatar_pending_mime text;
alter table public.profiles add column if not exists avatar_pending_size bigint;
alter table public.project_attachments add column if not exists delete_requested_at timestamptz;
alter table public.project_attachments add column if not exists delete_requested_by uuid references auth.users(id) on delete set null;

create table if not exists private.account_deletion_requests (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  confirmation text not null check (confirmation = 'DELETE MY ACCOUNT'),
  reason text,
  status text not null default 'pending' check (status in ('pending','blocked','completed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists account_deletion_pending_user_idx
  on private.account_deletion_requests(user_id) where status = 'pending';

do $$ declare constraint_name text; begin
  select conname into constraint_name from pg_constraint where conrelid='private.account_deletion_requests'::regclass and contype='c' and pg_get_constraintdef(oid) like '%status%';
  if constraint_name is not null then execute format('alter table private.account_deletion_requests drop constraint %I',constraint_name); end if;
  if not exists (select 1 from pg_constraint where conname='account_deletion_status_check' and conrelid='private.account_deletion_requests'::regclass) then
    alter table private.account_deletion_requests add constraint account_deletion_status_check check (status in ('pending','processing','blocked','completed','cancelled'));
  end if;
end $$;

create table if not exists private.profile_avatar_tombstones (
  user_id uuid not null references auth.users(id) on delete cascade,
  object_key text primary key,
  created_at timestamptz not null default now()
);

-- Storage is intentionally not exposed through PostgREST. These narrow RPCs
-- are callable only with the server's service-role JWT and perform the exact
-- ownership checks needed by account deletion. The worker still uses the
-- supported Storage API for physical removal.
create or replace function private.nexora_is_service_role()
returns boolean language plpgsql security definer stable set search_path = '' as $$
declare claims jsonb;
begin
  if nullif(current_setting('request.jwt.claim.role', true), '') = 'service_role' then return true; end if;
  claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  return coalesce(claims->>'role', '') = 'service_role';
exception when others then return false;
end $$;
revoke all on function private.nexora_is_service_role() from public, anon, authenticated;

drop function if exists public.nexora_storage_reassign_owner(text,text,uuid,uuid);

create or replace function public.nexora_storage_reassign_owner(p_bucket text,p_object_key text,p_from uuid,p_to uuid,p_workspace_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare found_object boolean := false; changed integer := 0; verified boolean := false; current_owner uuid; has_owner_id boolean := false; has_owner boolean := false;
begin
  if not private.nexora_is_service_role() then raise exception 'Service role required'; end if;
  if to_regclass('storage.objects') is null then raise exception 'Storage metadata is unavailable'; end if;
  select owner_id into current_owner from public.workspaces where id=p_workspace_id and personal=false for update;
  if current_owner is null or current_owner is distinct from p_to then return false; end if;
  select exists(select 1 from information_schema.columns where table_schema='storage' and table_name='objects' and column_name='owner_id'),
         exists(select 1 from information_schema.columns where table_schema='storage' and table_name='objects' and column_name='owner')
    into has_owner_id,has_owner;
  if has_owner_id and has_owner then
    -- Supabase has shipped both owner columns, and older rows can have one
    -- side NULL. Accept a row only when every populated ownership column
    -- agrees with p_from (or p_to for an already completed transfer); reject
    -- any conflicting foreign owner.
    execute 'select exists(select 1 from storage.objects where bucket_id=$1 and name=$2 and ((owner_id=$3 or owner_id is null) and (owner=$4 or owner is null) and (owner_id=$3 or owner=$4)))' into found_object using p_bucket,p_object_key,p_from::text,p_from;
    if not found_object then
      execute 'select exists(select 1 from storage.objects where bucket_id=$1 and name=$2 and ((owner_id=$3 or owner_id is null) and (owner=$4 or owner is null) and (owner_id=$3 or owner=$4)))' into verified using p_bucket,p_object_key,p_to::text,p_to;
      if verified then return true; end if;
    end if;
  elsif has_owner_id then
    execute 'select exists(select 1 from storage.objects where bucket_id=$1 and name=$2 and owner_id=$3)' into found_object using p_bucket,p_object_key,p_from::text;
  elsif has_owner then
    execute 'select exists(select 1 from storage.objects where bucket_id=$1 and name=$2 and owner=$3)' into found_object using p_bucket,p_object_key,p_from;
    if not found_object then
      execute 'select exists(select 1 from storage.objects where bucket_id=$1 and name=$2 and owner=$3)' into verified using p_bucket,p_object_key,p_to;
      if verified then return true; end if;
    end if;
  else
    raise exception 'Storage ownership metadata is unavailable';
  end if;
  if not found_object then return false; end if;
  if has_owner_id and has_owner then
     execute 'update storage.objects set owner_id=$1, owner=$2 where bucket_id=$3 and name=$4 and ((owner_id=$5 or owner_id is null) and (owner=$6 or owner is null) and (owner_id=$5 or owner=$6))' using p_to::text,p_to,p_bucket,p_object_key,p_from::text,p_from;
  elsif has_owner_id then
    execute 'update storage.objects set owner_id=$1 where bucket_id=$2 and name=$3 and owner_id=$4' using p_to::text,p_bucket,p_object_key,p_from::text;
  elsif has_owner then
    execute 'update storage.objects set owner=$1 where bucket_id=$2 and name=$3 and owner=$4' using p_to,p_bucket,p_object_key,p_from;
  end if;
  get diagnostics changed = row_count;
  if changed <> 1 then return false; end if;
  if has_owner_id and has_owner then
    execute 'select exists(select 1 from storage.objects where bucket_id=$1 and name=$2 and owner_id=$3 and owner=$4)' into verified using p_bucket,p_object_key,p_to::text,p_to;
  elsif has_owner_id then
    execute 'select exists(select 1 from storage.objects where bucket_id=$1 and name=$2 and owner_id=$3)' into verified using p_bucket,p_object_key,p_to::text;
  elsif has_owner then
    execute 'select exists(select 1 from storage.objects where bucket_id=$1 and name=$2 and owner=$3)' into verified using p_bucket,p_object_key,p_to;
  end if;
  return verified;
end $$;

create or replace function public.nexora_storage_object_exists(p_bucket text,p_object_key text)
returns boolean language plpgsql security definer stable set search_path = '' as $$
declare present boolean := false;
begin
  if not private.nexora_is_service_role() then raise exception 'Service role required'; end if;
  if to_regclass('storage.objects') is null then return false; end if;
  execute 'select exists(select 1 from storage.objects where bucket_id=$1 and name=$2)' into present using p_bucket,p_object_key;
  return present;
end $$;

create or replace function public.nexora_storage_owned_object_count(p_user_id uuid)
returns integer language plpgsql security definer stable set search_path = '' as $$
declare total integer := 0; has_owner_id boolean; has_owner boolean;
begin
  if not private.nexora_is_service_role() then raise exception 'Service role required'; end if;
  if to_regclass('storage.objects') is null then return 0; end if;
  select exists(select 1 from information_schema.columns where table_schema='storage' and table_name='objects' and column_name='owner_id'), exists(select 1 from information_schema.columns where table_schema='storage' and table_name='objects' and column_name='owner') into has_owner_id,has_owner;
  if has_owner_id and has_owner then
    execute 'select count(*)::integer from storage.objects where owner_id=$1 or owner=$2' into total using p_user_id::text,p_user_id;
  elsif has_owner_id then
    execute 'select count(*)::integer from storage.objects where owner_id=$1' into total using p_user_id::text;
  elsif has_owner then
    execute 'select count(*)::integer from storage.objects where owner=$1' into total using p_user_id;
  end if;
  return total;
end $$;

-- Storage is not exposed through PostgREST. The deletion worker therefore
-- submits the complete database manifest to this narrow service-role RPC. A
-- count comparison is insufficient: an unregistered object can be masked by
-- a stale or duplicate manifest row. Every currently owned Storage object
-- must have an exact bucket/name entry, and every manifest entry that still
-- exists must still be owned by the deleting account. Ownership is compatible
-- with both provider layouts: owner_id text and the legacy owner UUID column.
create or replace function public.nexora_storage_verify_deletion_manifest(p_user_id uuid,p_manifest jsonb)
returns jsonb language plpgsql security definer stable set search_path = '' as $$
declare has_owner_id boolean; has_owner boolean; untracked integer := 0; unowned integer := 0;
begin
  if not private.nexora_is_service_role() then raise exception 'Service role required'; end if;
  if p_manifest is null or jsonb_typeof(p_manifest) is distinct from 'array' then raise exception 'Deletion manifest must be an array'; end if;
  if to_regclass('storage.objects') is null then
    return jsonb_build_object('ok',true,'untracked',0,'unowned',0);
  end if;
  select exists(select 1 from information_schema.columns where table_schema='storage' and table_name='objects' and column_name='owner_id'),
         exists(select 1 from information_schema.columns where table_schema='storage' and table_name='objects' and column_name='owner')
    into has_owner_id,has_owner;
  if not has_owner_id and not has_owner then raise exception 'Storage ownership metadata is unavailable'; end if;
  if has_owner_id and has_owner then
    execute $q$
      select count(*)::integer from storage.objects o
       where (o.owner_id=$1 or o.owner=$2)
         and not exists(select 1 from jsonb_to_recordset($3) m(bucket text, object_key text)
                        where m.bucket=o.bucket_id and m.object_key=o.name)
    $q$ into untracked using p_user_id::text,p_user_id,p_manifest;
    execute $q$
      select count(*)::integer from jsonb_to_recordset($3) m(bucket text, object_key text, workspace_owner_id uuid, workspace_personal boolean)
       where exists(select 1 from storage.objects o where o.bucket_id=m.bucket and o.name=m.object_key)
         and not exists(select 1 from storage.objects o where o.bucket_id=m.bucket and o.name=m.object_key and ((o.owner_id=$1 or o.owner=$2) or (coalesce(m.workspace_personal,true)=false and m.workspace_owner_id is not null and (o.owner_id=m.workspace_owner_id::text or o.owner=m.workspace_owner_id))))
    $q$ into unowned using p_user_id::text,p_user_id,p_manifest;
  elsif has_owner_id then
    execute $q$
      select count(*)::integer from storage.objects o
       where o.owner_id=$1
         and not exists(select 1 from jsonb_to_recordset($2) m(bucket text, object_key text)
                        where m.bucket=o.bucket_id and m.object_key=o.name)
    $q$ into untracked using p_user_id::text,p_manifest;
    execute $q$
      select count(*)::integer from jsonb_to_recordset($2) m(bucket text, object_key text, workspace_owner_id uuid, workspace_personal boolean)
       where exists(select 1 from storage.objects o where o.bucket_id=m.bucket and o.name=m.object_key)
         and not exists(select 1 from storage.objects o where o.bucket_id=m.bucket and o.name=m.object_key and (o.owner_id=$1 or (coalesce(m.workspace_personal,true)=false and m.workspace_owner_id is not null and o.owner_id=m.workspace_owner_id::text)))
    $q$ into unowned using p_user_id::text,p_manifest;
  else
    execute $q$
      select count(*)::integer from storage.objects o
       where o.owner=$1
         and not exists(select 1 from jsonb_to_recordset($2) m(bucket text, object_key text)
                        where m.bucket=o.bucket_id and m.object_key=o.name)
    $q$ into untracked using p_user_id,p_manifest;
    execute $q$
      select count(*)::integer from jsonb_to_recordset($2) m(bucket text, object_key text, workspace_owner_id uuid, workspace_personal boolean)
       where exists(select 1 from storage.objects o where o.bucket_id=m.bucket and o.name=m.object_key)
         and not exists(select 1 from storage.objects o where o.bucket_id=m.bucket and o.name=m.object_key and (o.owner=$1 or (coalesce(m.workspace_personal,true)=false and m.workspace_owner_id is not null and o.owner=m.workspace_owner_id)))
    $q$ into unowned using p_user_id,p_manifest;
  end if;
  return jsonb_build_object('ok',untracked=0 and unowned=0,'untracked',untracked,'unowned',unowned);
end $$;

-- Reserve administrator deletion while the worker is in flight. The Auth
-- delete trigger is still the final guard, but a transaction-scoped advisory
-- lock alone is too short-lived: two workers could otherwise both observe
-- two surviving administrators before either Auth request completes. Treat a
-- different processing request as an owner that is already leaving and keep
-- the last platform/legacy administrator protected for the whole workflow.
create or replace function private.nexora_deletion_admin_guard(p_user_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare surviving_platform integer := 0; surviving_admin integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended('nexora:platform-owner-delete',0));
  if exists(select 1 from private.platform_roles where user_id=p_user_id and role='platform_owner') then
    select count(*)::integer into surviving_platform
      from private.platform_roles r
     where r.role='platform_owner'
       and not exists(
         select 1 from private.account_deletion_requests d
          where d.user_id=r.user_id and d.user_id<>p_user_id and d.status='processing'
       );
    if surviving_platform <= 1 then
      raise exception 'The last platform owner must transfer administrator ownership before deleting this account';
    end if;
  end if;
  if exists(select 1 from private.nexora_admins where user_id=p_user_id) then
    select count(*)::integer into surviving_admin
      from private.nexora_admins a
     where not exists(
         select 1 from private.account_deletion_requests d
          where d.user_id=a.user_id and d.user_id<>p_user_id and d.status='processing'
       );
    if surviving_admin <= 1
       and not exists(select 1 from private.platform_roles where role='platform_owner' and user_id<>p_user_id) then
      raise exception 'The last administrator must transfer administrator ownership before deleting this account';
    end if;
  end if;
  return true;
end $$;

revoke all on function private.nexora_deletion_admin_guard(uuid) from public, anon, authenticated;

-- Keep the Auth-side trigger aligned with the worker reservation. This is the
-- final serialized safeguard if an Auth delete arrives after a stale worker
-- preflight or if an operator calls Auth directly.
create or replace function private.nexora_block_owner_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.nexora_deletion_admin_guard(old.id);
  if exists(select 1 from public.workspaces where owner_id=old.id)
     or exists(select 1 from public.workspace_members where user_id=old.id and role='owner') then
    raise exception 'Transfer workspace ownership before deleting this account';
  end if;
  return old;
end $$;

-- Recheck ownership and the last platform-owner guard from the same
-- service-role worker path immediately before physical cleanup and again
-- before Auth deletion. The advisory lock serializes two deletion workers.
create or replace function public.nexora_account_deletion_preflight(p_user_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not private.nexora_is_service_role() then raise exception 'Service role required'; end if;
  perform private.nexora_deletion_admin_guard(p_user_id);
  if exists(select 1 from public.workspaces where owner_id=p_user_id and personal=false)
     or exists(select 1 from public.workspace_members m join public.workspaces w on w.id=m.workspace_id where m.user_id=p_user_id and m.role='owner' and w.personal=false) then
    raise exception 'Transfer workspace ownership before deleting your account';
  end if;
  return true;
end $$;

create or replace function public.nexora_claim_account_deletion(p_user_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not private.nexora_is_service_role() then raise exception 'Service role required'; end if;
  perform private.nexora_deletion_admin_guard(p_user_id);
  if exists(select 1 from public.workspaces where owner_id=p_user_id and personal=false)
     or exists(select 1 from public.workspace_members m join public.workspaces w on w.id=m.workspace_id where m.user_id=p_user_id and m.role='owner' and w.personal=false) then
    raise exception 'Transfer workspace ownership before deleting your account';
  end if;
  update private.account_deletion_requests set status='processing',updated_at=now() where user_id=p_user_id and status='pending';
  return found;
end $$;

-- Same manifest as the session-scoped reader, callable only by the worker.
-- Keep this as a separate overload so a queued retry does not depend on the
-- deleting user's browser session remaining alive.
create or replace function public.nexora_account_deletion_manifest(p_user_id uuid)
returns table(bucket text, object_key text, kind text, workspace_id uuid, workspace_owner_id uuid, workspace_personal boolean)
language plpgsql security definer stable set search_path = '' as $$
begin
  if not private.nexora_is_service_role() then raise exception 'Service role required'; end if;
  return query
    select 'nexora-profile-avatars', p.avatar_object_key, 'avatar', null::uuid, null::uuid, true
      from public.profiles p where p.id=p_user_id and p.avatar_object_key is not null
    union all
    select 'nexora-profile-avatars', p.avatar_pending_key, 'avatar', null::uuid, null::uuid, true
      from public.profiles p where p.id=p_user_id and p.avatar_pending_key is not null
    union all
    select 'nexora-profile-avatars', t.object_key, 'avatar', null::uuid, null::uuid, true
      from private.profile_avatar_tombstones t where t.user_id=p_user_id
    union all
    select 'nexora-private', a.object_key, 'attachment', p.workspace_id, w.owner_id, coalesce(w.personal,true)
      from public.project_attachments a
      join public.projects p on p.id=a.project_id
      left join public.workspaces w on w.id=p.workspace_id
      where a.owner_id=p_user_id or a.uploaded_by=p_user_id;
end $$;

create or replace function public.nexora_release_account_deletion(p_user_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not private.nexora_is_service_role() then raise exception 'Service role required'; end if;
  update private.account_deletion_requests set status='pending',updated_at=now() where user_id=p_user_id and status='processing';
  return found;
end $$;

create or replace function public.nexora_complete_account_deletion_request(p_user_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not private.nexora_is_service_role() then raise exception 'Service role required'; end if;
  update private.account_deletion_requests set status='completed',updated_at=now() where user_id=p_user_id and status='processing';
  return found;
end $$;

do $$ begin
  revoke all on function public.nexora_storage_reassign_owner(text,text,uuid,uuid,uuid),public.nexora_storage_object_exists(text,text),public.nexora_storage_owned_object_count(uuid),public.nexora_storage_verify_deletion_manifest(uuid,jsonb),public.nexora_account_deletion_preflight(uuid),public.nexora_account_deletion_manifest(uuid),public.nexora_claim_account_deletion(uuid),public.nexora_release_account_deletion(uuid),public.nexora_complete_account_deletion_request(uuid) from public,anon,authenticated;
  if exists(select 1 from pg_roles where rolname='service_role') then
    grant execute on function public.nexora_storage_reassign_owner(text,text,uuid,uuid,uuid),public.nexora_storage_object_exists(text,text),public.nexora_storage_owned_object_count(uuid),public.nexora_storage_verify_deletion_manifest(uuid,jsonb),public.nexora_account_deletion_preflight(uuid),public.nexora_account_deletion_manifest(uuid),public.nexora_claim_account_deletion(uuid),public.nexora_release_account_deletion(uuid),public.nexora_complete_account_deletion_request(uuid) to service_role;
  end if;
end $$;

-- Account deletion must be able to de-identify invitation provenance while
-- retaining the invitation/audit record. The original suite used RESTRICT and
-- NOT NULL here, which made a legitimate member account impossible to delete.
do $$ declare constraint_name text; begin
  alter table public.workspace_invites alter column invited_by drop not null;
  select conname into constraint_name from pg_constraint where conrelid='public.workspace_invites'::regclass and contype='f' and pg_get_constraintdef(oid) like '%invited_by%auth.users%';
  if constraint_name is not null then execute format('alter table public.workspace_invites drop constraint %I',constraint_name); end if;
  if not exists (select 1 from pg_constraint where conname='workspace_invites_invited_by_fk' and conrelid='public.workspace_invites'::regclass) then
    alter table public.workspace_invites add constraint workspace_invites_invited_by_fk foreign key(invited_by) references auth.users(id) on delete set null;
  end if;
  alter table public.review_invitations alter column invited_by drop not null;
  select conname into constraint_name from pg_constraint where conrelid='public.review_invitations'::regclass and contype='f' and pg_get_constraintdef(oid) like '%invited_by%auth.users%';
  if constraint_name is not null then execute format('alter table public.review_invitations drop constraint %I',constraint_name); end if;
  if not exists (select 1 from pg_constraint where conname='review_invitations_invited_by_fk' and conrelid='public.review_invitations'::regclass) then
    alter table public.review_invitations add constraint review_invitations_invited_by_fk foreign key(invited_by) references auth.users(id) on delete set null;
  end if;
end $$;

create or replace function public.nexora_mfa_satisfied()
returns boolean language plpgsql security definer stable set search_path = '' as $$
declare claims jsonb; enrolled boolean := false;
begin
  -- AAL1 remains valid for accounts without a verified factor. If Supabase
  -- reports a verified TOTP factor, application routes require AAL2.
  claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  if claims is null or claims->>'aal' is null then return false; end if;
  begin
    if to_regclass('auth.mfa_factors') is not null then
      execute 'select exists (select 1 from auth.mfa_factors where user_id=auth.uid() and status=''verified'' and factor_type=''totp'')' into enrolled;
    end if;
  exception when others then
    return false;
  end;
  return not enrolled or claims->>'aal' = 'aal2';
exception when others then
  return false;
end $$;

create or replace function public.nexora_session_valid()
returns boolean language plpgsql security definer stable set search_path = '' as $$
declare claims jsonb; valid_session boolean := false;
begin
  if auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid()) then return false; end if;
  claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  if claims is null or claims->>'session_id' is null then return false; end if;
  if to_regclass('auth.sessions') is null then return false; end if;
  execute 'select exists(select 1 from auth.sessions where id=($1->>''session_id'')::uuid and user_id=auth.uid())' into valid_session using claims;
  return valid_session;
exception when others then return false;
end $$;

create or replace function public.nexora_is_suspended()
returns boolean language sql security definer stable set search_path = '' as $$
  select auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid()) or exists(select 1 from private.account_states s where s.user_id=auth.uid() and s.suspended)
$$;

revoke all on function public.nexora_mfa_satisfied() from public, anon;
grant execute on function public.nexora_mfa_satisfied() to authenticated;

create or replace function public.nexora_has_verified_totp()
returns boolean language plpgsql security definer stable set search_path = '' as $$
declare enrolled boolean := false;
begin
  if auth.uid() is null or to_regclass('auth.mfa_factors') is null then return false; end if;
  execute 'select exists(select 1 from auth.mfa_factors where user_id=auth.uid() and status=''verified'' and factor_type=''totp'')' into enrolled;
  return enrolled;
exception when others then return false;
end $$;

-- Sensitive customer actions accept a fresh password AMR for accounts without
-- MFA. Enrolled accounts must prove a fresh TOTP AAL2 session; a token refresh
-- alone is never treated as fresh reauthentication.
create or replace function public.nexora_recent_mfa_satisfied()
returns boolean language plpgsql security definer stable set search_path = '' as $$
declare claims jsonb; minimum_epoch numeric; session_valid boolean := false; method_name text;
begin
  claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  if claims is null or not public.nexora_session_valid() then return false; end if;
  minimum_epoch := extract(epoch from (now() - interval '15 minutes'));
  if coalesce((claims->>'iat')::numeric, 0) < minimum_epoch then return false; end if;
  if public.nexora_has_verified_totp() then
    if claims->>'aal' <> 'aal2' then return false; end if;
    return exists(select 1 from jsonb_array_elements(coalesce(claims->'amr','[]'::jsonb)) as method where method->>'method'='totp' and coalesce((method->>'timestamp')::numeric,0)>=minimum_epoch);
  end if;
  return exists(select 1 from jsonb_array_elements(coalesce(claims->'amr','[]'::jsonb)) as method where method->>'method'='password' and coalesce((method->>'timestamp')::numeric,0)>=minimum_epoch);
exception when others then return false;
end $$;

create or replace function public.nexora_recent_admin_mfa_satisfied()
returns boolean language plpgsql security definer stable set search_path = '' as $$
declare claims jsonb; minimum_epoch numeric;
begin
  claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  minimum_epoch := extract(epoch from (now() - interval '15 minutes'));
  if claims is null or not public.nexora_session_valid() or claims->>'aal' <> 'aal2' then return false; end if;
  if coalesce((claims->>'iat')::numeric, 0) < minimum_epoch then return false; end if;
  return public.nexora_has_verified_totp() and exists(select 1 from jsonb_array_elements(coalesce(claims->'amr','[]'::jsonb)) as method where method->>'method'='totp' and coalesce((method->>'timestamp')::numeric,0)>=minimum_epoch);
exception when others then return false;
end $$;

create or replace function public.nexora_require_recent_mfa()
returns boolean language plpgsql security definer stable set search_path = '' as $$
begin
  if not public.nexora_recent_mfa_satisfied() then raise exception 'Recent MFA verification required'; end if;
  return true;
end $$;

create or replace function public.nexora_require_recent_admin_mfa()
returns boolean language plpgsql security definer stable set search_path = '' as $$
begin
  if not public.nexora_recent_admin_mfa_satisfied() then raise exception 'Recent administrator TOTP verification required'; end if;
  return true;
end $$;

revoke all on function public.nexora_has_verified_totp(), public.nexora_recent_mfa_satisfied(), public.nexora_recent_admin_mfa_satisfied(), public.nexora_require_recent_mfa(), public.nexora_require_recent_admin_mfa() from public, anon;
grant execute on function public.nexora_has_verified_totp(), public.nexora_recent_mfa_satisfied(), public.nexora_recent_admin_mfa_satisfied(), public.nexora_require_recent_mfa(), public.nexora_require_recent_admin_mfa() to authenticated;

create or replace function public.nexora_require_active_actor()
returns boolean language plpgsql security definer stable set search_path = '' as $$
begin
  if not public.nexora_session_valid() or exists (select 1 from private.account_states s where s.user_id=auth.uid() and s.suspended) then
    raise exception 'Account is unavailable';
  end if;
  if exists(select 1 from private.account_deletion_requests d where d.user_id=auth.uid() and d.status='processing') then
    raise exception 'Account deletion is being processed';
  end if;
  if not public.nexora_mfa_satisfied() then raise exception 'MFA verification required'; end if;
  return true;
end $$;

create or replace function public.nexora_deletion_processing()
returns boolean language sql security definer stable set search_path = '' as $$
  select auth.uid() is not null and exists(select 1 from private.account_deletion_requests d where d.user_id=auth.uid() and d.status='processing')
$$;
revoke all on function public.nexora_deletion_processing() from public,anon;
grant execute on function public.nexora_deletion_processing() to authenticated;

create or replace function public.nexora_can_access_project(p_project_id uuid, p_min_role text default 'viewer')
returns boolean language plpgsql security definer stable set search_path = '' as $$
declare p public.projects; role_name text;
begin
  if not public.nexora_session_valid() or public.nexora_is_suspended() or not public.nexora_mfa_satisfied() or public.nexora_deletion_processing() then return false; end if;
  select * into p from public.projects where id = p_project_id;
  if not found then return false; end if;
  if p.workspace_id is null then return p.owner_id = auth.uid(); end if;
  role_name := public.nexora_workspace_role(p.workspace_id);
  return coalesce(case p_min_role
    when 'viewer' then role_name in ('owner','admin','editor','viewer')
    when 'editor' then role_name in ('owner','admin','editor')
    when 'admin' then role_name in ('owner','admin')
    when 'owner' then role_name = 'owner'
    else false end,false);
end $$;

create or replace function public.nexora_allow_request(p_operation text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare started timestamptz := to_timestamp(floor(extract(epoch from now()) / 60) * 60); current_count integer; operation_limit integer;
begin
  if not public.nexora_session_valid() or public.nexora_is_suspended() or not public.nexora_mfa_satisfied() or public.nexora_deletion_processing() then return false; end if;
  operation_limit := case p_operation
    when 'project_create' then 20 when 'project_update' then 60 when 'project_lifecycle' then 30
    when 'analyze' then 30 when 'sharing' then 20 when 'review_action' then 30
    when 'proposal' then 20 when 'workspace_create' then 5 when 'workspace_invite' then 20
    when 'attachment' then 40 when 'export' then 10 when 'admin_action' then 30
    when 'account_action' then 5 when 'notification' then 60 else 0 end;
  if operation_limit = 0 then return false; end if;
  insert into private.rate_limits(bucket,subject_id,window_started_at,count)
    values(p_operation,auth.uid(),started,1)
    on conflict (bucket,subject_id,window_started_at)
    do update set count=private.rate_limits.count+1 returning count into current_count;
  return current_count <= operation_limit;
end $$;

-- The first complete-suite wrapper delegated to an owner-only function. This
-- membership-aware implementation allows workspace admins to prepare a
-- proposal while still requiring the approved project and request to match.
create or replace function public.nexora_create_change_proposal(p_project_id uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.change_requests; latest public.change_proposals; p public.projects; next_version integer;
begin
  perform public.nexora_require_active_actor();
  if public.nexora_can_access_project(p_project_id,'admin') is not true then raise exception 'Project not found'; end if;
  if not public.nexora_allow_request('proposal') then raise exception 'Proposal actions are temporarily rate limited'; end if;
  select * into p from public.projects where id=p_project_id for update;
  if p.status <> 'approved' or p.archived then raise exception 'Proposals can only be written against an approved active scope'; end if;
  if p_input is null or jsonb_typeof(p_input) is distinct from 'object' or not (p_input ?& array['requestId','title','details','affectedDeliverables','priceAdjustment','currency','timelineImpact','rationale']) then raise exception 'Malformed proposal'; end if;
  if jsonb_typeof(p_input->'requestId') is distinct from 'string' or char_length(btrim(coalesce(p_input->>'requestId',''))) = 0
    or jsonb_typeof(p_input->'title') is distinct from 'string' or char_length(btrim(coalesce(p_input->>'title',''))) not between 1 and 160
    or jsonb_typeof(p_input->'details') is distinct from 'string' or char_length(btrim(coalesce(p_input->>'details',''))) not between 1 and 4000
    or jsonb_typeof(p_input->'timelineImpact') is distinct from 'string' or char_length(btrim(coalesce(p_input->>'timelineImpact',''))) not between 1 and 500
    or jsonb_typeof(p_input->'rationale') is distinct from 'string' or char_length(btrim(coalesce(p_input->>'rationale',''))) not between 1 and 2000
    or jsonb_typeof(p_input->'currency') is distinct from 'string' or not (p_input->>'currency' ~ '^[A-Z]{3}$')
    or jsonb_typeof(p_input->'priceAdjustment') is distinct from 'number' or not (p_input->>'priceAdjustment' ~ '^-?[0-9]+(\.[0-9]{1,2})?$')
    or abs((p_input->>'priceAdjustment')::numeric) > 10000000
    or jsonb_typeof(p_input->'affectedDeliverables') is distinct from 'array' or jsonb_array_length(p_input->'affectedDeliverables') > 30
    or exists(select 1 from jsonb_array_elements(p_input->'affectedDeliverables') e where jsonb_typeof(e) is distinct from 'string' or char_length(btrim(e #>> '{}')) not between 1 and 300)
  then raise exception 'Malformed proposal'; end if;
  select * into r from public.change_requests where id=(p_input->>'requestId')::uuid and project_id=p_project_id for update;
  if not found then raise exception 'Change request not found for this project'; end if;
  select * into latest from public.change_proposals where request_id=r.id order by version desc limit 1;
  if latest.status='sent' then raise exception 'This change request already has a proposal waiting for a decision'; end if;
  if r.status='accepted' then raise exception 'This change request was accepted'; end if;
  next_version := coalesce(latest.version,0)+1;
  insert into public.change_proposals(request_id,version,title,details,affected_deliverables,price_adjustment,currency,timeline_impact,rationale)
    values(r.id,next_version,btrim(p_input->>'title'),btrim(p_input->>'details'),p_input->'affectedDeliverables',(p_input->>'priceAdjustment')::numeric,p_input->>'currency',btrim(p_input->>'timelineImpact'),btrim(p_input->>'rationale'));
  update public.change_requests set status='proposed',updated_at=now() where id=r.id;
  return public.nexora_project_history(p_project_id);
exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'Malformed proposal';
end $$;

create or replace function public.nexora_create_workspace(p_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare w public.workspaces;
begin
  perform public.nexora_require_active_actor();
  if not public.nexora_allow_request('workspace_create') then raise exception 'Workspace creation is temporarily rate limited'; end if;
  if char_length(btrim(coalesce(p_name,''))) not between 1 and 120 then raise exception 'Workspace name is required'; end if;
  insert into public.workspaces(owner_id,name,personal) values(auth.uid(),btrim(p_name),false) returning * into w;
  insert into public.workspace_members(workspace_id,user_id,role) values(w.id,auth.uid(),'owner');
  insert into private.audit_events(actor_id,action,target_type,target_id) values(auth.uid(),'workspace.created','workspace',w.id::text);
  return jsonb_build_object('id',w.id,'name',w.name,'personal',w.personal,'role','owner','createdAt',w.created_at,'updatedAt',w.updated_at);
end $$;

-- Workspace templates retain ownership with the workspace owner. Creator
-- identity is nullable, so removing a former creator does not remove a team
-- template or its source brief.
create or replace function public.nexora_create_brief_template(p_workspace_id uuid,p_name text,p_brief text,p_tags text[] default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare workspace_owner uuid; template public.brief_templates;
begin
  perform public.nexora_require_active_actor();
  if coalesce(public.nexora_workspace_role(p_workspace_id),'') not in ('owner','admin','editor') then raise exception 'Editor access required'; end if;
  select owner_id into workspace_owner from public.workspaces where id=p_workspace_id;
  if workspace_owner is null or char_length(btrim(coalesce(p_name,''))) not between 1 and 120 or char_length(coalesce(p_brief,'')) not between 24 and 20000 then raise exception 'Template name and brief are required'; end if;
  insert into public.brief_templates(owner_id,created_by,workspace_id,name,brief,tags) values(workspace_owner,auth.uid(),p_workspace_id,btrim(p_name),p_brief,coalesce(p_tags,'{}')) returning * into template;
  return jsonb_build_object('id',template.id,'workspaceId',template.workspace_id,'name',template.name,'brief',template.brief,'tags',template.tags,'createdBy',template.created_by,'createdAt',template.created_at);
end $$;

create or replace function public.nexora_list_brief_templates(p_workspace_id uuid)
returns setof jsonb language sql security definer stable set search_path = '' as $$
  select jsonb_build_object('id',t.id,'workspaceId',t.workspace_id,'name',t.name,'brief',t.brief,'tags',t.tags,'createdBy',t.created_by,'createdAt',t.created_at,'updatedAt',t.updated_at)
  from public.brief_templates t where t.workspace_id=p_workspace_id and public.nexora_workspace_role(p_workspace_id) is not null order by t.updated_at desc limit 100
$$;

-- Attachment deletion is two-phase. The storage object is removed while its
-- tombstone still exists, then metadata is finalized after storage confirms.
create or replace function public.nexora_request_delete_attachment(p_attachment_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare attachment public.project_attachments;
begin
  perform public.nexora_require_active_actor();
  if not public.nexora_allow_request('attachment') then raise exception 'Attachment actions are temporarily rate limited'; end if;
  select * into attachment from public.project_attachments where id=p_attachment_id for update;
  if not found or not public.nexora_can_access_project(attachment.project_id,'editor') then raise exception 'Attachment not found'; end if;
  update public.project_attachments set delete_requested_at=coalesce(delete_requested_at,now()),delete_requested_by=auth.uid() where id=p_attachment_id returning * into attachment;
  return jsonb_build_object('id',attachment.id,'objectKey',attachment.object_key,'pending',true);
end $$;

create or replace function public.nexora_finalize_delete_attachment(p_attachment_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare object_key text; object_exists boolean;
begin
  select a.object_key into object_key from public.project_attachments a where a.id=p_attachment_id and a.delete_requested_at is not null and public.nexora_can_access_project(a.project_id,'editor') is true;
  if object_key is null then return false; end if;
  if to_regclass('storage.objects') is not null then
    execute 'select exists(select 1 from storage.objects where bucket_id=''nexora-private'' and name=$1)' into object_exists using object_key;
    if object_exists then raise exception 'Storage object still exists; remove it before finalizing'; end if;
  end if;
  delete from public.project_attachments where id=p_attachment_id and delete_requested_at is not null;
  return found;
end $$;

-- Existing callers of nexora_delete_attachment now leave a tombstone for the
-- API to remove from Storage. A failed Storage removal can be retried safely.
create or replace function public.nexora_delete_attachment(p_attachment_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  return public.nexora_request_delete_attachment(p_attachment_id);
end $$;

create or replace function public.nexora_register_profile_avatar(p_mime_type text,p_byte_size bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare object_key text;
begin
  perform public.nexora_require_active_actor();
  if p_mime_type not in ('image/jpeg','image/png','image/webp') or p_byte_size is null or p_byte_size not between 1 and 2097152 then raise exception 'Profile photo must be JPG, PNG, or WebP up to 2 MB'; end if;
  object_key := auth.uid()::text || '/' || encode(extensions.gen_random_bytes(18),'hex');
  update public.profiles set avatar_pending_key=object_key,avatar_pending_mime=p_mime_type,avatar_pending_size=p_byte_size,updated_at=now() where id=auth.uid();
  if not found then insert into public.profiles(id,avatar_pending_key,avatar_pending_mime,avatar_pending_size) values(auth.uid(),object_key,p_mime_type,p_byte_size); end if;
  return jsonb_build_object('bucket','nexora-profile-avatars','objectKey',object_key);
end $$;

create or replace function public.nexora_activate_profile_avatar(p_object_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare old_key text;
begin
  perform public.nexora_require_active_actor();
  select avatar_object_key into old_key from public.profiles where id=auth.uid() and avatar_pending_key=p_object_key for update;
  if not found then raise exception 'Profile photo upload is no longer pending'; end if;
  if old_key is not null and old_key<>p_object_key then insert into private.profile_avatar_tombstones(user_id,object_key) values(auth.uid(),old_key) on conflict do nothing; end if;
  update public.profiles set avatar_object_key=p_object_key,avatar_pending_key=null,avatar_pending_mime=null,avatar_pending_size=null,updated_at=now() where id=auth.uid();
  return jsonb_build_object('objectKey',p_object_key,'previousObjectKey',old_key);
end $$;

create or replace function public.nexora_clear_pending_profile_avatar(p_object_key text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform public.nexora_require_active_actor();
  update public.profiles set avatar_pending_key=null,avatar_pending_mime=null,avatar_pending_size=null,updated_at=now() where id=auth.uid() and avatar_pending_key=p_object_key;
  return found;
end
$$;

create or replace function public.nexora_finalize_profile_avatar_delete(p_object_key text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform public.nexora_require_active_actor();
  delete from private.profile_avatar_tombstones where user_id=auth.uid() and object_key=p_object_key;
  return found;
end
$$;

create or replace function public.nexora_clear_profile_avatar(p_object_key text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform public.nexora_require_active_actor();
  update public.profiles set avatar_object_key=null,updated_at=now() where id=auth.uid() and avatar_object_key=p_object_key;
  return found;
end $$;

create or replace function public.nexora_request_account_deletion(p_confirmation text,p_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare request_row private.account_deletion_requests;
begin
  perform public.nexora_require_active_actor();
  perform public.nexora_require_recent_mfa();
  if not public.nexora_allow_request('account_action') then raise exception 'Account actions are temporarily rate limited'; end if;
  if p_confirmation is distinct from 'DELETE MY ACCOUNT' then raise exception 'Type DELETE MY ACCOUNT to confirm'; end if;
  perform private.nexora_deletion_admin_guard(auth.uid());
  if exists(select 1 from public.workspaces where owner_id=auth.uid() and personal=false) or exists(select 1 from public.workspace_members m join public.workspaces w on w.id=m.workspace_id where m.user_id=auth.uid() and m.role='owner' and w.personal=false) then
    insert into private.account_deletion_requests(user_id,confirmation,reason,status) values(auth.uid(),p_confirmation,left(p_reason,500),'blocked') on conflict do nothing returning * into request_row;
    raise exception 'Transfer workspace ownership before deleting your account';
  end if;
  insert into private.account_deletion_requests(user_id,confirmation,reason) values(auth.uid(),p_confirmation,left(p_reason,500)) on conflict (user_id) where status='pending' do update set updated_at=now() returning * into request_row;
  insert into private.audit_events(actor_id,action,target_type,target_id) values(auth.uid(),'account.deletion.requested','account',auth.uid()::text);
  return jsonb_build_object('id',request_row.id,'status',request_row.status,'createdAt',request_row.created_at);
end $$;

create or replace function public.nexora_account_deletion_manifest()
returns table(bucket text, object_key text, kind text, workspace_id uuid, workspace_owner_id uuid, workspace_personal boolean)
language plpgsql security definer stable set search_path = '' as $$
begin
  -- The service worker claims the request before reading this manifest. Keep
  -- this read-only operation available while every mutating path is blocked.
  if not public.nexora_session_valid() or public.nexora_is_suspended() or not public.nexora_mfa_satisfied() then
    raise exception 'Account is unavailable';
  end if;
  return query
    select 'nexora-profile-avatars', p.avatar_object_key, 'avatar', null::uuid, null::uuid, true
      from public.profiles p where p.id=auth.uid() and p.avatar_object_key is not null
    union all
    select 'nexora-profile-avatars', p.avatar_pending_key, 'avatar', null::uuid, null::uuid, true
      from public.profiles p where p.id=auth.uid() and p.avatar_pending_key is not null
    union all
    select 'nexora-profile-avatars', t.object_key, 'avatar', null::uuid, null::uuid, true
      from private.profile_avatar_tombstones t where t.user_id=auth.uid()
    union all
    select 'nexora-private', a.object_key, 'attachment', p.workspace_id, w.owner_id, coalesce(w.personal,true)
      from public.project_attachments a
      join public.projects p on p.id=a.project_id
      left join public.workspaces w on w.id=p.workspace_id
      where a.owner_id=auth.uid() or a.uploaded_by=auth.uid();
end $$;

create or replace function public.nexora_admin_customer_detail(p_user_id uuid)
returns jsonb language plpgsql security definer stable set search_path = '' as $$
begin
  if not public.nexora_is_admin() then raise exception 'Admin access required'; end if;
  perform public.nexora_require_recent_admin_mfa();
  return (select jsonb_build_object(
    'id',u.id,
    'email',coalesce(u.email,''),
    'emailConfirmedAt',u.confirmed_at,
    'joinedAt',u.created_at,
    'lastSignInAt',u.last_sign_in_at,
    'profile',case when p.id is null then null else jsonb_build_object(
      'id',p.id,
      'fullName',coalesce(p.full_name,''),
      'company',coalesce(p.company,''),
      'roleTitle',coalesce(p.role_title,''),
      'website',coalesce(p.website,''),
      'bio',coalesce(p.bio,''),
      'avatarObjectKey',p.avatar_object_key,
      'createdAt',p.created_at,
      'updatedAt',p.updated_at
    ) end,
    'suspended',coalesce(s.suspended,false),
    'suspensionReason',s.reason,
    'projects',coalesce((select jsonb_agg(jsonb_build_object('id',pr.id,'title',pr.title,'status',pr.status,'updatedAt',pr.updated_at) order by pr.updated_at desc) from public.projects pr where pr.owner_id=u.id),'[]'::jsonb)
  ) from auth.users u left join public.profiles p on p.id=u.id left join private.account_states s on s.user_id=u.id where u.id=p_user_id);
end $$;

create or replace function public.nexora_admin_project_detail(p_project_id uuid)
returns jsonb language plpgsql security definer stable set search_path = '' as $$
begin
  if not public.nexora_is_admin() then raise exception 'Admin access required'; end if;
  perform public.nexora_require_recent_admin_mfa();
  return (select jsonb_build_object('id',p.id,'title',p.title,'client',p.client,'status',p.status,'brief',p.brief,'analysis',p.analysis,'scope',p.scope,'createdAt',p.created_at,'updatedAt',p.updated_at,'ownerId',p.owner_id,'ownerEmail',coalesce(u.email,''),'ownerName',coalesce(nullif(pr.full_name,''),split_part(coalesce(u.email,''),'@',1)),'workspaceId',p.workspace_id,'archived',p.archived,'tags',p.tags,'deadline',p.deadline,'version',p.version) from public.projects p left join auth.users u on u.id=p.owner_id left join public.profiles pr on pr.id=p.owner_id where p.id=p_project_id);
end $$;
revoke all on function public.nexora_admin_project_detail(uuid) from public,anon;
grant execute on function public.nexora_admin_project_detail(uuid) to authenticated;

create or replace function public.nexora_admin_project_detail(p_project_id uuid)
returns jsonb language plpgsql security definer stable set search_path = '' as $$
begin
  if not public.nexora_is_admin() then raise exception 'Admin access required'; end if;
  perform public.nexora_require_recent_admin_mfa();
  return (select jsonb_build_object('id',p.id,'title',p.title,'client',p.client,'status',p.status,'brief',p.brief,'analysis',p.analysis,'scope',p.scope,'createdAt',p.created_at,'updatedAt',p.updated_at,'ownerId',p.owner_id,'ownerEmail',coalesce(u.email,''),'ownerName',coalesce(nullif(pr.full_name,''),split_part(coalesce(u.email,''),'@',1)),'workspaceId',p.workspace_id,'archived',p.archived,'tags',p.tags,'deadline',p.deadline,'version',p.version) from public.projects p left join auth.users u on u.id=p.owner_id left join public.profiles pr on pr.id=p.owner_id where p.id=p_project_id);
end $$;
revoke all on function public.nexora_admin_project_detail(uuid) from public,anon;
grant execute on function public.nexora_admin_project_detail(uuid) to authenticated;

create or replace function public.nexora_admin_set_account_suspended(p_user_id uuid,p_suspended boolean,p_reason text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not public.nexora_is_admin() then raise exception 'Admin access required'; end if;
  perform public.nexora_require_recent_admin_mfa();
  if p_user_id=auth.uid() then raise exception 'You cannot suspend your own account'; end if;
  if exists(select 1 from private.platform_roles where user_id=p_user_id and role='platform_owner') then raise exception 'The platform owner cannot be suspended'; end if;
  if not exists(select 1 from auth.users where id=p_user_id) then raise exception 'Account not found'; end if;
  insert into private.account_states(user_id,suspended,reason,changed_by,changed_at) values(p_user_id,p_suspended,left(p_reason,500),auth.uid(),now()) on conflict(user_id) do update set suspended=excluded.suspended,reason=excluded.reason,changed_by=excluded.changed_by,changed_at=excluded.changed_at;
  insert into private.audit_events(actor_id,action,target_type,target_id,payload) values(auth.uid(),case when p_suspended then 'account.suspended' else 'account.reactivated' end,'account',p_user_id::text,jsonb_build_object('reason',left(p_reason,500)));
  return true;
end $$;

create or replace function public.nexora_admin_health_summary()
returns jsonb language plpgsql security definer stable set search_path = '' as $$
begin
  if not public.nexora_is_admin() then raise exception 'Admin access required'; end if;
  perform public.nexora_require_recent_admin_mfa();
  return jsonb_build_object('generatedAt',now(),'database','ok','recentErrors',(select count(*) from private.app_errors where created_at>now()-interval '24 hours'),'openSupport',(select count(*) from public.support_requests where status in ('open','in_progress')),'pendingInvites',(select count(*) from public.workspace_invites where accepted_at is null and revoked_at is null and expires_at>now()));
end $$;

create or replace function public.nexora_health_probe()
returns jsonb language sql security definer stable set search_path = '' as $$
  select jsonb_build_object('database','ok','schema',to_regclass('public.projects') is not null)
$$;
revoke all on function public.nexora_health_probe() from public;
grant execute on function public.nexora_health_probe() to anon,authenticated;

create or replace function public.nexora_delete_project(p_project_id uuid,p_confirmation text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare project_row public.projects;
begin
  perform public.nexora_require_active_actor();
  perform public.nexora_require_recent_mfa();
  if p_confirmation is distinct from 'DELETE' then raise exception 'Type DELETE to confirm this irreversible action'; end if;
  if not public.nexora_allow_request('project_lifecycle') then raise exception 'Project lifecycle actions are temporarily rate limited'; end if;
  select * into project_row from public.projects where id=p_project_id and public.nexora_can_access_project(id,'owner') is true for update;
  if not found then raise exception 'Project not found'; end if;
  if exists(select 1 from public.project_attachments where project_id=p_project_id) then raise exception 'Remove all attachments before deleting this project'; end if;
  delete from public.projects where id=p_project_id;
  insert into private.audit_events(actor_id,action,target_type,target_id) values(auth.uid(),'project.deleted','project',p_project_id::text);
  return true;
end $$;

create or replace function public.nexora_get_profile()
returns jsonb language plpgsql security definer stable set search_path = '' as $$
declare profile_row public.profiles;
begin
  -- Profile and security enrollment must remain reachable for an enrolled
  -- account whose current session is still AAL1. Mutations remain gated.
  if not public.nexora_session_valid() or public.nexora_is_suspended() then raise exception 'Account is unavailable'; end if;
  select * into profile_row from public.profiles where id=auth.uid();
  if not found then return jsonb_build_object('fullName','','company','','roleTitle','','website','','bio',''); end if;
  return jsonb_build_object('id',profile_row.id,'fullName',profile_row.full_name,'company',profile_row.company,'roleTitle',profile_row.role_title,'website',profile_row.website,'bio',profile_row.bio,'avatarObjectKey',profile_row.avatar_object_key,'createdAt',profile_row.created_at,'updatedAt',profile_row.updated_at);
end $$;

create or replace function public.nexora_update_profile(p_profile jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare profile_row public.profiles;
begin
  perform public.nexora_require_active_actor();
  if not public.nexora_allow_request('account_action') then raise exception 'Account actions are temporarily rate limited'; end if;
  if public.nexora_valid_profile_json(p_profile) is not true then raise exception 'Malformed profile'; end if;
  insert into public.profiles(id,full_name,company,role_title,website,bio) values(auth.uid(),btrim(p_profile->>'fullName'),btrim(p_profile->>'company'),btrim(p_profile->>'roleTitle'),btrim(p_profile->>'website'),btrim(p_profile->>'bio')) on conflict(id) do update set full_name=excluded.full_name,company=excluded.company,role_title=excluded.role_title,website=excluded.website,bio=excluded.bio,updated_at=now() returning * into profile_row;
  return jsonb_build_object('id',profile_row.id,'fullName',profile_row.full_name,'company',profile_row.company,'roleTitle',profile_row.role_title,'website',profile_row.website,'bio',profile_row.bio,'avatarObjectKey',profile_row.avatar_object_key,'createdAt',profile_row.created_at,'updatedAt',profile_row.updated_at);
end $$;

revoke all on function public.nexora_register_profile_avatar(text,bigint), public.nexora_activate_profile_avatar(text), public.nexora_clear_pending_profile_avatar(text), public.nexora_finalize_profile_avatar_delete(text), public.nexora_clear_profile_avatar(text), public.nexora_request_delete_attachment(uuid), public.nexora_finalize_delete_attachment(uuid), public.nexora_request_account_deletion(text,text), public.nexora_create_brief_template(uuid,text,text,text[]), public.nexora_list_brief_templates(uuid), public.nexora_admin_customer_detail(uuid), public.nexora_admin_set_account_suspended(uuid,boolean,text), public.nexora_admin_health_summary() from public, anon;
grant execute on function public.nexora_register_profile_avatar(text,bigint), public.nexora_activate_profile_avatar(text), public.nexora_clear_pending_profile_avatar(text), public.nexora_finalize_profile_avatar_delete(text), public.nexora_clear_profile_avatar(text), public.nexora_request_delete_attachment(uuid), public.nexora_finalize_delete_attachment(uuid), public.nexora_request_account_deletion(text,text), public.nexora_create_brief_template(uuid,text,text,text[]), public.nexora_list_brief_templates(uuid), public.nexora_admin_customer_detail(uuid), public.nexora_admin_set_account_suspended(uuid,boolean,text), public.nexora_admin_health_summary() to authenticated;

do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('nexora-profile-avatars','nexora-profile-avatars',false,2097152,array['image/jpeg','image/png','image/webp']) on conflict (id) do update set public=false,file_size_limit=2097152;
    if to_regclass('storage.objects') is not null then
      execute 'drop policy if exists nexora_avatar_read on storage.objects';
      execute 'drop policy if exists nexora_avatar_insert on storage.objects';
      execute 'drop policy if exists nexora_avatar_update on storage.objects';
      execute 'drop policy if exists nexora_avatar_delete on storage.objects';
      execute $policy$create policy nexora_avatar_read on storage.objects for select to authenticated using (bucket_id='nexora-profile-avatars' and not public.nexora_deletion_processing() and public.nexora_session_valid() and public.nexora_mfa_satisfied() and (exists(select 1 from public.profiles p where p.id=auth.uid() and (p.avatar_object_key=name or p.avatar_pending_key=name)) or exists(select 1 from private.profile_avatar_tombstones t where t.user_id=auth.uid() and t.object_key=name)))$policy$;
      execute $policy$create policy nexora_avatar_insert on storage.objects for insert to authenticated with check (bucket_id='nexora-profile-avatars' and not public.nexora_deletion_processing() and not public.nexora_is_suspended() and public.nexora_mfa_satisfied() and split_part(name,'/',1)=auth.uid()::text and exists(select 1 from public.profiles p where p.id=auth.uid() and p.avatar_pending_key=name) and (metadata->>'mimetype') in ('image/jpeg','image/png','image/webp') and ((metadata->>'contentLength') ~ '^[0-9]+$' and (metadata->>'contentLength')::bigint between 1 and 2097152 or (metadata->>'size') ~ '^[0-9]+$' and (metadata->>'size')::bigint between 1 and 2097152))$policy$;
      execute $policy$create policy nexora_avatar_update on storage.objects for update to authenticated using (bucket_id='nexora-profile-avatars' and not public.nexora_deletion_processing() and not public.nexora_is_suspended() and public.nexora_mfa_satisfied() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.avatar_object_key=name)) with check (bucket_id='nexora-profile-avatars' and not public.nexora_deletion_processing() and split_part(name,'/',1)=auth.uid()::text and (metadata->>'mimetype') in ('image/jpeg','image/png','image/webp'))$policy$;
      execute $policy$create policy nexora_avatar_delete on storage.objects for delete to authenticated using (bucket_id='nexora-profile-avatars' and not public.nexora_deletion_processing() and not public.nexora_is_suspended() and public.nexora_mfa_satisfied() and (exists(select 1 from public.profiles p where p.id=auth.uid() and p.avatar_object_key=name) or exists(select 1 from private.profile_avatar_tombstones t where t.user_id=auth.uid() and t.object_key=name)))$policy$;
    end if;
  end if;
end $$;

-- Collaboration completion: team member management, reusable templates, and
-- invitation-aware review access are exposed through audited RPCs so the UI
-- never has to write membership or invitation rows directly.
alter table public.projects add column if not exists review_invited_only boolean not null default false;
alter table public.brief_templates add column if not exists scope jsonb not null default '{}'::jsonb;

create or replace function public.nexora_valid_scope_json(p_scope jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(p_scope)='object'
    and jsonb_typeof(p_scope->'deliverables')='array'
    and jsonb_array_length(p_scope->'deliverables') between 1 and 50
    and not exists(select 1 from jsonb_array_elements(p_scope->'deliverables') e where jsonb_typeof(e) is distinct from 'string' or char_length(btrim(e #>> '{}')) not between 1 and 500)
    and jsonb_typeof(p_scope->'included')='array'
    and jsonb_array_length(p_scope->'included') <= 50
    and not exists(select 1 from jsonb_array_elements(p_scope->'included') e where jsonb_typeof(e) is distinct from 'string' or char_length(btrim(e #>> '{}')) not between 1 and 500)
    and jsonb_typeof(p_scope->'excluded')='array'
    and jsonb_array_length(p_scope->'excluded') <= 50
    and not exists(select 1 from jsonb_array_elements(p_scope->'excluded') e where jsonb_typeof(e) is distinct from 'string' or char_length(btrim(e #>> '{}')) not between 1 and 500)
    and jsonb_typeof(p_scope->'milestones')='array'
    and jsonb_array_length(p_scope->'milestones') <= 20
    and not exists(select 1 from jsonb_array_elements(p_scope->'milestones') e where jsonb_typeof(e) is distinct from 'object' or jsonb_typeof(e->'name') is distinct from 'string' or char_length(btrim(e->>'name')) not between 1 and 300 or jsonb_typeof(e->'detail') is distinct from 'string' or char_length(btrim(e->>'detail')) not between 1 and 500 or jsonb_typeof(e->'timing') is distinct from 'string' or char_length(btrim(e->>'timing')) not between 1 and 120)
    and jsonb_typeof(p_scope->'revisions')='number'
    and (p_scope->>'revisions') ~ '^[0-9]+$'
    and (p_scope->>'revisions')::integer between 0 and 20
$$;

create or replace function public.nexora_create_scope_template(p_workspace_id uuid,p_name text,p_brief text,p_scope jsonb,p_tags text[] default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare workspace_owner uuid; template public.brief_templates;
begin
  perform public.nexora_require_active_actor();
  if coalesce(public.nexora_workspace_role(p_workspace_id),'') not in ('owner','admin','editor') then raise exception 'Editor access required'; end if;
  select owner_id into workspace_owner from public.workspaces where id=p_workspace_id;
  if workspace_owner is null or char_length(btrim(coalesce(p_name,''))) not between 1 and 120 or char_length(coalesce(p_brief,'')) not between 24 and 20000 or public.nexora_valid_scope_json(p_scope) is not true then raise exception 'Template name, brief, and scope are required'; end if;
  insert into public.brief_templates(owner_id,created_by,workspace_id,name,brief,scope,tags) values(workspace_owner,auth.uid(),p_workspace_id,btrim(p_name),p_brief,p_scope,coalesce(p_tags,'{}')) returning * into template;
  return jsonb_build_object('id',template.id,'workspaceId',template.workspace_id,'name',template.name,'brief',template.brief,'scope',template.scope,'tags',template.tags,'createdBy',template.created_by,'createdAt',template.created_at,'updatedAt',template.updated_at);
end $$;

create or replace function public.nexora_list_workspace_members(p_workspace_id uuid)
returns jsonb language plpgsql security definer stable set search_path = '' as $$
begin
  perform public.nexora_require_active_actor();
  if coalesce(public.nexora_workspace_role(p_workspace_id),'') not in ('owner','admin','editor','viewer') then
    raise exception 'Workspace access required';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'userId',m.user_id,'role',m.role,'email',coalesce(u.email,''),
    'name',coalesce(nullif(p.full_name,''),split_part(coalesce(u.email,''),'@',1)),
    'createdAt',m.created_at,'updatedAt',m.updated_at
  ) order by case m.role when 'owner' then 0 when 'admin' then 1 when 'editor' then 2 else 3 end,m.created_at)
    from public.workspace_members m
    join auth.users u on u.id=m.user_id
    left join public.profiles p on p.id=m.user_id
    where m.workspace_id=p_workspace_id),'[]'::jsonb);
end $$;

create or replace function public.nexora_revoke_workspace_invite(p_invite_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare workspace_id uuid;
begin
  perform public.nexora_require_active_actor();
  select i.workspace_id into workspace_id from public.workspace_invites i where i.id=p_invite_id and i.accepted_at is null and i.revoked_at is null for update;
  if workspace_id is null then return false; end if;
  if coalesce(public.nexora_workspace_role(workspace_id),'') not in ('owner','admin') then raise exception 'Workspace admin access required'; end if;
  update public.workspace_invites set revoked_at=now() where id=p_invite_id;
  insert into private.audit_events(actor_id,action,target_type,target_id,payload) values(auth.uid(),'workspace.invite.revoked','workspace_invite',p_invite_id::text,jsonb_build_object('workspaceId',workspace_id));
  return true;
end $$;

create or replace function public.nexora_list_brief_templates(p_workspace_id uuid)
returns setof jsonb language sql security definer stable set search_path = '' as $$
  select jsonb_build_object('id',t.id,'workspaceId',t.workspace_id,'name',t.name,'brief',t.brief,'scope',t.scope,'tags',t.tags,'createdBy',t.created_by,'createdAt',t.created_at,'updatedAt',t.updated_at)
  from public.brief_templates t
  where public.nexora_require_active_actor() and coalesce(public.nexora_workspace_role(p_workspace_id),'') in ('owner','admin','editor','viewer') and t.workspace_id=p_workspace_id
  order by t.updated_at desc limit 100
$$;

create or replace function public.nexora_set_review_access(p_project_id uuid,p_invited_only boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform public.nexora_require_active_actor();
  perform public.nexora_require_recent_mfa();
  if public.nexora_can_access_project(p_project_id,'admin') is not true then raise exception 'Project admin access required'; end if;
  if not public.nexora_allow_request('sharing') then raise exception 'Sharing actions are temporarily rate limited'; end if;
  update public.projects set review_invited_only=p_invited_only,updated_at=now(),updated_by=auth.uid() where id=p_project_id;
  return found;
end $$;

create or replace function public.nexora_list_review_invitations(p_project_id uuid)
returns jsonb language plpgsql security definer stable set search_path = '' as $$
begin
  perform public.nexora_require_active_actor();
  if public.nexora_can_access_project(p_project_id,'admin') is not true then raise exception 'Project sharing access required'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'email',i.invited_email,'status',i.status,'dueAt',i.due_at,'emailDeliveryStatus',i.email_delivery_status,'createdAt',i.created_at) order by i.created_at desc) from public.review_invitations i where i.project_id=p_project_id),'[]'::jsonb);
end $$;

create or replace function public.nexora_create_review_invitation(p_project_id uuid,p_snapshot_token text,p_email text,p_due_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare row public.review_invitations; normalized text := lower(btrim(coalesce(p_email,'')));
begin
  perform public.nexora_require_active_actor();
  perform public.nexora_require_recent_mfa();
  if public.nexora_can_access_project(p_project_id,'admin') is not true then raise exception 'Project admin access required'; end if;
  if not public.nexora_allow_request('sharing') then raise exception 'Sharing actions are temporarily rate limited'; end if;
  if p_snapshot_token is null or not exists(select 1 from public.review_snapshots where project_id=p_project_id and token=p_snapshot_token and status <> 'revoked') then raise exception 'Review snapshot not found'; end if;
  if normalized !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Enter a valid reviewer email'; end if;
  insert into public.review_invitations(project_id,snapshot_token,invited_email,invited_by,due_at) values(p_project_id,p_snapshot_token,normalized,auth.uid(),p_due_at) returning * into row;
  insert into private.audit_events(actor_id,action,target_type,target_id,payload) values(auth.uid(),'review.invitation.created','review_invitation',row.id::text,jsonb_build_object('projectId',p_project_id,'email',normalized,'dueAt',p_due_at,'emailDeliveryStatus','undelivered'));
  return jsonb_build_object('id',row.id,'email',row.invited_email,'status',row.status,'dueAt',row.due_at,'emailDeliveryStatus',row.email_delivery_status,'createdAt',row.created_at);
end $$;

create or replace function public.nexora_revoke_review_invitation(p_invite_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare project_id uuid;
begin
  perform public.nexora_require_active_actor();
  perform public.nexora_require_recent_mfa();
  select i.project_id into project_id from public.review_invitations i where i.id=p_invite_id and i.status <> 'revoked' for update;
  if project_id is null then return false; end if;
  if public.nexora_can_access_project(project_id,'admin') is not true then raise exception 'Project admin access required'; end if;
  update public.review_invitations set status='revoked' where id=p_invite_id;
  return true;
end $$;

create or replace function public.nexora_revoke_review_snapshot(p_snapshot_token text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare project_id uuid; current_token text;
begin
  perform public.nexora_require_active_actor();
  perform public.nexora_require_recent_mfa();
  if not public.nexora_allow_request('sharing') then raise exception 'Sharing actions are temporarily rate limited'; end if;
  select s.project_id,p.review_token into project_id,current_token from public.review_snapshots s join public.projects p on p.id=s.project_id where s.token=p_snapshot_token for update;
  if project_id is null then return false; end if;
  if public.nexora_can_access_project(project_id,'admin') is not true then raise exception 'Project admin access required'; end if;
  update public.review_snapshots set status='revoked' where token=p_snapshot_token and status<>'revoked';
  if current_token=p_snapshot_token then update public.projects set review_token=null,updated_at=now(),updated_by=auth.uid() where id=project_id and status='shared'; end if;
  insert into private.audit_events(actor_id,action,target_type,target_id,payload) values(auth.uid(),'review.snapshot.revoked','review_snapshot',p_snapshot_token,jsonb_build_object('projectId',project_id));
  return true;
end $$;

-- complete_suite already moves the legacy implementations to *_legacy. Keep
-- those names stable so this migration is safe on a second application.
do $$ begin
  if to_regprocedure('public.nexora_get_review_legacy(text)') is null or to_regprocedure('public.nexora_review_action_legacy(text,jsonb)') is null then
    raise exception 'Review legacy functions are missing; apply complete_suite before security_completion';
  end if;
end $$;

create or replace function public.nexora_review_actor_allowed(p_token text)
returns boolean language plpgsql security definer volatile set search_path = '' as $$
declare v_project_id uuid; invited_only boolean; email text; confirmed_at timestamptz; invite_id uuid; invite_status text; accepted_by uuid;
begin
  perform public.nexora_require_active_actor();
  select s.project_id,p.review_invited_only into v_project_id,invited_only from public.review_snapshots s join public.projects p on p.id=s.project_id where s.token=p_token and s.status <> 'revoked';
  if v_project_id is null then return false; end if;
  if not invited_only then return true; end if;
  if public.nexora_can_access_project(v_project_id,'viewer') is true then return true; end if;
  select lower(u.email),u.email_confirmed_at into email,confirmed_at from auth.users u where u.id=auth.uid();
  if email is null or confirmed_at is null then return false; end if;
  select i.id,i.status,i.accepted_by into invite_id,invite_status,accepted_by from public.review_invitations i where i.project_id=v_project_id and i.snapshot_token=p_token and i.status in ('pending','accepted','responded') and lower(i.invited_email)=email order by i.created_at desc limit 1 for update;
  if invite_id is null then return false; end if;
  if invite_status='pending' then update public.review_invitations set status='accepted',accepted_by=auth.uid(),accepted_at=now() where id=invite_id and status='pending'; end if;
  if invite_status in ('accepted','responded') and accepted_by is distinct from auth.uid() then return false; end if;
  return true;
end $$;

create or replace function public.nexora_get_review(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if public.nexora_review_actor_allowed(p_token) is not true then raise exception 'This review is limited to invited reviewers'; end if;
  return public.nexora_get_review_legacy(p_token);
end $$;

create or replace function public.nexora_review_action(p_token text,p_action jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if public.nexora_review_actor_allowed(p_token) is not true then raise exception 'This review is limited to invited reviewers'; end if;
  return public.nexora_review_action_legacy(p_token,p_action);
end $$;

create or replace function public.nexora_review_reply(p_token text,p_comment text,p_parent_id bigint default null,p_mentioned_emails text[] default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare project_id uuid; snapshot_status text; clean text := btrim(coalesce(p_comment,'')); mention text; normalized_mentions text[]; mention_count integer;
begin
  perform public.nexora_require_active_actor();
  if public.nexora_review_actor_allowed(p_token) is not true then raise exception 'This review is limited to invited reviewers'; end if;
  if not public.nexora_allow_request('review_action') then raise exception 'Review actions are temporarily rate limited'; end if;
  if char_length(clean) < 1 or char_length(clean)>4000 then raise exception 'Reply must be between 1 and 4,000 characters'; end if;
  select coalesce(array_agg(distinct lower(btrim(x))) filter (where btrim(x)<>''),'{}') into normalized_mentions from unnest(coalesce(p_mentioned_emails,'{}')) x;
  mention_count := coalesce(array_length(normalized_mentions,1),0);
  if mention_count>10 then raise exception 'Mention up to 10 people'; end if;
  select s.project_id,s.status into project_id,snapshot_status from public.review_snapshots s where s.token=p_token;
  if project_id is null or snapshot_status='revoked' then raise exception 'Review snapshot is unavailable'; end if;
  if p_parent_id is not null and not exists(select 1 from public.review_comments c where c.id=p_parent_id and c.snapshot_token=p_token) then raise exception 'Parent comment not found'; end if;
  if exists(select 1 from unnest(normalized_mentions) n where not exists(
    select 1 from auth.users u where lower(u.email)=n and u.email_confirmed_at is not null and (
      exists(select 1 from public.projects px where px.id=project_id and px.owner_id=u.id) or
      exists(select 1 from public.projects px join public.workspace_members wm on wm.workspace_id=px.workspace_id where px.id=project_id and wm.user_id=u.id and wm.role in ('owner','admin','editor','viewer')) or
      exists(select 1 from public.review_invitations i where i.project_id=project_id and i.snapshot_token=p_token and lower(i.invited_email)=n and i.status in ('pending','accepted','responded'))))) then
    raise exception 'Mentioned people must be confirmed project collaborators or invited reviewers';
  end if;
  insert into public.review_comments(snapshot_token,name,comment,action,parent_id,mentioned_user_ids) values(p_token,'',clean,'feedback',p_parent_id,coalesce((select array_agg(u.id) from auth.users u where lower(u.email)=any(normalized_mentions) and u.email_confirmed_at is not null),'{}'));
  foreach mention in array normalized_mentions loop
    insert into public.notifications(user_id,event_type,project_id,snapshot_token,actor_id,payload)
      select u.id,'mention',project_id,p_token,auth.uid(),jsonb_build_object('title','You were mentioned in a review','message',left(clean,180)) from auth.users u where lower(u.email)=mention and u.id<>auth.uid() and u.email_confirmed_at is not null and (exists(select 1 from public.projects px where px.id=project_id and px.owner_id=u.id) or exists(select 1 from public.projects px join public.workspace_members wm on wm.workspace_id=px.workspace_id where px.id=project_id and wm.user_id=u.id and wm.role in ('owner','admin','editor','viewer')) or exists(select 1 from public.review_invitations i where i.project_id=project_id and i.snapshot_token=p_token and lower(i.invited_email)=mention and i.status in ('pending','accepted','responded')));
  end loop;
  update public.review_invitations i set status='responded' where i.project_id=project_id and i.snapshot_token=p_token and i.status in ('pending','accepted') and lower(i.invited_email)=(select lower(email) from auth.users where id=auth.uid());
  return public.nexora_get_review_legacy(p_token);
end $$;

revoke all on function public.nexora_list_workspace_members(uuid),public.nexora_revoke_workspace_invite(uuid),public.nexora_list_brief_templates(uuid),public.nexora_create_scope_template(uuid,text,text,jsonb,text[]),public.nexora_set_review_access(uuid,boolean),public.nexora_list_review_invitations(uuid),public.nexora_create_review_invitation(uuid,text,text,timestamptz),public.nexora_revoke_review_invitation(uuid),public.nexora_revoke_review_snapshot(text),public.nexora_review_actor_allowed(text),public.nexora_review_reply(text,text,bigint,text[]),public.nexora_account_deletion_manifest() from public,anon;
grant execute on function public.nexora_list_workspace_members(uuid),public.nexora_revoke_workspace_invite(uuid),public.nexora_list_brief_templates(uuid),public.nexora_create_scope_template(uuid,text,text,jsonb,text[]),public.nexora_set_review_access(uuid,boolean),public.nexora_list_review_invitations(uuid),public.nexora_create_review_invitation(uuid,text,text,timestamptz),public.nexora_revoke_review_invitation(uuid),public.nexora_revoke_review_snapshot(text),public.nexora_review_actor_allowed(text),public.nexora_review_reply(text,text,bigint,text[]),public.nexora_account_deletion_manifest() to authenticated;

-- Legacy aliases must never remain callable through PostgREST. The wrappers
-- above are the only public review entry points.
revoke all on function public.nexora_get_review_legacy(text),public.nexora_review_action_legacy(text,jsonb) from public,anon,authenticated;
revoke all on function public.nexora_get_review(text),public.nexora_review_action(text,jsonb) from public,anon;
grant execute on function public.nexora_get_review(text),public.nexora_review_action(text,jsonb) to authenticated;

create or replace function public.nexora_admin_support_queue()
returns jsonb language plpgsql security definer stable set search_path = '' as $$
begin
  if not public.nexora_is_admin() then raise exception 'Admin access required'; end if;
  perform public.nexora_require_recent_admin_mfa();
  return coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'subject',s.subject,'body',s.body,'status',s.status,'createdAt',s.created_at,'updatedAt',s.updated_at,'requesterId',s.requester_id,'email',coalesce(u.email,'')) order by s.updated_at desc) from public.support_requests s left join auth.users u on u.id=s.requester_id),'[]'::jsonb);
end $$;

create or replace function public.nexora_admin_set_support_status(p_id uuid,p_status text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not public.nexora_is_admin() then raise exception 'Admin access required'; end if;
  perform public.nexora_require_recent_admin_mfa();
  if p_status not in ('open','in_progress','resolved','closed') then raise exception 'Invalid support status'; end if;
  update public.support_requests set status=p_status,updated_at=now() where id=p_id;
  if found then insert into private.audit_events(actor_id,action,target_type,target_id,payload) values(auth.uid(),'support.status.changed','support_request',p_id::text,jsonb_build_object('status',p_status)); end if;
  return found;
end $$;

create or replace function public.nexora_admin_audit_feed(p_limit integer default 50)
returns jsonb language sql security definer stable set search_path = '' as $$
  select case when not public.nexora_is_admin() then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'action',a.action,'targetType',a.target_type,'targetId',a.target_id,'payload',a.payload,'createdAt',a.created_at,'actorId',a.actor_id,'actorEmail',coalesce(u.email,''),'actorName',coalesce(nullif(p.full_name,''),split_part(coalesce(u.email,''),'@',1))) order by a.created_at desc) from private.audit_events a left join auth.users u on u.id=a.actor_id left join public.profiles p on p.id=a.actor_id limit greatest(1,least(coalesce(p_limit,50),100))),'[]'::jsonb) end
$$;
revoke all on function public.nexora_admin_support_queue(),public.nexora_admin_set_support_status(uuid,text),public.nexora_admin_audit_feed(integer) from public,anon;
grant execute on function public.nexora_admin_support_queue(),public.nexora_admin_set_support_status(uuid,text),public.nexora_admin_audit_feed(integer) to authenticated;

create or replace function private.nexora_actor_display_name()
returns text language sql security definer stable set search_path = '' as $$
  select coalesce(nullif((select btrim(p.full_name) from public.profiles p where p.id=auth.uid()),''),split_part(coalesce((select u.email from auth.users u where u.id=auth.uid()),'reviewer'),'@',1),'reviewer')
$$;

create or replace function private.nexora_stamp_review_identity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.nexora_require_active_actor();
  new.author_id := auth.uid();
  new.name := private.nexora_actor_display_name();
  select coalesce(email,'') into new.author_email from auth.users where id=auth.uid();
  return new;
end $$;

create or replace function private.nexora_stamp_change_request_identity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.nexora_require_active_actor();
  new.requester_id := auth.uid();
  new.requester_name := private.nexora_actor_display_name();
  return new;
end $$;

create or replace function private.nexora_stamp_proposal_identity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('accepted','declined') and (old.status is distinct from new.status or new.decided_by_id is null) then
    perform public.nexora_require_active_actor();
    new.decided_by_id := auth.uid();
    new.decided_by := private.nexora_actor_display_name();
    new.decided_at := coalesce(new.decided_at,now());
  end if;
  return new;
end $$;
drop trigger if exists nexora_stamp_proposal_identity on public.change_proposals;
create trigger nexora_stamp_proposal_identity before update on public.change_proposals for each row execute function private.nexora_stamp_proposal_identity();

create or replace function private.nexora_stamp_project_approval()
returns trigger language plpgsql security definer set search_path = '' as $$
declare actor_email text;
begin
  if new.status='approved' and old.status is distinct from 'approved' then
    perform public.nexora_require_active_actor();
    select coalesce(email,'') into actor_email from auth.users where id=auth.uid();
    new.approval := coalesce(new.approval,'{}'::jsonb) || jsonb_build_object('name',private.nexora_actor_display_name(),'reviewerId',auth.uid(),'reviewerEmail',actor_email,'approvedAt',coalesce(new.approval->>'approvedAt',now()::text));
  end if;
  return new;
end $$;
drop trigger if exists nexora_stamp_project_approval on public.projects;
create trigger nexora_stamp_project_approval before update on public.projects for each row execute function private.nexora_stamp_project_approval();

create or replace function public.nexora_review_action(p_token text,p_action jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare safe_action jsonb; display_name text; actor_email text;
begin
  if public.nexora_review_actor_allowed(p_token) is not true then raise exception 'This review is limited to invited reviewers'; end if;
  perform public.nexora_require_active_actor();
  display_name := private.nexora_actor_display_name();
  select coalesce(email,'') into actor_email from auth.users where id=auth.uid();
  safe_action := coalesce(p_action,'{}'::jsonb) || jsonb_build_object('name',display_name,'requesterName',display_name,'reviewerId',auth.uid(),'reviewerEmail',actor_email);
  update public.review_invitations i set status='responded' where i.snapshot_token=p_token and i.status in ('pending','accepted') and lower(i.invited_email)=lower(actor_email);
  return public.nexora_review_action_legacy(p_token,safe_action);
end $$;
revoke all on function public.nexora_review_action(text,jsonb) from public,anon;
grant execute on function public.nexora_review_action(text,jsonb) to authenticated;

-- REST table access must enforce the same actor/session/MFA boundary as RPCs.
drop policy if exists workspaces_member_select on public.workspaces;
create policy workspaces_member_select on public.workspaces for select to authenticated using (not public.nexora_deletion_processing() and public.nexora_session_valid() and public.nexora_mfa_satisfied() and exists (select 1 from public.workspace_members m where m.workspace_id=id and m.user_id=auth.uid()));
drop policy if exists workspace_members_self_or_admin on public.workspace_members;
create policy workspace_members_self_or_admin on public.workspace_members for select to authenticated using (not public.nexora_deletion_processing() and public.nexora_session_valid() and public.nexora_mfa_satisfied() and (user_id=auth.uid() or coalesce(public.nexora_workspace_role(workspace_id),'') in ('owner','admin')));
drop policy if exists templates_owner_select on public.brief_templates;
create policy templates_owner_select on public.brief_templates for select to authenticated using (not public.nexora_deletion_processing() and public.nexora_session_valid() and public.nexora_mfa_satisfied() and (owner_id=auth.uid() or (workspace_id is not null and public.nexora_workspace_role(workspace_id) is not null)));
drop policy if exists notifications_self_select on public.notifications;
create policy notifications_self_select on public.notifications for select to authenticated using (not public.nexora_deletion_processing() and public.nexora_session_valid() and public.nexora_mfa_satisfied() and user_id=auth.uid());
drop policy if exists notifications_self_update on public.notifications;
create policy notifications_self_update on public.notifications for update to authenticated using (not public.nexora_deletion_processing() and public.nexora_session_valid() and public.nexora_mfa_satisfied() and user_id=auth.uid()) with check (not public.nexora_deletion_processing() and public.nexora_session_valid() and public.nexora_mfa_satisfied() and user_id=auth.uid());
drop policy if exists attachment_project_select on public.project_attachments;
create policy attachment_project_select on public.project_attachments for select to authenticated using (not public.nexora_deletion_processing() and public.nexora_session_valid() and public.nexora_mfa_satisfied() and public.nexora_can_access_project(project_id,'viewer') is true);
drop policy if exists support_self_select on public.support_requests;
create policy support_self_select on public.support_requests for select to authenticated using (not public.nexora_deletion_processing() and public.nexora_session_valid() and public.nexora_mfa_satisfied() and requester_id=auth.uid());
drop policy if exists support_self_insert on public.support_requests;
create policy support_self_insert on public.support_requests for insert to authenticated with check (not public.nexora_deletion_processing() and public.nexora_session_valid() and public.nexora_mfa_satisfied() and requester_id=auth.uid());
drop policy if exists profiles_self_select on public.profiles;
create policy profiles_self_select on public.profiles for select to authenticated using (public.nexora_session_valid() and public.nexora_mfa_satisfied() and id=auth.uid());
drop policy if exists profiles_self_insert on public.profiles;
create policy profiles_self_insert on public.profiles for insert to authenticated with check (not public.nexora_deletion_processing() and public.nexora_session_valid() and public.nexora_mfa_satisfied() and id=auth.uid());
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles for update to authenticated using (not public.nexora_deletion_processing() and public.nexora_session_valid() and public.nexora_mfa_satisfied() and id=auth.uid()) with check (not public.nexora_deletion_processing() and public.nexora_session_valid() and public.nexora_mfa_satisfied() and id=auth.uid());

do $$ begin
  if to_regclass('storage.objects') is not null then
    execute 'drop policy if exists nexora_private_insert on storage.objects';
    execute $policy$create policy nexora_private_insert on storage.objects for insert to authenticated with check (
      bucket_id='nexora-private'
      and not public.nexora_deletion_processing()
      and not public.nexora_is_suspended()
      and split_part(name,'/',1)=auth.uid()::text
      and octet_length(name)<=240
      and owner_id=auth.uid()::text
      and exists (
        select 1 from public.project_attachments a
        where a.object_key=name and a.uploaded_by=auth.uid()
          and a.delete_requested_at is null
          and public.nexora_can_access_project(a.project_id,'editor')
          and (metadata->>'mimetype')=a.mime_type
          and ((metadata->>'contentLength') ~ '^[0-9]+$' and (metadata->>'contentLength')::bigint=a.byte_size
            or (metadata->>'size') ~ '^[0-9]+$' and (metadata->>'size')::bigint=a.byte_size)
      )
    )$policy$;
    execute 'drop policy if exists nexora_private_delete on storage.objects';
      execute $policy$create policy nexora_private_delete on storage.objects for delete to authenticated using (bucket_id='nexora-private' and not public.nexora_deletion_processing() and not public.nexora_is_suspended() and public.nexora_mfa_satisfied() and exists (select 1 from public.project_attachments a where a.object_key=name and a.delete_requested_at is not null and public.nexora_can_access_project(a.project_id,'editor') is true))$policy$;
  end if;
end $$;
