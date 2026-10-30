-- pgTAP: Phase 6 reservations (bookings, double booking, check-in, no-show, cancel).
-- Run with `npm run db:test` (needs local Supabase running).
--
-- Cast: org "Arena" with branches A and B; org "Other" (outsider X).
--   O  owner     M  manager of A     CA cashier in A     X  owner of "Other"
-- Stations in A: Room 1, Room 2, Room 4 (PS rooms, max 4 players, active), Room 3 (maintenance),
-- PC 1 (max 1 player, active). In B: Room B.
-- Times are relative to now(), which is fixed for the whole transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(44);

insert into auth.users (id, email, email_confirmed_at) values
  ('10000000-0000-0000-0000-000000000001', 'owner@test.local',   now()),
  ('10000000-0000-0000-0000-000000000002', 'manager@test.local', now()),
  ('10000000-0000-0000-0000-000000000003', 'ca@test.local',      now()),
  ('10000000-0000-0000-0000-000000000005', 'x@test.local',       now());

insert into public.organizations (id, name) values
  ('20000000-0000-0000-0000-000000000001', 'Arena'),
  ('20000000-0000-0000-0000-000000000002', 'Other');

insert into public.branches (id, org_id, name) values
  ('30000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000001', 'Branch A'),
  ('30000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-000000000001', 'Branch B'),
  ('30000000-0000-0000-0000-00000000000c', '20000000-0000-0000-0000-000000000002', 'Other HQ');

