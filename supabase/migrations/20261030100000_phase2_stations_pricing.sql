-- Phase 2: station types, stations, rate rules, hour packages, and an audit log for price changes.
--
-- Access model
--   station types, rate rules, packages (prices)   read: every member of the org; write: owners
--   stations                                       read: staff of the branch; write: owners and
--                                                  the branch's managers (incl. maintenance on/off)
--
-- Nothing here is deleted by clients except rate rules: station types, stations and packages
-- are switched off (is_active = false) because sessions and bills will point at them.
--
-- Rate rule time fields
--   days_of_week  bit mask, bit 0 = Sunday ... bit 6 = Saturday (127 = every day). For a window
--                 that crosses midnight (e.g. 22:00-02:00) the day is the day the window starts.
--   from_minute / to_minute  minutes after local midnight (0-1440). Both null = all day.
--                 to_minute <= from_minute means the window ends the next day.
--   valid_from / valid_to    optional local dates, both inclusive.
-- The matching rule with the highest priority wins; see src/domain/pricing.ts.

create type public.station_kind as enum ('pc_desk', 'ps_room');
create type public.station_status as enum ('active', 'maintenance');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.station_types (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  kind public.station_kind not null,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  color text check (color ~ '^#[0-9a-fA-F]{6}$'),
  max_players smallint not null default 1 check (max_players between 1 and 16),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index station_types_org_id_idx on public.station_types (org_id);

create table public.stations (
  id uuid primary key default gen_random_uuid(),
  -- org_id is copied from the branch by a trigger (simpler policies and sync streams).
  org_id uuid not null references public.organizations (id) on delete cascade,
  branch_id uuid not null references public.branches (id) on delete cascade,
  station_type_id uuid not null references public.station_types (id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 50),
  status public.station_status not null default 'active',
  notes text check (char_length(notes) <= 500),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index stations_org_id_idx on public.stations (org_id);
create index stations_branch_id_idx on public.stations (branch_id);
create index stations_station_type_id_idx on public.stations (station_type_id);

create table public.rate_rules (
  id uuid primary key default gen_random_uuid(),
  -- org_id is copied from the station type by a trigger.
  org_id uuid not null references public.organizations (id) on delete cascade,
  station_type_id uuid not null references public.station_types (id) on delete cascade,
  name text check (char_length(name) <= 60),
  price_per_hour integer not null check (price_per_hour between 0 and 10000000), -- piasters
  players_min smallint check (players_min between 1 and 16),
  players_max smallint check (players_max between 1 and 16),
  days_of_week smallint not null default 127 check (days_of_week between 1 and 127),
  from_minute smallint check (from_minute between 0 and 1439),
  to_minute smallint check (to_minute between 1 and 1440),
  priority integer not null default 0 check (priority between -1000 and 1000),
  valid_from date,
  valid_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (players_min is null or players_max is null or players_min <= players_max),
  check ((from_minute is null) = (to_minute is null)),
  check (from_minute is null or from_minute <> to_minute % 1440),
  check (valid_from is null or valid_to is null or valid_from <= valid_to)
);

create index rate_rules_org_id_idx on public.rate_rules (org_id);
create index rate_rules_station_type_id_idx on public.rate_rules (station_type_id);

create table public.packages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  station_type_id uuid not null references public.station_types (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  minutes integer not null check (minutes between 1 and 1440),
  price integer not null check (price between 0 and 10000000), -- piasters
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index packages_org_id_idx on public.packages (org_id);
create index packages_station_type_id_idx on public.packages (station_type_id);

-- Who changed what. Written only by triggers; owners can read it. Not synced to devices yet.
create table public.audit_log (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  entity text not null,
  entity_id uuid not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  before jsonb,
  after jsonb,
  at timestamptz not null default now()
);

create index audit_log_org_id_at_idx on public.audit_log (org_id, at desc);
create index audit_log_entity_idx on public.audit_log (entity, entity_id);
create index audit_log_actor_id_idx on public.audit_log (actor_id);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- stations: org comes from the branch, and the station type must belong to the same org.
create function private.fill_station()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    select b.org_id into new.org_id from public.branches b where b.id = new.branch_id;
  end if;
  if not exists (
    select 1 from public.station_types t where t.id = new.station_type_id and t.org_id = new.org_id
  ) then
    raise exception 'invalid_station_type' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- rate_rules / packages: org comes from the station type.
create function private.fill_org_from_station_type()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  select t.org_id into new.org_id from public.station_types t where t.id = new.station_type_id;
  if new.org_id is null then
    raise exception 'invalid_station_type' using errcode = '23514';
  end if;
  return new;
end;
$$;

create function private.audit_row()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_row jsonb := to_jsonb(case when tg_op = 'DELETE' then old else new end);
begin
  if tg_op = 'UPDATE' and to_jsonb(old) - 'updated_at' = to_jsonb(new) - 'updated_at' then
    return new; -- nothing changed
  end if;
  insert into public.audit_log (org_id, actor_id, entity, entity_id, action, before, after)
  values (
    (v_row ->> 'org_id')::uuid,
    (select auth.uid()),
    tg_table_name,
    (v_row ->> 'id')::uuid,
    lower(tg_op),
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end
  );
  return null;
end;
$$;

revoke execute on function private.fill_station(), private.fill_org_from_station_type(),
  private.audit_row() from public, anon, authenticated;

create trigger station_types_created_at before insert on public.station_types
  for each row execute function private.set_created_at();
create trigger station_types_updated_at before update on public.station_types
  for each row execute function private.set_updated_at();

create trigger stations_created_at before insert on public.stations
  for each row execute function private.set_created_at();
create trigger stations_updated_at before update on public.stations
  for each row execute function private.set_updated_at();
create trigger stations_fill before insert or update of station_type_id on public.stations
  for each row execute function private.fill_station();

create trigger rate_rules_created_at before insert on public.rate_rules
  for each row execute function private.set_created_at();
create trigger rate_rules_updated_at before update on public.rate_rules
  for each row execute function private.set_updated_at();
create trigger rate_rules_fill before insert on public.rate_rules
  for each row execute function private.fill_org_from_station_type();

create trigger packages_created_at before insert on public.packages
  for each row execute function private.set_created_at();
create trigger packages_updated_at before update on public.packages
  for each row execute function private.set_updated_at();
create trigger packages_fill before insert on public.packages
  for each row execute function private.fill_org_from_station_type();

-- Price changes are money actions: audit them.
create trigger station_types_audit after insert or update or delete on public.station_types
  for each row execute function private.audit_row();
create trigger rate_rules_audit after insert or update or delete on public.rate_rules
  for each row execute function private.audit_row();
create trigger packages_audit after insert or update or delete on public.packages
  for each row execute function private.audit_row();

-- ---------------------------------------------------------------------------
-- Privileges: nothing by default, then only the columns clients may write.
-- ---------------------------------------------------------------------------
revoke all on public.station_types, public.stations, public.rate_rules, public.packages,
  public.audit_log from anon, authenticated;

grant select on public.station_types, public.stations, public.rate_rules, public.packages,
  public.audit_log to authenticated;

grant insert (id, org_id, kind, name, color, max_players, sort_order, is_active, created_at, updated_at)
  on public.station_types to authenticated;
grant update (kind, name, color, max_players, sort_order, is_active)
  on public.station_types to authenticated;

grant insert (id, org_id, branch_id, station_type_id, name, status, notes, sort_order, is_active,
  created_at, updated_at) on public.stations to authenticated;
grant update (station_type_id, name, status, notes, sort_order, is_active)
  on public.stations to authenticated;

grant insert (id, org_id, station_type_id, name, price_per_hour, players_min, players_max,
  days_of_week, from_minute, to_minute, priority, valid_from, valid_to, created_at, updated_at)
  on public.rate_rules to authenticated;
grant update (name, price_per_hour, players_min, players_max, days_of_week, from_minute, to_minute,
  priority, valid_from, valid_to) on public.rate_rules to authenticated;
grant delete on public.rate_rules to authenticated;

grant insert (id, org_id, station_type_id, name, minutes, price, is_active, created_at, updated_at)
  on public.packages to authenticated;
grant update (name, minutes, price, is_active) on public.packages to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.station_types enable row level security;
alter table public.stations enable row level security;
alter table public.rate_rules enable row level security;
alter table public.packages enable row level security;
alter table public.audit_log enable row level security;

-- Prices are needed by every member to show live estimates.
create policy "station_types: members read" on public.station_types
  for select to authenticated using (private.is_org_member(org_id));
create policy "station_types: owners create" on public.station_types
  for insert to authenticated with check (private.is_org_owner(org_id));
create policy "station_types: owners update" on public.station_types
  for update to authenticated
  using (private.is_org_owner(org_id))
  with check (private.is_org_owner(org_id));

create policy "stations: branch staff read" on public.stations
  for select to authenticated using (private.can_access_branch(branch_id));
create policy "stations: owners and branch managers create" on public.stations
  for insert to authenticated with check (private.can_manage_branch(branch_id));
create policy "stations: owners and branch managers update" on public.stations
  for update to authenticated
  using (private.can_manage_branch(branch_id))
  with check (private.can_manage_branch(branch_id));

create policy "rate_rules: members read" on public.rate_rules
  for select to authenticated using (private.is_org_member(org_id));
create policy "rate_rules: owners create" on public.rate_rules
  for insert to authenticated with check (private.is_org_owner(org_id));
create policy "rate_rules: owners update" on public.rate_rules
  for update to authenticated
  using (private.is_org_owner(org_id))
  with check (private.is_org_owner(org_id));
create policy "rate_rules: owners delete" on public.rate_rules
  for delete to authenticated using (private.is_org_owner(org_id));

create policy "packages: members read" on public.packages
  for select to authenticated using (private.is_org_member(org_id));
create policy "packages: owners create" on public.packages
  for insert to authenticated with check (private.is_org_owner(org_id));
create policy "packages: owners update" on public.packages
  for update to authenticated
  using (private.is_org_owner(org_id))
  with check (private.is_org_owner(org_id));

create policy "audit_log: owners read" on public.audit_log
  for select to authenticated using (private.is_org_owner(org_id));

-- ---------------------------------------------------------------------------
-- PowerSync (see deploy/powersync/sync-config.yaml). The audit log stays server-side.
-- ---------------------------------------------------------------------------
alter publication powersync add table
  public.station_types,
  public.stations,
  public.rate_rules,
  public.packages;
