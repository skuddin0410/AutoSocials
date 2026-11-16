alter table public.social_accounts add column if not exists region text not null default 'Canada';
create index if not exists social_accounts_ws_region_idx on public.social_accounts(workspace_id, region);
alter table public.oauth_states add column if not exists region text;
alter table public.oauth_states add column if not exists variant text;
