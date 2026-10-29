-- Phase 0: one sample table to prove offline write -> sync works end to end.
-- Replaced by the real schema from Phase 1 onwards.

create table public.sync_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  note text not null check (char_length(note) <= 500),
  platform text not null check (platform in ('ios', 'android', 'web', 'windows', 'macos')),
  created_at timestamptz not null default now()
);

create index sync_checks_user_id_idx on public.sync_checks (user_id);

alter table public.sync_checks enable row level security;

-- Each user only sees and writes their own records.
create policy "sync_checks: select own" on public.sync_checks
  for select to authenticated using (user_id = (select auth.uid()));

create policy "sync_checks: insert own" on public.sync_checks
  for insert to authenticated with check (user_id = (select auth.uid()));

create policy "sync_checks: update own" on public.sync_checks
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "sync_checks: delete own" on public.sync_checks
  for delete to authenticated using (user_id = (select auth.uid()));

-- PowerSync reads changes through logical replication from this publication.
-- Every synced table must be added to it.
create publication powersync for table public.sync_checks;
