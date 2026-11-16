-- Website/RSS sources that turn new articles into posts
create table public.content_sources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  url text not null,
  mode text not null default 'draft' check (mode in ('draft','queue')),
  account_ids uuid[] not null default '{}',
  use_ai boolean not null default true,
  active boolean not null default true,
  last_checked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
create index content_sources_ws_idx on public.content_sources(workspace_id);

create table public.source_items (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.content_sources(id) on delete cascade,
  guid text not null,
  title text,
  link text,
  published_at timestamptz,
  post_id uuid references public.posts(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (source_id, guid)
);

alter table public.posts add column if not exists source_item_id uuid references public.source_items(id) on delete set null;
alter table public.posts add column if not exists title text;

alter table public.content_sources enable row level security;
alter table public.source_items enable row level security;
create policy cs_read on public.content_sources for select to authenticated using (public.is_member(workspace_id));
create policy cs_write on public.content_sources for all to authenticated using (public.is_member(workspace_id,'admin')) with check (public.is_member(workspace_id,'admin'));
create policy si_read on public.source_items for select to authenticated using (
  exists (select 1 from public.content_sources s where s.id = source_id and public.is_member(s.workspace_id)));

create or replace function public.next_free_slot(p_account uuid, p_after timestamptz default now())
returns timestamptz language sql stable security invoker set search_path = '' as $$
  with tz as (
    select w.timezone as z from public.social_accounts a join public.workspaces w on w.id = a.workspace_id where a.id = p_account
  ), days as (
    select d::date as d
    from tz, generate_series((p_after at time zone tz.z)::date, (p_after at time zone tz.z)::date + 42, interval '1 day') d
  ), candidates as (
    select ((days.d + s.local_time) at time zone (select z from tz)) as ts
    from days join public.posting_slots s
      on s.account_id = p_account and s.active and s.day_of_week = extract(dow from days.d)::int
  )
  select c.ts from candidates c
  where c.ts > p_after
    and not exists (
      select 1 from public.post_variants v
      where v.account_id = p_account
        and v.status in ('scheduled','publishing','published','pending_approval')
        and v.scheduled_at = c.ts)
  order by c.ts limit 1;
$$;
grant execute on function public.next_free_slot(uuid, timestamptz) to authenticated;
