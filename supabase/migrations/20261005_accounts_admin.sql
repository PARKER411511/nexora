-- Nexora account profiles and a database-maintained admin allowlist.
-- Apply after 20261005_private_workspace.sql. The allowlist is intentionally
-- outside public and has no client table grants; only the narrow RPCs below
-- can expose admin summaries.
create schema if not exists private;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 120),
  company text not null default '' check (char_length(company) <= 120),
  role_title text not null default '' check (char_length(role_title) <= 120),
  website text not null default '' check (char_length(website) <= 300),
  bio text not null default '' check (char_length(bio) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists private.nexora_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table private.nexora_admins enable row level security;

alter table public.profiles enable row level security;
drop policy if exists profiles_self_select on public.profiles;
create policy profiles_self_select on public.profiles
  for select to authenticated using (id = (select auth.uid()));
drop policy if exists profiles_self_insert on public.profiles;
create policy profiles_self_insert on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
revoke all on private.nexora_admins from public, anon, authenticated;

create or replace function public.nexora_profile_on_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    left(btrim(coalesce(new.raw_user_meta_data->>'full_name', '')), 120)
  )
  on conflict (id) do nothing;
  return new;
end
$$;

drop trigger if exists nexora_create_profile_on_signup on auth.users;
create trigger nexora_create_profile_on_signup
after insert on auth.users
for each row execute function public.nexora_profile_on_signup();

create or replace function public.nexora_valid_profile_json(p_profile jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p_profile) = 'object'
    and jsonb_typeof(p_profile->'fullName') = 'string'
    and char_length(btrim(coalesce(p_profile->>'fullName', ''))) <= 120
    and jsonb_typeof(p_profile->'company') = 'string'
    and char_length(btrim(coalesce(p_profile->>'company', ''))) <= 120
    and jsonb_typeof(p_profile->'roleTitle') = 'string'
    and char_length(btrim(coalesce(p_profile->>'roleTitle', ''))) <= 120
    and jsonb_typeof(p_profile->'website') = 'string'
    and char_length(btrim(coalesce(p_profile->>'website', ''))) <= 300
    and (
      btrim(coalesce(p_profile->>'website', '')) = ''
      or btrim(p_profile->>'website') ~* '^https?://[^[:space:]]+$'
    )
    and jsonb_typeof(p_profile->'bio') = 'string'
    and char_length(btrim(coalesce(p_profile->>'bio', ''))) <= 2000;
$$;
revoke all on function public.nexora_valid_profile_json(jsonb) from public, anon, authenticated;

create or replace function public.nexora_get_profile()
returns jsonb
language sql
security definer
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id,
    'fullName', p.full_name,
    'company', p.company,
    'roleTitle', p.role_title,
    'website', p.website,
    'bio', p.bio,
    'createdAt', p.created_at,
    'updatedAt', p.updated_at
  )
  from public.profiles p
  where p.id = (select auth.uid());
$$;

create or replace function public.nexora_update_profile(p_profile jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare p public.profiles;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if public.nexora_valid_profile_json(p_profile) is not true then
    raise exception 'Malformed profile';
  end if;
  insert into public.profiles (id, full_name, company, role_title, website, bio)
  values (
    auth.uid(),
    btrim(p_profile->>'fullName'),
    btrim(p_profile->>'company'),
    btrim(p_profile->>'roleTitle'),
    btrim(p_profile->>'website'),
    btrim(p_profile->>'bio')
  )
  on conflict (id) do update set
    full_name = excluded.full_name,
    company = excluded.company,
    role_title = excluded.role_title,
    website = excluded.website,
    bio = excluded.bio,
    updated_at = now()
  returning * into p;
  return jsonb_build_object(
    'id', p.id,
    'fullName', p.full_name,
    'company', p.company,
    'roleTitle', p.role_title,
    'website', p.website,
    'bio', p.bio,
    'createdAt', p.created_at,
    'updatedAt', p.updated_at
  );
end
$$;

create or replace function public.nexora_is_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from private.nexora_admins a where a.user_id = auth.uid()
  );
$$;

create or replace function public.nexora_admin_customers()
returns setof jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  if not public.nexora_is_admin() then raise exception 'Admin access required'; end if;
  return query
  select jsonb_build_object(
    'id', u.id,
    'email', coalesce(u.email, ''),
    'name', coalesce(nullif(p.full_name, ''), split_part(coalesce(u.email, ''), '@', 1)),
    'company', coalesce(p.company, ''),
    'joinedAt', u.created_at,
    'projectCount', count(pr.id)
  )
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.projects pr on pr.owner_id = u.id
  group by u.id, u.email, u.created_at, p.full_name, p.company
  order by u.created_at desc
  limit 100;
end
$$;

create or replace function public.nexora_admin_projects()
returns setof jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  if not public.nexora_is_admin() then raise exception 'Admin access required'; end if;
  return query
  select jsonb_build_object(
    'id', pr.id,
    'name', pr.title,
    'status', pr.status,
    'createdAt', pr.created_at,
    'updatedAt', pr.updated_at,
    'customer', jsonb_build_object(
      'id', u.id,
      'email', coalesce(u.email, ''),
      'name', coalesce(nullif(p.full_name, ''), split_part(coalesce(u.email, ''), '@', 1)),
      'company', coalesce(p.company, '')
    )
  )
  from public.projects pr
  join auth.users u on u.id = pr.owner_id
  left join public.profiles p on p.id = u.id
  order by pr.updated_at desc
  limit 100;
end
$$;

create or replace function public.nexora_admin_overview()
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  if not public.nexora_is_admin() then raise exception 'Admin access required'; end if;
  return jsonb_build_object(
    'customerCount', (select count(*) from auth.users),
    'projectCount', (select count(*) from public.projects),
    'customers', coalesce((select jsonb_agg(c.item order by c.item->>'joinedAt' desc) from public.nexora_admin_customers() as c(item)), '[]'::jsonb),
    'projects', coalesce((select jsonb_agg(p.item order by p.item->>'updatedAt' desc) from public.nexora_admin_projects() as p(item)), '[]'::jsonb)
  );
end
$$;

revoke all on function public.nexora_get_profile(), public.nexora_update_profile(jsonb), public.nexora_is_admin(), public.nexora_admin_customers(), public.nexora_admin_projects(), public.nexora_admin_overview() from public, anon;
grant execute on function public.nexora_get_profile(), public.nexora_update_profile(jsonb), public.nexora_is_admin(), public.nexora_admin_customers(), public.nexora_admin_projects(), public.nexora_admin_overview() to authenticated;
