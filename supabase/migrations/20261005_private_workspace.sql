-- Nexora private workspace schema. Run with Supabase SQL editor or `supabase db push`.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120), client text not null check (char_length(client) between 1 and 120),
  brief text not null check (char_length(brief) between 24 and 20000), analysis jsonb not null, scope jsonb not null,
  status text not null default 'draft' check (status in ('draft','shared','changes_requested','approved')),
  review_token text unique, approval jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.review_snapshots (
  token text primary key check (char_length(token) >= 32), project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade, project_json jsonb not null, status text not null default 'shared' check (status in ('shared','approved','revoked')),
  created_at timestamptz not null default now()
);
create table if not exists public.review_comments (
  id bigint generated always as identity primary key, snapshot_token text not null references public.review_snapshots(token) on delete cascade,
  name text not null check (char_length(name) between 1 and 120), comment text not null check (char_length(comment) between 1 and 4000),
  action text not null check (action in ('feedback','approval')), created_at timestamptz not null default now()
);
create table if not exists public.change_requests (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
  snapshot_token text not null references public.review_snapshots(token), requester_name text not null check (char_length(requester_name) between 1 and 120),
  title text not null check (char_length(title) between 1 and 160), details text not null check (char_length(details) between 1 and 4000),
  status text not null default 'open' check (status in ('open','proposed','accepted','declined')), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.change_proposals (
  id uuid primary key default gen_random_uuid(), request_id uuid not null references public.change_requests(id) on delete cascade,
  version integer not null check (version > 0), title text not null, details text not null, affected_deliverables jsonb not null,
  price_adjustment numeric(12,2) not null, currency text not null check (currency ~ '^[A-Z]{3}$'), timeline_impact text not null, rationale text not null,
  status text not null default 'sent' check (status in ('sent','accepted','declined')), created_at timestamptz not null default now(), decided_by text, decision_comment text, decided_at timestamptz,
  unique(request_id, version)
);

alter table public.projects enable row level security; alter table public.review_snapshots enable row level security;
alter table public.review_comments enable row level security; alter table public.change_requests enable row level security; alter table public.change_proposals enable row level security;
drop policy if exists projects_owner_select on public.projects;
create policy projects_owner_select on public.projects for select to authenticated using (owner_id = (select auth.uid()));
drop policy if exists snapshots_owner_select on public.review_snapshots;
create policy snapshots_owner_select on public.review_snapshots for select to authenticated using (owner_id = (select auth.uid()));
drop policy if exists comments_owner_select on public.review_comments;
create policy comments_owner_select on public.review_comments for select to authenticated using (exists (select 1 from public.review_snapshots s where s.token=snapshot_token and s.owner_id=(select auth.uid())));
drop policy if exists requests_owner_select on public.change_requests;
create policy requests_owner_select on public.change_requests for select to authenticated using (exists (select 1 from public.projects p where p.id=project_id and p.owner_id=(select auth.uid())));
drop policy if exists proposals_owner_select on public.change_proposals;
create policy proposals_owner_select on public.change_proposals for select to authenticated using (exists (select 1 from public.change_requests r join public.projects p on p.id=r.project_id where r.id=request_id and p.owner_id=(select auth.uid())));

revoke all on public.projects, public.review_snapshots, public.review_comments, public.change_requests, public.change_proposals from anon, authenticated;
grant select on public.projects, public.review_snapshots, public.review_comments, public.change_requests, public.change_proposals to authenticated;

create or replace function public.nexora_valid_project_json(p_project jsonb) returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(p_project)='object'
    and jsonb_typeof(p_project->'title')='string' and char_length(btrim(coalesce(p_project->>'title',''))) between 1 and 120
    and jsonb_typeof(p_project->'client')='string' and char_length(btrim(coalesce(p_project->>'client',''))) between 1 and 120
    and jsonb_typeof(p_project->'brief')='string' and char_length(btrim(coalesce(p_project->>'brief',''))) between 24 and 20000
    and jsonb_typeof(p_project->'analysis')='object'
    and jsonb_typeof(p_project->'analysis'->'mode')='string' and (p_project->'analysis'->>'mode') in ('local','openai')
    and jsonb_typeof(p_project->'analysis'->'summary')='string' and char_length(btrim(coalesce(p_project->'analysis'->>'summary',''))) between 1 and 2000
    and jsonb_typeof(p_project->'analysis'->'audience')='string' and char_length(btrim(coalesce(p_project->'analysis'->>'audience',''))) between 1 and 500
    and jsonb_typeof(p_project->'analysis'->'goals')='array' and jsonb_array_length(p_project->'analysis'->'goals')<=50 and not exists(select 1 from jsonb_array_elements(p_project->'analysis'->'goals') e where jsonb_typeof(e)<>'string' or char_length(btrim(e #>> '{}')) not between 1 and 500)
    and jsonb_typeof(p_project->'analysis'->'pages')='array' and jsonb_array_length(p_project->'analysis'->'pages')<=50 and not exists(select 1 from jsonb_array_elements(p_project->'analysis'->'pages') e where jsonb_typeof(e)<>'string' or char_length(btrim(e #>> '{}')) not between 1 and 500)
    and jsonb_typeof(p_project->'analysis'->'needs')='array' and jsonb_array_length(p_project->'analysis'->'needs')<=50 and not exists(select 1 from jsonb_array_elements(p_project->'analysis'->'needs') e where jsonb_typeof(e)<>'string' or char_length(btrim(e #>> '{}')) not between 1 and 500)
    and jsonb_typeof(p_project->'analysis'->'risks')='array' and jsonb_array_length(p_project->'analysis'->'risks')<=50 and not exists(select 1 from jsonb_array_elements(p_project->'analysis'->'risks') e where jsonb_typeof(e)<>'string' or char_length(btrim(e #>> '{}')) not between 1 and 500)
    and jsonb_typeof(p_project->'analysis'->'questions')='array' and jsonb_array_length(p_project->'analysis'->'questions')<=50 and not exists(select 1 from jsonb_array_elements(p_project->'analysis'->'questions') e where jsonb_typeof(e)<>'string' or char_length(btrim(e #>> '{}')) not between 1 and 500)
    and jsonb_typeof(p_project->'scope')='object'
    and (select jsonb_typeof(p_project->'scope'->'deliverables')='array' and jsonb_array_length(p_project->'scope'->'deliverables')<=50 and not exists(select 1 from jsonb_array_elements(p_project->'scope'->'deliverables') e where jsonb_typeof(e)<>'string' or char_length(btrim(e #>> '{}')) not between 1 and 500))
    and (select jsonb_typeof(p_project->'scope'->'included')='array' and jsonb_array_length(p_project->'scope'->'included')<=50 and not exists(select 1 from jsonb_array_elements(p_project->'scope'->'included') e where jsonb_typeof(e)<>'string' or char_length(btrim(e #>> '{}')) not between 1 and 500))
    and (select jsonb_typeof(p_project->'scope'->'excluded')='array' and jsonb_array_length(p_project->'scope'->'excluded')<=50 and not exists(select 1 from jsonb_array_elements(p_project->'scope'->'excluded') e where jsonb_typeof(e)<>'string' or char_length(btrim(e #>> '{}')) not between 1 and 500))
    and jsonb_typeof(p_project->'scope'->'milestones')='array' and jsonb_array_length(p_project->'scope'->'milestones')<=20
    and not exists(select 1 from jsonb_array_elements(p_project->'scope'->'milestones') e where jsonb_typeof(e)<>'object' or jsonb_typeof(e->'name')<>'string' or jsonb_typeof(e->'detail')<>'string' or jsonb_typeof(e->'timing')<>'string' or char_length(btrim(coalesce(e->>'name',''))) not between 1 and 300 or char_length(btrim(coalesce(e->>'detail',''))) not between 1 and 300 or char_length(btrim(coalesce(e->>'timing',''))) not between 1 and 300)
    and jsonb_typeof(p_project->'scope'->'revisions')='number' and (p_project->'scope'->>'revisions') ~ '^[0-9]+$' and (p_project->'scope'->>'revisions')::integer between 0 and 20;
$$;
revoke all on function public.nexora_valid_project_json(jsonb) from public,anon,authenticated;

create or replace function public.nexora_list_projects() returns setof jsonb language sql security invoker stable set search_path = '' as $$
  select jsonb_build_object('id',id,'title',title,'client',client,'brief',brief,'analysis',analysis,'scope',scope,'status',status,'reviewToken',review_token,'approval',approval,'createdAt',created_at,'updatedAt',updated_at)
  from public.projects where owner_id=(select auth.uid()) order by updated_at desc;
$$;
create or replace function public.nexora_get_project(p_project_id uuid) returns jsonb language sql security invoker stable set search_path = '' as $$
  select jsonb_build_object('id',id,'title',title,'client',client,'brief',brief,'analysis',analysis,'scope',scope,'status',status,'reviewToken',review_token,'approval',approval,'createdAt',created_at,'updatedAt',updated_at)
  from public.projects where id=p_project_id and owner_id=(select auth.uid());
$$;
create or replace function public.nexora_create_project(p_project jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.projects;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if public.nexora_valid_project_json(p_project) is not true then raise exception 'Malformed project'; end if;
  insert into public.projects(owner_id,title,client,brief,analysis,scope) values (auth.uid(),p_project->>'title',p_project->>'client',p_project->>'brief',p_project->'analysis',p_project->'scope') returning * into p;
  return jsonb_build_object('id',p.id,'title',p.title,'client',p.client,'brief',p.brief,'analysis',p.analysis,'scope',p.scope,'status',p.status,'createdAt',p.created_at,'updatedAt',p.updated_at);
end $$;
create or replace function public.nexora_update_project(p_project_id uuid,p_project jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.projects; old public.projects;
begin
  select * into old from public.projects where id=p_project_id and owner_id=auth.uid() for update;
  if not found then raise exception 'Project not found'; end if;
  if old.status='approved' then raise exception 'Approved scopes are locked'; end if;
  if public.nexora_valid_project_json(p_project) is not true then raise exception 'Malformed project'; end if;
  if old.title=p_project->>'title' and old.client=p_project->>'client' and old.brief=p_project->>'brief' and old.analysis=p_project->'analysis' and old.scope=p_project->'scope' then return public.nexora_get_project(p_project_id); end if;
  if old.review_token is not null then update public.review_snapshots set status='revoked' where token=old.review_token and status<>'approved'; end if;
  update public.projects set title=p_project->>'title',client=p_project->>'client',brief=p_project->>'brief',analysis=p_project->'analysis',scope=p_project->'scope',status='draft',review_token=null,updated_at=now() where id=p_project_id returning * into p;
  return public.nexora_get_project(p_project_id);
end $$;
create or replace function public.nexora_share_project(p_project_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.projects; token text := encode(extensions.gen_random_bytes(32),'hex');
begin
  select * into p from public.projects where id=p_project_id and owner_id=auth.uid() for update;
  if not found then raise exception 'Project not found'; end if;
  if p.status='approved' then raise exception 'Approved scopes are locked and cannot be reshared'; end if;
  if p.status='shared' and p.review_token is not null then return public.nexora_get_project(p_project_id); end if;
  update public.review_snapshots set status='revoked' where project_id=p_project_id and status<>'approved';
  update public.projects set review_token=token,status='shared',updated_at=now() where id=p_project_id;
  insert into public.review_snapshots(token,project_id,owner_id,project_json,status) select token,id,owner_id,jsonb_build_object('id',id,'title',title,'client',client,'brief',brief,'analysis',analysis,'scope',scope,'status',status,'reviewToken',token,'createdAt',created_at,'updatedAt',updated_at),'shared' from public.projects where id=p_project_id;
  return public.nexora_get_project(p_project_id);
end $$;
revoke all on function public.nexora_create_project(jsonb),public.nexora_update_project(uuid,jsonb),public.nexora_share_project(uuid) from public,anon;
grant execute on function public.nexora_create_project(jsonb),public.nexora_update_project(uuid,jsonb),public.nexora_share_project(uuid) to authenticated;

create or replace function public.nexora_project_history(p_project_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb; owner_ok boolean;
begin
  select exists(select 1 from public.projects where id=p_project_id and owner_id=auth.uid()) into owner_ok;
  if not owner_ok then raise exception 'Project not found'; end if;
  select jsonb_build_object(
    'responses', coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'comment',c.comment,'action',c.action,'createdAt',c.created_at,'token',c.snapshot_token,'snapshotCreatedAt',s.created_at,'snapshotStatus',case when s.status='approved' then 'approved' when s.status='revoked' then 'revoked' when p.review_token=c.snapshot_token then 'current' else 'superseded' end) order by c.id desc) from public.review_comments c join public.review_snapshots s on s.token=c.snapshot_token where s.project_id=p_project_id),'[]'::jsonb),
    'changeRequests', coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'projectId',r.project_id,'token',r.snapshot_token,'requesterName',r.requester_name,'title',r.title,'details',r.details,'status',r.status,'createdAt',r.created_at,'updatedAt',r.updated_at,'proposals',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'requestId',q.request_id,'version',q.version,'title',q.title,'details',q.details,'affectedDeliverables',q.affected_deliverables,'priceAdjustment',q.price_adjustment,'currency',q.currency,'timelineImpact',q.timeline_impact,'rationale',q.rationale,'status',q.status,'createdAt',q.created_at,'decidedBy',q.decided_by,'decisionComment',q.decision_comment,'decidedAt',q.decided_at) order by q.version) from public.change_proposals q where q.request_id=r.id),'[]'::jsonb)) order by r.created_at desc) from public.change_requests r where r.project_id=p_project_id),'[]'::jsonb)
  ) into result from public.projects p where p.id=p_project_id;
  return result;
end $$;
revoke all on function public.nexora_list_projects(),public.nexora_get_project(uuid),public.nexora_project_history(uuid) from public,anon;
grant execute on function public.nexora_list_projects(),public.nexora_get_project(uuid),public.nexora_project_history(uuid) to authenticated;

create or replace function public.nexora_create_change_proposal(p_project_id uuid,p_input jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.change_requests; latest public.change_proposals; p public.projects; next_version integer;
begin
  select * into p from public.projects where id=p_project_id and owner_id=auth.uid() for update;
  if not found then raise exception 'Project not found'; end if;
  if p.status <> 'approved' then raise exception 'Proposals can only be written against an approved scope'; end if;
    if p_input is null or jsonb_typeof(p_input) is distinct from 'object' or not (p_input ?& array['requestId','title','details','affectedDeliverables','priceAdjustment','currency','timelineImpact','rationale']) then raise exception 'Malformed proposal'; end if;
    if p_input is null or jsonb_typeof(p_input) is distinct from 'object' or jsonb_typeof(p_input->'requestId') is distinct from 'string' or char_length(btrim(coalesce(p_input->>'requestId',''))) = 0 or jsonb_typeof(p_input->'title') is distinct from 'string' or char_length(btrim(coalesce(p_input->>'title',''))) not between 1 and 160 or jsonb_typeof(p_input->'details') is distinct from 'string' or char_length(btrim(coalesce(p_input->>'details',''))) not between 1 and 4000 or jsonb_typeof(p_input->'timelineImpact') is distinct from 'string' or char_length(btrim(coalesce(p_input->>'timelineImpact',''))) not between 1 and 500 or jsonb_typeof(p_input->'rationale') is distinct from 'string' or char_length(btrim(coalesce(p_input->>'rationale',''))) not between 1 and 2000 or jsonb_typeof(p_input->'currency') is distinct from 'string' or not (p_input->>'currency' ~ '^[A-Z]{3}$') or jsonb_typeof(p_input->'priceAdjustment') is distinct from 'number' or not (p_input->>'priceAdjustment' ~ '^-?[0-9]+(\.[0-9]{1,2})?$') or abs((p_input->>'priceAdjustment')::numeric) > 10000000 or not (p_input ? 'affectedDeliverables') or jsonb_typeof(p_input->'affectedDeliverables') is distinct from 'array' or jsonb_array_length(p_input->'affectedDeliverables') > 30 or exists(select 1 from jsonb_array_elements(p_input->'affectedDeliverables') e where jsonb_typeof(e) is distinct from 'string' or char_length(btrim(e #>> '{}')) not between 1 and 300) then raise exception 'Malformed proposal'; end if;
  select * into r from public.change_requests where id=(p_input->>'requestId')::uuid and project_id=p_project_id for update;
  if not found then raise exception 'Change request not found for this project'; end if;
  select * into latest from public.change_proposals where request_id=r.id order by version desc limit 1;
  if latest.status='sent' then raise exception 'This change request already has a proposal waiting for a decision'; end if;
  if r.status='accepted' then raise exception 'This change request was accepted'; end if;
  next_version := coalesce(latest.version,0)+1;
  insert into public.change_proposals(request_id,version,title,details,affected_deliverables,price_adjustment,currency,timeline_impact,rationale) values (r.id,next_version,p_input->>'title',p_input->>'details',p_input->'affectedDeliverables',(p_input->>'priceAdjustment')::numeric,p_input->>'currency',p_input->>'timelineImpact',p_input->>'rationale');
  update public.change_requests set status='proposed',updated_at=now() where id=r.id;
  return public.nexora_project_history(p_project_id);
exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'Malformed proposal';
end $$;
revoke all on function public.nexora_create_change_proposal(uuid,jsonb) from public,anon;
grant execute on function public.nexora_create_change_proposal(uuid,jsonb) to authenticated;

-- Review RPCs are authenticated-only until the product owner explicitly enables anonymous token capability.
create or replace function public.nexora_get_review(p_token text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.review_snapshots; p jsonb; current_approval jsonb; comments jsonb; requests jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  select * into s from public.review_snapshots where token=p_token and status<>'revoked';
  if not found then raise exception 'Review link not found or no longer active'; end if;
  p := s.project_json || jsonb_build_object('reviewToken',s.token,'snapshotCreatedAt',s.created_at,'status',case when s.status='approved' then 'approved' else (s.project_json->>'status') end);
  select approval into current_approval from public.projects where id=s.project_id;
  p := p || jsonb_build_object('approval',current_approval);
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'comment',comment,'action',action,'createdAt',created_at) order by id),'[]'::jsonb) into comments from public.review_comments where snapshot_token=s.token;
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'projectId',r.project_id,'token',r.snapshot_token,'requesterName',r.requester_name,'title',r.title,'details',r.details,'status',r.status,'createdAt',r.created_at,'updatedAt',r.updated_at,'proposals',coalesce((select jsonb_agg(jsonb_build_object('id',cp.id,'requestId',cp.request_id,'version',cp.version,'title',cp.title,'details',cp.details,'affectedDeliverables',cp.affected_deliverables,'priceAdjustment',cp.price_adjustment,'currency',cp.currency,'timelineImpact',cp.timeline_impact,'rationale',cp.rationale,'status',cp.status,'createdAt',cp.created_at,'decidedBy',cp.decided_by,'decisionComment',cp.decision_comment,'decidedAt',cp.decided_at) order by cp.version) from public.change_proposals cp where cp.request_id=r.id),'[]'::jsonb)) order by r.created_at desc),'[]'::jsonb) into requests from public.change_requests r where r.project_id=s.project_id;
  return p || jsonb_build_object('comments',comments,'changeRequests',requests);
end $$;
create or replace function public.nexora_review_action(p_token text,p_action jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.review_snapshots; p public.projects; r public.change_requests; q public.change_proposals; latest_version integer; action text := p_action->>'action'; name text := btrim(coalesce(p_action->>'name','')); comment text := btrim(coalesce(p_action->>'comment','')); decision text;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  select * into s from public.review_snapshots where token=p_token and status<>'revoked';
  if not found then raise exception 'Review link not found or no longer active'; end if;
  select * into p from public.projects where id=s.project_id for update;
  select * into s from public.review_snapshots where token=p_token and status<>'revoked' for update;
  if not found then raise exception 'Review link is no longer active'; end if;
  if action in ('approval','feedback') then
    if char_length(name) not between 1 and 120 or char_length(comment) not between 1 and 4000 then raise exception 'Add your name and a comment up to 4,000 characters'; end if;
    if action='approval' then
      if p.status='approved' then return public.nexora_get_review(p_token); end if;
      if p.review_token<>p_token or s.status<>'shared' then raise exception 'This review link is no longer current'; end if;
      update public.projects set status='approved',approval=jsonb_build_object('name',name,'comment',comment,'approvedAt',now()),updated_at=now() where id=p.id;
      update public.review_snapshots set status='approved' where token=p_token;
    elsif p.status<>'approved' then update public.projects set status='changes_requested',updated_at=now() where id=p.id; end if;
    insert into public.review_comments(snapshot_token,name,comment,action) values(p_token,name,comment,action);
  elsif action='change_request' then
    if p.status <> 'approved' or s.status <> 'approved' or p.review_token<>p_token then raise exception 'Change requests are available after the current scope is approved'; end if;
    if char_length(name) not between 1 and 120 or char_length(btrim(coalesce(p_action->>'title',''))) not between 1 and 160 or char_length(btrim(coalesce(p_action->>'details',''))) not between 1 and 4000 then raise exception 'Add your name, a short request title, and details up to 4,000 characters'; end if;
    insert into public.change_requests(project_id,snapshot_token,requester_name,title,details) values(p.id,p_token,name,btrim(p_action->>'title'),btrim(p_action->>'details'));
  elsif action='proposal_decision' then
    decision := p_action->>'decision';
    if p.status <> 'approved' or p.review_token<>p_token or decision not in ('accepted','declined') or char_length(name) not between 1 and 120 or char_length(comment)>4000 then raise exception 'Invalid proposal decision'; end if;
    select cp.* into q from public.change_proposals cp join public.change_requests cr on cr.id=cp.request_id where cp.id=(p_action->>'proposalId')::uuid and cr.project_id=p.id for update;
    if not found then raise exception 'Change proposal not found'; end if;
    select max(version) into latest_version from public.change_proposals where request_id=q.request_id;
    if q.version<>latest_version then raise exception 'This proposal is no longer the latest version'; end if;
    if q.status<> 'sent' then if q.status=decision then return public.nexora_get_review(p_token); else raise exception 'This proposal already has a different decision'; end if; end if;
    update public.change_proposals set status=decision,decided_by=name,decision_comment=comment,decided_at=now() where id=q.id and status='sent';
    update public.change_requests set status=decision,updated_at=now() where id=q.request_id;
  else raise exception 'Unsupported review action'; end if;
  return public.nexora_get_review(p_token);
end $$;
revoke all on function public.nexora_get_review(text),public.nexora_review_action(text,jsonb) from public,anon;
grant execute on function public.nexora_get_review(text),public.nexora_review_action(text,jsonb) to authenticated;
