create extension if not exists pgcrypto;

create type member_role     as enum ('owner','admin','editor','viewer');
create type social_platform as enum ('facebook','instagram','threads','linkedin','x','tiktok','youtube','pinterest','gbp','bluesky','mastodon','telegram');
create type account_status  as enum ('active','reconnect_needed','disabled');
create type post_origin     as enum ('manual','wordpress','rss','api','agent','csv','evergreen');
create type variant_status  as enum ('draft','pending_approval','scheduled','publishing','published','failed','cancelled');
create type media_kind      as enum ('image','video');

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  timezone text not null default 'America/Toronto',
  brand_voice text,
  require_approval boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role member_role not null default 'editor',
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user_idx on public.workspace_members(user_id);

create or replace function public.is_member(ws uuid, min_role member_role default 'viewer')
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = (select auth.uid())
      and array_position(array['viewer','editor','admin','owner']::public.member_role[], m.role)
       >= array_position(array['viewer','editor','admin','owner']::public.member_role[], min_role)
  );
$$;

create table public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  platform social_platform not null,
  external_id text not null,
  account_type text,
  handle text,
  display_name text,
  avatar_url text,
  status account_status not null default 'active',
  token_expires_at timestamptz,
  settings jsonb not null default '{}'::jsonb,
  last_error text,
  connected_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (workspace_id, platform, external_id)
);

-- Encrypted tokens. RLS on, no policies: only the server (service role) can read/write.
create table public.account_credentials (
  account_id uuid primary key references public.social_accounts(id) on delete cascade,
  ciphertext text not null,
  updated_at timestamptz not null default now()
);

-- Short-lived OAuth state (PKCE verifier etc.). Server-only.
create table public.oauth_states (
  state text primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform social_platform not null,
  code_verifier text,
  created_at timestamptz not null default now()
);

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  storage_path text not null,
  public_url text not null,
  kind media_kind not null,
  mime_type text,
  bytes bigint,
  width int, height int, duration_sec numeric,
  alt_text text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  origin post_origin not null default 'manual',
  base_text text not null default '',
  link_url text,
  media_ids uuid[] not null default '{}',
  campaign text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.post_variants (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  account_id uuid not null references public.social_accounts(id) on delete cascade,
  body text not null default '',
  title text,
  link_url text,
  media_ids uuid[] not null default '{}',
  options jsonb not null default '{}'::jsonb,
  status variant_status not null default 'draft',
  scheduled_at timestamptz,
  approved_by uuid references auth.users(id),
  published_at timestamptz,
  external_post_id text,
  external_url text,
  attempts int not null default 0,
  next_attempt_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (post_id, account_id)
);
create index post_variants_due_idx on public.post_variants (status, scheduled_at);
create index post_variants_ws_time_idx on public.post_variants (workspace_id, scheduled_at);
create index post_variants_account_idx on public.post_variants (account_id);
create index post_variants_post_idx on public.post_variants (post_id);

