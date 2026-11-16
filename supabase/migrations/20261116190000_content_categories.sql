create table public.content_categories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  color text not null default '#1e5aa8',
  description text,
  recycle boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index content_categories_ws_idx on public.content_categories(workspace_id);
alter table public.content_categories enable row level security;
create policy cc_read on public.content_categories for select to authenticated using (public.is_member(workspace_id));
create policy cc_write on public.content_categories for all to authenticated using (public.is_member(workspace_id,'editor')) with check (public.is_member(workspace_id,'editor'));

alter table public.posts add column if not exists category_id uuid references public.content_categories(id) on delete set null;
alter table public.posts add column if not exists overrides jsonb not null default '{}'::jsonb;
alter table public.posts add column if not exists account_ids uuid[] not null default '{}';
alter table public.posts add column if not exists in_library boolean not null default false;
alter table public.posts add column if not exists last_shared_at timestamptz;
alter table public.posts add column if not exists share_count int not null default 0;
create index posts_category_idx on public.posts(category_id) where in_library;

alter table public.posting_slots add column if not exists category_id uuid references public.content_categories(id) on delete cascade;
alter table public.posting_slots drop constraint if exists posting_slots_account_id_day_of_week_local_time_key;
create unique index posting_slots_unique_idx on public.posting_slots(account_id, day_of_week, local_time, coalesce(category_id, '00000000-0000-0000-0000-000000000000'::uuid));

alter table public.post_variants drop constraint if exists post_variants_post_id_account_id_key;
create index if not exists post_variants_account_time_idx on public.post_variants(account_id, scheduled_at);

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
      on s.account_id = p_account and s.active and s.category_id is null and s.day_of_week = extract(dow from days.d)::int
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

insert into public.content_categories(workspace_id, name, color, description, recycle, sort)
select w.id, c.name, c.color, c.description, c.recycle, c.sort
from public.workspaces w
cross join (values
  ('Magazine articles', '#1e5aa8', 'Stories and features from canadiansme.ca', true, 1),
  ('Events & Summit', '#d71920', 'Small Business Summit and event promotion', false, 2),
  ('Tips & insights', '#16a34a', 'Evergreen advice for Canadian small businesses', true, 3),
  ('Promotions', '#f59e0b', 'Subscriptions, advertising and partner offers', true, 4),
  ('Engagement', '#7c3aed', 'Questions, polls and conversation starters', true, 5)
) as c(name, color, description, recycle, sort)
where not exists (select 1 from public.content_categories x where x.workspace_id = w.id);

create or replace function public.create_workspace(p_name text, p_slug text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare ws uuid;
begin
  if (select auth.uid()) is null then raise exception 'not authenticated'; end if;
  insert into public.workspaces(name, slug) values (p_name, p_slug) returning id into ws;
  insert into public.workspace_members(workspace_id, user_id, role) values (ws, (select auth.uid()), 'owner');
  insert into public.content_categories(workspace_id, name, color, description, recycle, sort) values
    (ws, 'Articles', '#1e5aa8', 'Stories and features from the website', true, 1),
    (ws, 'Events', '#d71920', 'Event promotion', false, 2),
    (ws, 'Tips & insights', '#16a34a', 'Evergreen advice', true, 3),
    (ws, 'Promotions', '#f59e0b', 'Offers and announcements', true, 4),
    (ws, 'Engagement', '#7c3aed', 'Questions and conversation starters', true, 5);
  return ws;
end $$;
revoke execute on function public.create_workspace(text, text) from anon, public;
grant execute on function public.create_workspace(text, text) to authenticated;