insert into public.memberships (id, org_id, user_id, role) values
  ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'owner'),
  ('40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'manager'),
  ('40000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'cashier'),
  ('40000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000005', 'owner');

insert into public.member_branches (membership_id, branch_id) values
  ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-00000000000a'),
  ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-00000000000a');

insert into public.station_types (id, org_id, kind, name, max_players) values
  ('50000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000001', 'ps_room', 'PS5 Room', 4),
  ('50000000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-000000000001', 'pc_desk', 'VIP PC', 1);

insert into public.stations (id, org_id, branch_id, station_type_id, name, status, is_active) values
  ('80000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-0000000000a1', 'Room 1', 'active',      true),
  ('80000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-0000000000a1', 'Room 2', 'active',      true),
  ('80000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-0000000000a1', 'Room 3', 'maintenance', true),
  ('80000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-0000000000a2', 'PC 1',   'active',      true),
  ('80000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-0000000000a1', 'Room 4', 'active',      true),
  ('80000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000b', '50000000-0000-0000-0000-0000000000a1', 'Room B', 'active',      true);

-- ===================== cashier CA (branch A) =====================
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}';

-- R1: Room 1, +2h..+4h, 3 players. The client also sends an actual start, which is dropped.
select lives_ok(
  $$insert into public.sessions (id, branch_id, station_id, kind, status, scheduled_start, scheduled_end,
      players, customer_name, customer_phone, actual_start) values
    ('b0000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a',
     '80000000-0000-0000-0000-000000000001', 'reservation', 'reserved',
     now() + interval '2 hours', now() + interval '4 hours', 3, 'Omar', '01000000000', now())$$,
  'cashier can book a reservation'
);
select is(
  (select created_by::text || ' ' || status::text || ' ' || (actual_start is null)::text || ' ' || customer_name
     from public.sessions where id = 'b0000000-0000-0000-0000-000000000001'),
  '10000000-0000-0000-0000-000000000003 reserved true Omar',
  'a reservation records who booked it and has no actual start'
);

-- Double booking.
select throws_ok(
  $$insert into public.sessions (branch_id, station_id, kind, status, scheduled_start, scheduled_end, players) values
    ('30000000-0000-0000-0000-00000000000a', '80000000-0000-0000-0000-000000000001', 'reservation', 'reserved',
     now() + interval '3 hours', now() + interval '5 hours', 2)$$,
  '23P01', 'booking_conflict', 'an overlapping reservation on the same station is refused'
);
select lives_ok(
  $$insert into public.sessions (id, branch_id, station_id, kind, status, scheduled_start, scheduled_end, players) values
    ('b0000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-00000000000a',
     '80000000-0000-0000-0000-000000000001', 'reservation', 'reserved',
     now() + interval '4 hours', now() + interval '5 hours', 2)$$,
  'a reservation may start when the previous one ends'
);
select lives_ok(
  $$insert into public.sessions (id, branch_id, station_id, kind, status, scheduled_start, scheduled_end, players) values
    ('b0000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-00000000000a',
     '80000000-0000-0000-0000-000000000002', 'reservation', 'reserved',
     now() + interval '2 hours', now() + interval '4 hours', 4)$$,
  'the same time on another station is fine'
);

-- Where and what may be booked.
select throws_ok(
  $$insert into public.sessions (branch_id, station_id, kind, status, scheduled_start, scheduled_end, players) values
    ('30000000-0000-0000-0000-00000000000a', '80000000-0000-0000-0000-000000000003', 'reservation', 'reserved',
     now() + interval '2 hours', now() + interval '3 hours', 2)$$,
  '23514', 'station_unavailable', 'a station in maintenance cannot be booked'
);
select throws_ok(
  $$insert into public.sessions (branch_id, station_id, kind, status, scheduled_start, scheduled_end, players) values
    ('30000000-0000-0000-0000-00000000000b', '80000000-0000-0000-0000-000000000006', 'reservation', 'reserved',
     now() + interval '2 hours', now() + interval '3 hours', 2)$$,
  '42501', null, 'cashier cannot book in another branch'
);
select throws_ok(
  $$insert into public.sessions (branch_id, station_id, kind, status, scheduled_start, scheduled_end, players) values
    ('30000000-0000-0000-0000-00000000000a', '80000000-0000-0000-0000-000000000005', 'reservation', 'active',
     now() + interval '2 hours', now() + interval '3 hours', 2)$$,
  '23514', 'invalid_session', 'a new reservation must be reserved'
);
select throws_ok(
  $$insert into public.sessions (branch_id, station_id, kind, status, scheduled_start, scheduled_end, players) values
    ('30000000-0000-0000-0000-00000000000a', '80000000-0000-0000-0000-000000000005', 'open', 'reserved',
     now() + interval '2 hours', now() + interval '3 hours', 2)$$,
  '23514', 'invalid_session', 'a walk-in cannot be reserved'
);
select throws_ok(
  $$insert into public.sessions (branch_id, station_id, kind, status, scheduled_start, scheduled_end, players) values
    ('30000000-0000-0000-0000-00000000000a', '80000000-0000-0000-0000-000000000004', 'reservation', 'reserved',
     now() + interval '10 hours', now() + interval '11 hours', 2)$$,
  '23514', 'too_many_players', 'a reservation cannot plan more players than the station type allows'
);
select throws_ok(
  $$insert into public.sessions (branch_id, station_id, kind, status, scheduled_start, players) values
    ('30000000-0000-0000-0000-00000000000a', '80000000-0000-0000-0000-000000000005', 'reservation', 'reserved',
     now() + interval '10 hours', 2)$$,
  '23514', null, 'a reservation needs a scheduled end'
);
select throws_ok(
  $$insert into public.sessions (branch_id, station_id, kind, status, scheduled_start, scheduled_end) values
    ('30000000-0000-0000-0000-00000000000a', '80000000-0000-0000-0000-000000000005', 'reservation', 'reserved',
     now() + interval '10 hours', now() + interval '11 hours')$$,
  '23514', null, 'a reservation needs a player count'
);
select throws_ok(
  $$insert into public.sessions (branch_id, station_id, kind, status, scheduled_start, scheduled_end, players) values
    ('30000000-0000-0000-0000-00000000000a', '80000000-0000-0000-0000-000000000005', 'reservation', 'reserved',
     now() + interval '10 hours', now() + interval '35 hours', 2)$$,
  '23514', null, 'a reservation lasts at most 24 hours'
);

-- Active sessions: a fixed walk-in W1 on Room 4 until +1h, an open walk-in W2 on Room 2.
insert into public.sessions (id, branch_id, station_id, kind, actual_start, scheduled_end) values
  ('90000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a',
   '80000000-0000-0000-0000-000000000005', 'fixed', now() - interval '30 minutes', now() + interval '1 hour');
insert into public.sessions (id, branch_id, station_id, kind, actual_start) values
  ('90000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-00000000000a',
   '80000000-0000-0000-0000-000000000002', 'open', now() - interval '10 minutes');
select throws_ok(
  $$insert into public.sessions (branch_id, station_id, kind, status, scheduled_start, scheduled_end, players) values
    ('30000000-0000-0000-0000-00000000000a', '80000000-0000-0000-0000-000000000005', 'reservation', 'reserved',
     now() + interval '30 minutes', now() + interval '2 hours', 2)$$,
  '23P01', 'booking_conflict', 'a reservation cannot overlap a fixed session''s planned time'
);
select lives_ok(
  $$insert into public.sessions (id, branch_id, station_id, kind, status, scheduled_start, scheduled_end, players) values
    ('b0000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-00000000000a',
     '80000000-0000-0000-0000-000000000005', 'reservation', 'reserved',
     now() + interval '1 hour', now() + interval '2 hours', 2)$$,
  'a reservation may start when a fixed session is planned to end'
);
-- R4: Room 2, now..+1h, while the open walk-in W2 plays there.
select lives_ok(
  $$insert into public.sessions (id, branch_id, station_id, kind, status, scheduled_start, scheduled_end, players) values
    ('b0000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-00000000000a',
     '80000000-0000-0000-0000-000000000002', 'reservation', 'reserved',
     now(), now() + interval '1 hour', 2)$$,
  'an open walk-in does not block a booking'
);

-- Rebooking.
select throws_ok(
  $$update public.sessions set station_id = '80000000-0000-0000-0000-000000000002'
    where id = 'b0000000-0000-0000-0000-000000000001'$$,
  '23P01', 'booking_conflict', 'a reservation cannot move onto a booked station'
);
select throws_ok(
  $$update public.sessions set scheduled_start = now() + interval '3 hours'
    where id = 'b0000000-0000-0000-0000-000000000002'$$,
  '23P01', 'booking_conflict', 'a reservation cannot move onto a booked time'
);
select lives_ok(
  $$update public.sessions set station_id = '80000000-0000-0000-0000-000000000002',
      scheduled_start = now() + interval '5 hours', scheduled_end = now() + interval '6 hours', players = 4
    where id = 'b0000000-0000-0000-0000-000000000002'$$,
  'a reservation can move to a free slot and change its player count'
);
select throws_ok(
  $$update public.sessions set station_id = '80000000-0000-0000-0000-000000000004'
    where id = 'b0000000-0000-0000-0000-000000000002'$$,
  '23514', 'too_many_players', 'a reservation cannot move to a station too small for its players'
);
update public.sessions set actual_start = now() where id = 'b0000000-0000-0000-0000-000000000002';
select is(
  (select actual_start from public.sessions where id = 'b0000000-0000-0000-0000-000000000002'),
  null, 'a reservation cannot be given an actual start without checking in'
);
select throws_ok(
  $$update public.sessions set status = 'completed' where id = 'b0000000-0000-0000-0000-000000000002'$$,
  '23514', 'invalid_session', 'a reservation cannot be completed without checking in'
);

-- Check-in R1 (Room 1 is free).
select lives_ok(
  $$update public.sessions set status = 'active' where id = 'b0000000-0000-0000-0000-000000000001'$$,
  'cashier can check in a reservation'
);
select is(
  (select status::text || ' ' || (actual_start = now())::text from public.sessions
   where id = 'b0000000-0000-0000-0000-000000000001'),
  'active true', 'check-in starts the session now'
);
select lives_ok(
  $$insert into public.session_segments (session_id, station_id, players, started_at) values
    ('b0000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', 3, now())$$,
  'a checked-in reservation gets its first segment'
);
select lives_ok(
  $$update public.sessions set scheduled_end = now() + interval '6 hours'
    where id = 'b0000000-0000-0000-0000-000000000001'$$,
  'a checked-in reservation can be extended'
);
select throws_ok(
  $$update public.sessions set scheduled_start = now() + interval '1 hour'
    where id = 'b0000000-0000-0000-0000-000000000001'$$,
  '23514', 'invalid_session', 'the planned start of a running session cannot change'
);
select throws_ok(
  $$update public.sessions set players = 2 where id = 'b0000000-0000-0000-0000-000000000001'$$,
  '23514', 'invalid_session', 'the planned players of a running session cannot change'
);
select throws_ok(
  $$update public.sessions set status = 'active' where id = 'b0000000-0000-0000-0000-000000000004'$$,
  '23505', null, 'cannot check in while the station has an active session'
);

-- R6 on PC 1, now..+1h; PC 1 then goes into maintenance.
insert into public.sessions (id, branch_id, station_id, kind, status, scheduled_start, scheduled_end, players) values
  ('b0000000-0000-0000-0000-000000000006', '30000000-0000-0000-0000-00000000000a',
   '80000000-0000-0000-0000-000000000004', 'reservation', 'reserved', now(), now() + interval '1 hour', 1);
reset role;
update public.stations set status = 'maintenance' where id = '80000000-0000-0000-0000-000000000004';
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}';
select throws_ok(
  $$update public.sessions set status = 'active' where id = 'b0000000-0000-0000-0000-000000000006'$$,
  '23514', 'station_unavailable', 'cannot check in on a station in maintenance'
);
reset role;
update public.stations set status = 'active' where id = '80000000-0000-0000-0000-000000000004';
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}';