create table public.posting_slots (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.social_accounts(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  local_time time not null,
  active boolean not null default true,
  unique (account_id, day_of_week, local_time)
);

create table public.publish_attempts (
  id bigint generated always as identity primary key,
  variant_id uuid not null references public.post_variants(id) on delete cascade,
  attempt_no int not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  success boolean,
  error_message text,
  retryable boolean,
  response jsonb
);
create index publish_attempts_variant_idx on public.publish_attempts(variant_id);

create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;
create trigger post_variants_touch before update on public.post_variants
  for each row execute function public.touch_updated_at();

create or replace function public.create_workspace(p_name text, p_slug text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare ws uuid;
begin
  if (select auth.uid()) is null then raise exception 'not authenticated'; end if;
  insert into public.workspaces(name, slug) values (p_name, p_slug) returning id into ws;
  insert into public.workspace_members(workspace_id, user_id, role) values (ws, (select auth.uid()), 'owner');
  return ws;
end $$;
revoke execute on function public.create_workspace(text, text) from anon, public;
grant execute on function public.create_workspace(text, text) to authenticated;

create or replace function public.claim_due_variants(p_limit int default 25)
returns setof public.post_variants language plpgsql security definer set search_path = '' as $$
begin
  return query
  update public.post_variants v set status = 'publishing', attempts = v.attempts + 1
  where v.id in (
    select id from public.post_variants
    where (status = 'scheduled' and scheduled_at <= now())
       or (status = 'failed' and next_attempt_at is not null and next_attempt_at <= now() and attempts < 4)
    order by scheduled_at
    limit p_limit
    for update skip locked
  )
  returning v.*;
end $$;
revoke execute on function public.claim_due_variants(int) from anon, authenticated, public;

create or replace function public.release_stuck_variants()
returns int language sql security definer set search_path = '' as $$
  with u as (
    update public.post_variants set status = 'failed', next_attempt_at = now(), last_error = 'Publisher timed out; retrying'
    where status = 'publishing' and updated_at < now() - interval '15 minutes' returning 1)
  select count(*)::int from u;
$$;
revoke execute on function public.release_stuck_variants() from anon, authenticated, public;

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.social_accounts enable row level security;
alter table public.account_credentials enable row level security;
alter table public.oauth_states enable row level security;
alter table public.media_assets enable row level security;
alter table public.posts enable row level security;
alter table public.post_variants enable row level security;
alter table public.posting_slots enable row level security;
alter table public.publish_attempts enable row level security;

create policy ws_read on public.workspaces for select to authenticated using (public.is_member(id));
create policy ws_update on public.workspaces for update to authenticated using (public.is_member(id,'admin'));
create policy wm_read on public.workspace_members for select to authenticated using (public.is_member(workspace_id));
create policy wm_admin on public.workspace_members for all to authenticated using (public.is_member(workspace_id,'admin')) with check (public.is_member(workspace_id,'admin'));
create policy sa_read on public.social_accounts for select to authenticated using (public.is_member(workspace_id));
create policy sa_update on public.social_accounts for update to authenticated using (public.is_member(workspace_id,'admin'));
create policy sa_delete on public.social_accounts for delete to authenticated using (public.is_member(workspace_id,'admin'));
create policy ma_read on public.media_assets for select to authenticated using (public.is_member(workspace_id));
create policy ma_write on public.media_assets for insert to authenticated with check (public.is_member(workspace_id,'editor'));
create policy ma_delete on public.media_assets for delete to authenticated using (public.is_member(workspace_id,'editor'));
create policy p_read on public.posts for select to authenticated using (public.is_member(workspace_id));
create policy p_ins on public.posts for insert to authenticated with check (public.is_member(workspace_id,'editor'));
create policy p_upd on public.posts for update to authenticated using (public.is_member(workspace_id,'editor'));
create policy p_del on public.posts for delete to authenticated using (public.is_member(workspace_id,'editor'));
create policy pv_read on public.post_variants for select to authenticated using (public.is_member(workspace_id));
create policy pv_ins on public.post_variants for insert to authenticated with check (public.is_member(workspace_id,'editor'));
create policy pv_upd on public.post_variants for update to authenticated using (public.is_member(workspace_id,'editor'));
create policy pv_del on public.post_variants for delete to authenticated using (public.is_member(workspace_id,'editor'));
create policy ps_read on public.posting_slots for select to authenticated using (
  exists (select 1 from public.social_accounts a where a.id = account_id and public.is_member(a.workspace_id)));
create policy ps_write on public.posting_slots for all to authenticated using (
  exists (select 1 from public.social_accounts a where a.id = account_id and public.is_member(a.workspace_id,'editor')))
  with check (exists (select 1 from public.social_accounts a where a.id = account_id and public.is_member(a.workspace_id,'editor')));
create policy pa_read on public.publish_attempts for select to authenticated using (
  exists (select 1 from public.post_variants v where v.id = variant_id and public.is_member(v.workspace_id)));

insert into storage.buckets (id, name, public, file_size_limit)
values ('media','media', true, 524288000) on conflict (id) do nothing;
create policy media_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and public.is_member(((storage.foldername(name))[1])::uuid, 'editor'));
create policy media_remove on storage.objects for delete to authenticated
  using (bucket_id = 'media' and public.is_member(((storage.foldername(name))[1])::uuid, 'editor'));
