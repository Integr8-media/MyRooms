-- Phase 6: reservations (the calendar).
--
-- A reservation is a row in public.sessions with kind 'reservation' and status 'reserved':
-- a station booked for [scheduled_start, scheduled_end) for a planned number of players,
-- optionally with the customer's name and phone. It never has actual times until check-in.
--
--   reserved -> active     check-in: the group starts playing (actual_start is set, the app
--                          opens the first segment). Allowed only on a free, in-service station.
--   reserved -> cancelled  any branch staff (nothing was played, so nothing goes unbilled).
--   reserved -> no_show    any branch staff, from 15 minutes after the planned start.
--
-- Double booking: two reservations on one station may not overlap. The trigger checks this
-- (and also refuses a booking that overlaps an active session's planned end), but when two
-- devices book the same slot offline, the exclusion constraint sessions_no_double_booking is
-- the final judge: the second upload fails with 23P01. Open walk-ins (no planned end) don't
-- block bookings; the app warns about them instead.
--
-- Rows stay in public.sessions, so RLS, sync streams and the powersync publication are
-- unchanged. Only columns and the check_session trigger change.

create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------------
-- Columns and constraints
-- ---------------------------------------------------------------------------
alter table public.sessions
  -- Planned player count of a reservation. Null for walk-ins (their players live on segments).
  add column players smallint check (players between 1 and 16),
  add column customer_name text check (char_length(customer_name) <= 80),
  add column customer_phone text check (char_length(customer_phone) <= 30),
  add constraint sessions_reservation_shape check (
    kind <> 'reservation'
    or (scheduled_start is not null and scheduled_end is not null and players is not null)),
  add constraint sessions_reserved_is_reservation check (status <> 'reserved' or kind = 'reservation'),
  add constraint sessions_reservation_length check (
    kind <> 'reservation' or scheduled_end - scheduled_start <= interval '24 hours'),
  add constraint sessions_no_double_booking exclude using gist (
    station_id with =,
    tstzrange(scheduled_start, scheduled_end, '[)') with &&
  ) where (status = 'reserved');

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

-- A booking of [p_start, p_end) on a station must not overlap another reservation, or an
-- active session that is planned to still be playing then. Open walk-ins don't block.
create function private.check_booking(p_id uuid, p_station_id uuid, p_start timestamptz, p_end timestamptz)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (
    select 1 from public.sessions s
     where s.station_id = p_station_id
       and s.id <> p_id
       and (
         (s.status = 'reserved'
           and tstzrange(s.scheduled_start, s.scheduled_end, '[)') && tstzrange(p_start, p_end, '[)'))
         or (s.status = 'active'
           and s.scheduled_end is not null and s.scheduled_end > p_start and s.actual_start < p_end)
       )
  ) then
    raise exception 'booking_conflict' using errcode = '23P01';
  end if;
end;
$$;

create or replace function private.check_session()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_checkin boolean := false;
  v_max smallint;
begin
  if tg_op = 'INSERT' then
    select b.org_id into new.org_id from public.branches b where b.id = new.branch_id;
    new.created_by := (select auth.uid());
    new.ended_by := null;
    if new.kind = 'reservation' then
      if new.status <> 'reserved'
         or new.scheduled_start is null or new.scheduled_end is null or new.players is null then
        raise exception 'invalid_session' using errcode = '23514';
      end if;
      -- Nothing has been played yet.
      new.actual_start := null;
      new.actual_end := null;
      perform private.check_station_available(new.station_id, new.branch_id);
      select t.max_players into v_max
        from public.stations s join public.station_types t on t.id = s.station_type_id
       where s.id = new.station_id;
      if new.players > v_max then
        raise exception 'too_many_players' using errcode = '23514';
      end if;
      perform private.check_booking(new.id, new.station_id, new.scheduled_start, new.scheduled_end);
    else
      -- Walk-ins start playing right away.
      if new.status <> 'active' then
        raise exception 'invalid_session' using errcode = '23514';
      end if;
      perform private.check_station_available(new.station_id, new.branch_id);
    end if;
  else
    if old.status in ('completed', 'cancelled', 'no_show') then
      raise exception 'session_closed' using errcode = '23514';
    end if;
    if new.status is distinct from old.status then
      if not (old.status = 'active' and new.status in ('completed', 'cancelled'))
         and not (old.status = 'reserved' and new.status in ('active', 'cancelled', 'no_show')) then
        raise exception 'invalid_session' using errcode = '23514';
      end if;
      -- Cancelling a played session leaves it unbilled: owners and managers only.
      -- Cancelling a reservation is open to all branch staff.
      if old.status = 'active' and new.status = 'cancelled'
         and not private.can_manage_branch(new.branch_id) then
        raise exception 'not_allowed' using errcode = '42501';
      end if;
      if new.status = 'no_show' and now() < old.scheduled_start + interval '15 minutes' then
        raise exception 'too_early' using errcode = '23514';
      end if;
      if old.status = 'reserved' and new.status = 'active' then
        -- Check-in. The station may have gone into maintenance since the booking; a station
        -- that is still busy is refused by sessions_one_active_per_station (23505).
        v_checkin := true;
        perform private.check_station_available(new.station_id, new.branch_id);
        new.actual_start := coalesce(new.actual_start, now());
      end if;
      if new.status in ('completed', 'cancelled', 'no_show') then
        new.ended_by := (select auth.uid());
        if old.status = 'reserved' then
          -- Never played.
          new.actual_end := null;
        else
          new.actual_end := coalesce(new.actual_end, now());
          -- Clock skew: the end can't be before the start.
          if new.actual_start is not null and new.actual_end < new.actual_start then
            new.actual_end := new.actual_start;
          end if;
        end if;
      end if;
    end if;

    -- When a session started is fixed, except at check-in.
    if not v_checkin then
      new.actual_start := old.actual_start;
    end if;

    if old.status = 'reserved' and new.status = 'reserved' then
      -- Rebooking: a new station, time or player count must still fit.
      if new.station_id is distinct from old.station_id
         or new.scheduled_start is distinct from old.scheduled_start
         or new.scheduled_end is distinct from old.scheduled_end
         or new.players is distinct from old.players then
        if new.station_id is distinct from old.station_id then
          perform private.check_station_available(new.station_id, new.branch_id);
        end if;
        select t.max_players into v_max
          from public.stations s join public.station_types t on t.id = s.station_type_id
         where s.id = new.station_id;
        if new.players > v_max then
          raise exception 'too_many_players' using errcode = '23514';
        end if;
        perform private.check_booking(new.id, new.station_id, new.scheduled_start, new.scheduled_end);
      end if;
    else
      -- The planned start and player count belong to the booking only.
      if new.scheduled_start is distinct from old.scheduled_start
         or new.players is distinct from old.players then
        raise exception 'invalid_session' using errcode = '23514';
      end if;
      if new.station_id is distinct from old.station_id then
        perform private.check_station_available(new.station_id, new.branch_id);
      end if;
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

revoke execute on function private.check_booking(uuid, uuid, timestamptz, timestamptz)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Privileges: the new columns, and the times a booking and a check-in set.
-- ---------------------------------------------------------------------------
grant insert (players, customer_name, customer_phone) on public.sessions to authenticated;
grant update (scheduled_start, actual_start, players, customer_name, customer_phone)
  on public.sessions to authenticated;
