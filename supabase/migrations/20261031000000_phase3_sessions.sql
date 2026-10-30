-- Phase 3: walk-in sessions on the live floor.
--
-- sessions          one customer group using a station. Phase 3 only creates walk-ins:
--                   kind 'open' (timer runs until stopped) or 'fixed' (planned end, can be
--                   extended). Reservations (status 'reserved') arrive in Phase 6.
-- session_segments  the time a session spent with one player count on one station. A new
--                   segment starts when the player count changes or the group moves. These
--                   feed src/domain/pricing.ts directly (station type, players, start, end).
--
-- Access: everyone working in the branch (owner, its managers, its cashiers) starts, extends,
-- changes, moves and ends sessions. Only owners and the branch's managers cancel one (a
-- cancelled session is never billed), and every cancellation goes to the audit log.
-- Nothing is deleted by clients.
--
-- Times come from the device (sessions are started offline too). The server checks that
-- they make sense, not that the device clock is right.

create type public.session_kind as enum ('open', 'fixed', 'reservation');
create type public.session_status as enum ('reserved', 'active', 'completed', 'cancelled', 'no_show');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  -- org_id is copied from the branch by a trigger.
  org_id uuid not null references public.organizations (id) on delete cascade,
  branch_id uuid not null references public.branches (id) on delete cascade,
  -- The station the group is on now (moves update it; segments keep the history).
  station_id uuid not null references public.stations (id) on delete restrict,
  kind public.session_kind not null,
  status public.session_status not null default 'active',
  package_id uuid references public.packages (id) on delete restrict,
  -- Fixed sessions: scheduled_end is when time is up (extending moves it).
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  actual_start timestamptz,
  actual_end timestamptz,
  note text check (char_length(note) <= 200),
  created_by uuid references auth.users (id) on delete set null,
  ended_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind <> 'fixed' or scheduled_end is not null),
  check (status <> 'active' or actual_start is not null),
  check (status <> 'completed' or (actual_start is not null and actual_end is not null)),
  check (actual_end is null or actual_end >= actual_start),
  check (scheduled_end is null or scheduled_start is null or scheduled_end > scheduled_start)
);

create index sessions_org_id_idx on public.sessions (org_id);
create index sessions_branch_id_status_idx on public.sessions (branch_id, status);
create index sessions_station_id_idx on public.sessions (station_id);
create index sessions_package_id_idx on public.sessions (package_id);
create index sessions_created_by_idx on public.sessions (created_by);
create index sessions_ended_by_idx on public.sessions (ended_by);
-- One group per station at a time. Two devices starting the same station offline:
-- the second upload is rejected here.
create unique index sessions_one_active_per_station on public.sessions (station_id)
  where status = 'active';

create table public.session_segments (
  id uuid primary key default gen_random_uuid(),
  -- org_id, branch_id and station_type_id are copied by a trigger (pricing must use the
  -- station's type at the time, and sync streams filter by branch).
  org_id uuid not null references public.organizations (id) on delete cascade,
  branch_id uuid not null references public.branches (id) on delete cascade,
  session_id uuid not null references public.sessions (id) on delete cascade,
  station_id uuid not null references public.stations (id) on delete restrict,
  station_type_id uuid not null references public.station_types (id) on delete restrict,
  players smallint not null check (players between 1 and 16),
  started_at timestamptz not null,
  ended_at timestamptz, -- null: still running
  created_at timestamptz not null default now(),
  -- Needed by private.set_created_at(), and closing a segment is an update.
  updated_at timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at)
);

create index session_segments_org_id_idx on public.session_segments (org_id);
create index session_segments_branch_id_idx on public.session_segments (branch_id);
create index session_segments_session_id_idx on public.session_segments (session_id);
create index session_segments_station_id_idx on public.session_segments (station_id);
create index session_segments_station_type_id_idx on public.session_segments (station_type_id);
-- A session has at most one running segment.
create unique index session_segments_one_open on public.session_segments (session_id)
  where ended_at is null;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- The station must be in the session's branch, in service and not removed.