-- Cancel R6, then book its slot again (R8 started 25 minutes ago).
select lives_ok(
  $$update public.sessions set status = 'cancelled' where id = 'b0000000-0000-0000-0000-000000000006'$$,
  'cashier can cancel a reservation'
);
select is(
  (select ended_by::text || ' ' || (actual_end is null)::text from public.sessions
   where id = 'b0000000-0000-0000-0000-000000000006'),
  '10000000-0000-0000-0000-000000000003 true', 'a cancelled reservation records who cancelled it and has no end'
);
select lives_ok(
  $$insert into public.sessions (id, branch_id, station_id, kind, status, scheduled_start, scheduled_end, players) values
    ('b0000000-0000-0000-0000-000000000008', '30000000-0000-0000-0000-00000000000a',
     '80000000-0000-0000-0000-000000000004', 'reservation', 'reserved',
     now() - interval '25 minutes', now() + interval '30 minutes', 1)$$,
  'a cancelled reservation frees its slot'
);
select throws_ok(
  $$update public.sessions set status = 'cancelled' where id = '90000000-0000-0000-0000-000000000002'$$,
  '42501', 'not_allowed', 'cashier still cannot cancel an active session'
);

-- No-show.
select throws_ok(
  $$update public.sessions set status = 'no_show' where id = 'b0000000-0000-0000-0000-000000000004'$$,
  '23514', 'too_early', 'a reservation cannot be a no-show before the 15-minute grace'
);
select lives_ok(
  $$update public.sessions set status = 'no_show' where id = 'b0000000-0000-0000-0000-000000000008'$$,
  'cashier can mark a no-show after the grace'
);
select is(
  (select status::text || ' ' || ended_by::text || ' ' || (actual_end is null)::text from public.sessions
   where id = 'b0000000-0000-0000-0000-000000000008'),
  'no_show 10000000-0000-0000-0000-000000000003 true', 'a no-show records who marked it'
);
select throws_ok(
  $$update public.sessions set status = 'active' where id = 'b0000000-0000-0000-0000-000000000008'$$,
  '23514', 'session_closed', 'a no-show cannot be checked in'
);
select throws_ok(
  $$update public.sessions set status = 'no_show' where id = '90000000-0000-0000-0000-000000000002'$$,
  '23514', 'invalid_session', 'an active session cannot become a no-show'
);
reset role;