create function private.check_station_available(p_station_id uuid, p_branch_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_station public.stations;
begin
  select * into v_station from public.stations s where s.id = p_station_id;
  if v_station.id is null or v_station.branch_id <> p_branch_id then
    raise exception 'invalid_station' using errcode = '23514';
  end if;
  if v_station.status <> 'active' or not v_station.is_active then
    raise exception 'station_unavailable' using errcode = '23514';
  end if;
end;
$$;

create function private.check_session()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    select b.org_id into new.org_id from public.branches b where b.id = new.branch_id;
    new.created_by := (select auth.uid());
    new.ended_by := null;
    -- Walk-ins only until reservations arrive (Phase 6).
    if new.status <> 'active' or new.kind = 'reservation' then
      raise exception 'invalid_session' using errcode = '23514';
    end if;
    perform private.check_station_available(new.station_id, new.branch_id);
  else
    if old.status in ('completed', 'cancelled', 'no_show') then
      raise exception 'session_closed' using errcode = '23514';
    end if;
    if new.status is distinct from old.status then
      if not (old.status = 'active' and new.status in ('completed', 'cancelled'))
         and not (old.status = 'reserved' and new.status in ('active', 'cancelled', 'no_show')) then
        raise exception 'invalid_session' using errcode = '23514';
      end if;
      if new.status = 'cancelled' and not private.can_manage_branch(new.branch_id) then
        raise exception 'not_allowed' using errcode = '42501';
      end if;
      if new.status in ('completed', 'cancelled', 'no_show') then
        new.ended_by := (select auth.uid());
        new.actual_end := coalesce(new.actual_end, now());
        -- Clock skew: the end can't be before the start.
        if new.actual_start is not null and new.actual_end < new.actual_start then
          new.actual_end := new.actual_start;
        end if;
      end if;
    end if;
    if new.station_id is distinct from old.station_id then
      perform private.check_station_available(new.station_id, new.branch_id);
    end if;
    -- A running session has no end yet (it is set when the status changes).
    if new.status in ('active', 'reserved') then
      new.actual_end := null;
    end if;
  end if;

  if new.package_id is not null and not exists (
    select 1 from public.packages p
      join public.stations s on s.station_type_id = p.station_type_id
     where p.id = new.package_id and s.id = new.station_id
       and (p.is_active or (tg_op = 'UPDATE' and new.package_id = old.package_id))
  ) then
    raise exception 'invalid_package' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- When a session ends, close its running segment (the app does this too; this is the backstop).
create function private.close_session_segments()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.session_segments
     set ended_at = greatest(started_at, new.actual_end)
   where session_id = new.id and ended_at is null;
  return null;
end;
$$;

create function private.check_segment()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_session public.sessions;
  v_station public.stations;
  v_max smallint;
begin
  if tg_op = 'UPDATE' then
    if old.ended_at is not null then
      raise exception 'session_closed' using errcode = '23514';
    end if;
    -- Clock skew: a segment can't end before it started.
    new.ended_at := greatest(new.ended_at, old.started_at);
    return new;
  end if;

  select * into v_session from public.sessions x where x.id = new.session_id;
  if v_session.id is null then
    raise exception 'invalid_session' using errcode = '23514';
  end if;
  if v_session.status <> 'active' then
    raise exception 'session_closed' using errcode = '23514';
  end if;
  -- Segments are priced by station type, so they must be on the session's current station
  -- (a move updates sessions.station_id first, then opens the new segment).
  select * into v_station from public.stations s where s.id = new.station_id;
  if v_station.id is null or new.station_id <> v_session.station_id then
    raise exception 'invalid_station' using errcode = '23514';
  end if;
  -- A segment starts running; it is closed later by an update.
  if new.ended_at is not null then
    raise exception 'invalid_session' using errcode = '23514';
  end if;
  select t.max_players into v_max from public.station_types t where t.id = v_station.station_type_id;
  if new.players > v_max then
    raise exception 'too_many_players' using errcode = '23514';
  end if;
  -- No overlap: a new segment starts no earlier than the session start or the last segment's end.
  new.started_at := greatest(
    new.started_at,
    v_session.actual_start,
    (select max(g.ended_at) from public.session_segments g where g.session_id = new.session_id)
  );

  new.org_id := v_session.org_id;
  new.branch_id := v_session.branch_id;
  new.station_type_id := v_station.station_type_id;
  return new;
end;
$$;

-- Only cancellations are audited here: they are the one way a played session goes unbilled.
-- Bills and payments get their own audit in Phase 4.
create function private.audit_session_cancel()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.audit_log (org_id, actor_id, entity, entity_id, action, before, after)
  values (new.org_id, (select auth.uid()), 'sessions', new.id, 'update', to_jsonb(old), to_jsonb(new));
  return null;
end;
$$;

revoke execute on function private.check_station_available(uuid, uuid), private.check_session(),
  private.close_session_segments(), private.check_segment(), private.audit_session_cancel()
  from public, anon, authenticated;

create trigger sessions_created_at before insert on public.sessions
  for each row execute function private.set_created_at();
create trigger sessions_updated_at before update on public.sessions
  for each row execute function private.set_updated_at();
create trigger sessions_check before insert or update on public.sessions
  for each row execute function private.check_session();
create trigger sessions_close_segments after update of status on public.sessions
  for each row when (new.status in ('completed', 'cancelled', 'no_show') and old.status is distinct from new.status)
  execute function private.close_session_segments();
create trigger sessions_audit_cancel after update of status on public.sessions
  for each row when (new.status = 'cancelled' and old.status is distinct from new.status)
  execute function private.audit_session_cancel();

create trigger session_segments_created_at before insert on public.session_segments
  for each row execute function private.set_created_at();
create trigger session_segments_updated_at before update on public.session_segments
  for each row execute function private.set_updated_at();
create trigger session_segments_check before insert or update on public.session_segments
  for each row execute function private.check_segment();

-- ---------------------------------------------------------------------------
-- Privileges: nothing by default, then only the columns clients may write.
-- ---------------------------------------------------------------------------
revoke all on public.sessions, public.session_segments from anon, authenticated;

grant select on public.sessions, public.session_segments to authenticated;

grant insert (id, org_id, branch_id, station_id, kind, status, package_id, scheduled_start,
  scheduled_end, actual_start, actual_end, note, created_at, updated_at)
  on public.sessions to authenticated;
grant update (station_id, status, package_id, scheduled_end, actual_end, note)
  on public.sessions to authenticated;

grant insert (id, org_id, branch_id, session_id, station_id, station_type_id, players, started_at,
  ended_at, created_at, updated_at) on public.session_segments to authenticated;
grant update (ended_at) on public.session_segments to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.sessions enable row level security;
alter table public.session_segments enable row level security;

create policy "sessions: branch staff read" on public.sessions
  for select to authenticated using (private.can_access_branch(branch_id));
create policy "sessions: branch staff create" on public.sessions
  for insert to authenticated with check (private.can_access_branch(branch_id));
-- Cancelling is limited to owners and branch managers by the check_session trigger.
create policy "sessions: branch staff update" on public.sessions
  for update to authenticated
  using (private.can_access_branch(branch_id))
  with check (private.can_access_branch(branch_id));

create policy "session_segments: branch staff read" on public.session_segments
  for select to authenticated using (private.can_access_branch(branch_id));
-- branch_id is overwritten from the session by the trigger before this check runs.
create policy "session_segments: branch staff create" on public.session_segments
  for insert to authenticated with check (private.can_access_branch(branch_id));
create policy "session_segments: branch staff update" on public.session_segments
  for update to authenticated
  using (private.can_access_branch(branch_id))
  with check (private.can_access_branch(branch_id));

-- ---------------------------------------------------------------------------
-- PowerSync (see deploy/powersync/sync-config.yaml)
-- ---------------------------------------------------------------------------
alter publication powersync add table public.sessions, public.session_segments;