-- ===================== manager M (branch A) =====================
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}';

select results_eq(
  $$select id from public.sessions where kind = 'reservation' and status = 'reserved' order by id$$,
  array['b0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000003',
        'b0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000005']::uuid[],
  'manager sees the branch''s open reservations'
);
reset role;

-- ===================== outsider X =====================
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}';

select is_empty($$select * from public.sessions where kind = 'reservation'$$,
  'an outsider sees no reservations of other organizations');
select throws_ok(
  $$insert into public.sessions (branch_id, station_id, kind, status, scheduled_start, scheduled_end, players) values
    ('30000000-0000-0000-0000-00000000000a', '80000000-0000-0000-0000-000000000005', 'reservation', 'reserved',
     now() + interval '10 hours', now() + interval '11 hours', 2)$$,
  '42501', null, 'an outsider cannot book in another organization'
);
reset role;

-- ===================== the database itself =====================
select ok(
  exists (select 1 from pg_constraint
           where conname = 'sessions_no_double_booking' and contype = 'x'
             and conrelid = 'public.sessions'::regclass),
  'the double-booking exclusion constraint exists'
);
-- Two devices booking offline: the trigger saw neither row, the constraint still refuses
-- the second (simulated by bypassing the trigger).
alter table public.sessions disable trigger sessions_check;
select throws_ok(
  $$insert into public.sessions (org_id, branch_id, station_id, kind, status, scheduled_start, scheduled_end, players) values
    ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a',
     '80000000-0000-0000-0000-000000000002', 'reservation', 'reserved',
     now() + interval '3 hours', now() + interval '7 hours', 2)$$,
  '23P01', null, 'the exclusion constraint refuses a double booking the trigger did not see'
);
alter table public.sessions enable trigger sessions_check;

select * from finish();
rollback;
