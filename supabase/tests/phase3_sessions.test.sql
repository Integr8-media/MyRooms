-- pgTAP: Phase 3 access rules for sessions and session segments.
-- Run with `npm run db:test` (needs local Supabase running).
--
-- Cast: org "Arena" with branches A and B; org "Other" (outsider X).
--   O  owner     M  manager of A     CA cashier in A     X  owner of "Other"
-- Stations in A: Room 1, Room 2 (PS rooms, active), Room 3 (maintenance), PC 1 (active),
-- Old Room (removed). In B: Room B.
begin;
create extension if not exists pgtap with schema extensions;
select plan(58);

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
  ('80000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-0000000000a1', 'Room 1',   'active',      true),
  ('80000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-0000000000a1', 'Room 2',   'active',      true),
  ('80000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-0000000000a1', 'Room 3',   'maintenance', true),
  ('80000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-0000000000a2', 'PC 1',     'active',      true),
  ('80000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-0000000000a1', 'Old Room', 'active',      false),
  ('80000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000b', '50000000-0000-0000-0000-0000000000a1', 'Room B',   'active',      true);

insert into public.packages (id, org_id, station_type_id, name, minutes, price) values
  ('70000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-0000000000a1', '3 hours PS', 180, 15000),
  ('70000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-0000000000a2', '2 hours PC', 120, 6000);

-- ===================== cashier CA (branch A) =====================
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}';

-- Start: an open session on Room 1 (S1) with its first segment. The client sends a wrong org.
select lives_ok(
  $$insert into public.sessions (id, org_id, branch_id, station_id, kind, actual_start) values
    ('90000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002',
     '30000000-0000-0000-0000-00000000000a', '80000000-0000-0000-0000-000000000001', 'open', now() - interval '1 hour')$$,
  'cashier can start an open session on an active station in their branch'
);
select is(
  (select org_id::text || ' ' || created_by::text || ' ' || status::text from public.sessions
   where id = '90000000-0000-0000-0000-000000000001'),
  '20000000-0000-0000-0000-000000000001 10000000-0000-0000-0000-000000000003 active',
  'a session takes org_id from the branch and created_by from the caller, whatever the client sent'
);
select lives_ok(
  $$insert into public.session_segments (id, org_id, branch_id, session_id, station_id, station_type_id, players, started_at) values
    ('a0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-00000000000b',
     '90000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-0000000000a2',
     2, now() - interval '1 hour')$$,
  'cashier can add the first segment'
);
select is(
  (select org_id::text || ' ' || branch_id::text || ' ' || station_type_id::text from public.session_segments
   where id = 'a0000000-0000-0000-0000-000000000001'),
  '20000000-0000-0000-0000-000000000001 30000000-0000-0000-0000-00000000000a 50000000-0000-0000-0000-0000000000a1',
  'a segment takes org, branch and station type from the session and station, whatever the client sent'
);

-- Where a session may start.
select throws_ok(
  $$insert into public.sessions (branch_id, station_id, kind, actual_start) values
    ('30000000-0000-0000-0000-00000000000b', '80000000-0000-0000-0000-000000000006', 'open', now())$$,
  '42501', null, 'cashier cannot start a session in another branch'
);
select throws_ok(
  $$insert into public.sessions (branch_id, station_id, kind, actual_start) values
    ('30000000-0000-0000-0000-00000000000a', '80000000-0000-0000-0000-000000000006', 'open', now())$$,
  '23514', 'invalid_station', 'the station must be in the session''s branch'
);
select throws_ok(
  $$insert into public.sessions (branch_id, station_id, kind, actual_start) values
    ('30000000-0000-0000-0000-00000000000a', '80000000-0000-0000-0000-000000000003', 'open', now())$$,
  '23514', 'station_unavailable', 'cannot start on a station in maintenance'
);
select throws_ok(
  $$insert into public.sessions (branch_id, station_id, kind, actual_start) values
    ('30000000-0000-0000-0000-00000000000a', '80000000-0000-0000-0000-000000000005', 'open', now())$$,
  '23514', 'station_unavailable', 'cannot start on a removed station'
);
select throws_ok(
  $$insert into public.sessions (branch_id, station_id, kind, actual_start) values
    ('30000000-0000-0000-0000-00000000000a', '80000000-0000-0000-0000-000000000001', 'open', now())$$,
  '23505', null, 'a station can have only one active session'
);

-- What a session may look like.
select throws_ok(
  $$insert into public.sessions (branch_id, station_id, kind, actual_start) values
    ('30000000-0000-0000-0000-00000000000a', '80000000-0000-0000-0000-000000000002', 'fixed', now())$$,
  '23514', null, 'a fixed session needs a scheduled end'
);
select throws_ok(
  $$insert into public.sessions (branch_id, station_id, kind, status, actual_start, actual_end) values
    ('30000000-0000-0000-0000-00000000000a', '80000000-0000-0000-0000-000000000002', 'open', 'completed',
     now() - interval '1 hour', now())$$,
  '23514', 'invalid_session', 'a new session must be active'
);
select throws_ok(
  $$insert into public.sessions (branch_id, station_id, kind, status, actual_start, scheduled_start, scheduled_end) values
    ('30000000-0000-0000-0000-00000000000a', '80000000-0000-0000-0000-000000000002', 'reservation', 'active',
     now(), now(), now() + interval '1 hour')$$,
  '23514', 'invalid_session', 'a reservation cannot be created already active'
);
select throws_ok(
  $$insert into public.sessions (branch_id, station_id, kind, package_id, actual_start) values
    ('30000000-0000-0000-0000-00000000000a', '80000000-0000-0000-0000-000000000002', 'open',
     '70000000-0000-0000-0000-000000000002', now())$$,
  '23514', 'invalid_package', 'the package must be for the station''s type'
);

-- A fixed session with a package on PC 1 (S2).
select lives_ok(
  $$insert into public.sessions (id, branch_id, station_id, kind, package_id, actual_start, scheduled_end) values
    ('90000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-00000000000a', '80000000-0000-0000-0000-000000000004',
     'fixed', '70000000-0000-0000-0000-000000000002', now() - interval '1 hour', now() + interval '1 hour')$$,
  'cashier can start a fixed session with a matching package'
);
select throws_ok(
  $$insert into public.session_segments (session_id, station_id, players, started_at) values
    ('90000000-0000-0000-0000-000000000002', '80000000-0000-0000-0000-000000000004', 2, now() - interval '1 hour')$$,
  '23514', 'too_many_players', 'a segment cannot have more players than the station type allows'
);
select lives_ok(
  $$insert into public.session_segments (id, session_id, station_id, players, started_at) values
    ('a0000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-000000000002',
     '80000000-0000-0000-0000-000000000004', 1, now() - interval '2 hours')$$,
  'cashier can add a segment within the player limit'
);
select is(
  (select started_at = now() - interval '1 hour' from public.session_segments
   where id = 'a0000000-0000-0000-0000-000000000002'),
  true,
  'a segment cannot start before its session'
);

-- Change players on S1: close the running segment, open a new one.
select lives_ok(
  $$update public.session_segments set ended_at = now() - interval '30 minutes'
    where id = 'a0000000-0000-0000-0000-000000000001'$$,
  'cashier can close the running segment'
);
select lives_ok(
  $$insert into public.session_segments (id, session_id, station_id, players, started_at) values
    ('a0000000-0000-0000-0000-000000000003', '90000000-0000-0000-0000-000000000001',
     '80000000-0000-0000-0000-000000000001', 3, now() - interval '30 minutes')$$,
  'cashier can open a new segment with the new player count'
);
select throws_ok(
  $$insert into public.session_segments (session_id, station_id, players, started_at) values
    ('90000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', 4, now())$$,
  '23505', null, 'a session can have only one running segment'
);

-- Move S1 from Room 1 to Room 2.
select lives_ok(
  $$update public.sessions set station_id = '80000000-0000-0000-0000-000000000002'
    where id = '90000000-0000-0000-0000-000000000001'$$,
  'cashier can move a session to a free station'
);
update public.session_segments set ended_at = now() - interval '10 minutes'
 where id = 'a0000000-0000-0000-0000-000000000003';
insert into public.session_segments (id, session_id, station_id, players, started_at) values
  ('a0000000-0000-0000-0000-000000000004', '90000000-0000-0000-0000-000000000001',
   '80000000-0000-0000-0000-000000000002', 3, now() - interval '10 minutes');
select is(
  (select station_id::text from public.sessions where id = '90000000-0000-0000-0000-000000000001'),
  '80000000-0000-0000-0000-000000000002',
  'the moved session is on the new station'
);
select throws_ok(
  $$update public.sessions set station_id = '80000000-0000-0000-0000-000000000003'
    where id = '90000000-0000-0000-0000-000000000001'$$,
  '23514', 'station_unavailable', 'cannot move a session onto a station in maintenance'
);
select throws_ok(
  $$update public.sessions set station_id = '80000000-0000-0000-0000-000000000006'
    where id = '90000000-0000-0000-0000-000000000001'$$,
  '23514', 'invalid_station', 'cannot move a session to another branch''s station'
);
select throws_ok(
  $$update public.session_segments set ended_at = now() - interval '5 minutes'
    where id = 'a0000000-0000-0000-0000-000000000004';
    insert into public.session_segments (session_id, station_id, players, started_at) values
    ('90000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', 3, now())$$,
  '23514', 'invalid_station', 'a segment must be on the session''s current station'
);
select throws_ok(
  $$insert into public.session_segments (session_id, station_id, players, started_at, ended_at) values
    ('90000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000002', 3,
     now() - interval '5 minutes', now())$$,
  '23514', 'invalid_session', 'a segment cannot be inserted already closed'
);
update public.session_segments set ended_at = now() - interval '5 minutes'
 where id = 'a0000000-0000-0000-0000-000000000004';
insert into public.session_segments (id, session_id, station_id, players, started_at) values
  ('a0000000-0000-0000-0000-000000000005', '90000000-0000-0000-0000-000000000001',
   '80000000-0000-0000-0000-000000000002', 2, now() - interval '20 minutes');
select is(
  (select started_at = now() - interval '5 minutes' from public.session_segments
   where id = 'a0000000-0000-0000-0000-000000000005'),
  true, 'a new segment cannot overlap the previous one'
);
update public.sessions set actual_end = now() where id = '90000000-0000-0000-0000-000000000001';
select is(
  (select actual_end from public.sessions where id = '90000000-0000-0000-0000-000000000001'),
  null, 'a running session cannot be given an end time without ending it'
);
select lives_ok(
  $$insert into public.sessions (id, branch_id, station_id, kind, actual_start) values
    ('90000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-00000000000a',
     '80000000-0000-0000-0000-000000000001', 'open', now())$$,
  'the station a session moved away from is free again'
);

-- Extend S2, then end it.
select lives_ok(
  $$update public.sessions set scheduled_end = now() + interval '2 hours'
    where id = '90000000-0000-0000-0000-000000000002'$$,
  'cashier can extend a fixed session'
);
select is(
  (select scheduled_end = now() + interval '2 hours' from public.sessions where id = '90000000-0000-0000-0000-000000000002'),
  true, 'the scheduled end moved'
);
select lives_ok(
  $$update public.sessions set status = 'completed' where id = '90000000-0000-0000-0000-000000000002'$$,
  'cashier can end a session'
);
select is(
  (select ended_by::text || ' ' || (actual_end is not null)::text from public.sessions
   where id = '90000000-0000-0000-0000-000000000002'),
  '10000000-0000-0000-0000-000000000003 true',
  'ending a session records who ended it and when'
);
select is(
  (select count(*)::int from public.session_segments
   where session_id = '90000000-0000-0000-0000-000000000002' and ended_at is null),
  0, 'ending a session closes its running segment'
);
select throws_ok(
  $$update public.sessions set note = 'late' where id = '90000000-0000-0000-0000-000000000002'$$,
  '23514', 'session_closed', 'an ended session cannot be changed'
);
select throws_ok(
  $$insert into public.session_segments (session_id, station_id, players, started_at) values
    ('90000000-0000-0000-0000-000000000002', '80000000-0000-0000-0000-000000000004', 1, now())$$,
  '23514', 'session_closed', 'an ended session cannot get new segments'
);
select throws_ok(
  $$update public.session_segments set ended_at = now() + interval '5 hours'
    where id = 'a0000000-0000-0000-0000-000000000002'$$,
  '23514', 'session_closed', 'a closed segment cannot be changed'
);

-- What a cashier may not do.
select throws_ok(
  $$update public.sessions set status = 'cancelled' where id = '90000000-0000-0000-0000-000000000001'$$,
  '42501', 'not_allowed', 'cashier cannot cancel a session'
);
select throws_ok(
  $$update public.sessions set created_by = '10000000-0000-0000-0000-000000000001'
    where id = '90000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'nobody can change who started a session'
);
-- actual_start is writable (check-in sets it, Phase 6) but kept as it was on a running session.
update public.sessions set actual_start = now() - interval '5 hours'
 where id = '90000000-0000-0000-0000-000000000001';
select is(
  (select actual_start = now() - interval '1 hour' from public.sessions
   where id = '90000000-0000-0000-0000-000000000001'),
  true, 'nobody can change when a session started'
);
select throws_ok(
  $$delete from public.sessions where id = '90000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'cashier cannot delete a session'
);
select throws_ok(
  $$delete from public.session_segments where id = 'a0000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'cashier cannot delete a segment'
);
reset role;

-- ===================== owner O, part 1 =====================
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';

select lives_ok(
  $$insert into public.sessions (id, branch_id, station_id, kind, actual_start) values
    ('90000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-00000000000b',
     '80000000-0000-0000-0000-000000000006', 'open', now())$$,
  'owner can start a session in any branch'
);
reset role;

-- ===================== manager M (branch A) =====================
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}';

select results_eq(
  'select id from public.sessions order by id',
  array['90000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000002',
        '90000000-0000-0000-0000-000000000004']::uuid[],
  'manager sees only branch A''s sessions'
);
select is_empty(
  $$select * from public.session_segments where branch_id <> '30000000-0000-0000-0000-00000000000a'$$,
  'manager sees no segments of other branches'
);
update public.sessions set status = 'cancelled' where id = '90000000-0000-0000-0000-000000000003';
select lives_ok(
  $$update public.sessions set status = 'cancelled' where id = '90000000-0000-0000-0000-000000000001'$$,
  'manager can cancel a session in their branch'
);
select is(
  (select status::text || ' ' || ended_by::text from public.sessions where id = '90000000-0000-0000-0000-000000000001'),
  'cancelled 10000000-0000-0000-0000-000000000002',
  'the cancellation records who cancelled'
);
select is(
  (select count(*)::int from public.session_segments
   where session_id = '90000000-0000-0000-0000-000000000001' and ended_at is null),
  0, 'cancelling a session closes its running segment'
);
select is_empty('select * from public.audit_log', 'manager cannot read the audit log');
reset role;

select is(
  (select status::text from public.sessions where id = '90000000-0000-0000-0000-000000000003'), 'active',
  'manager cannot cancel another branch''s session'
);

-- ===================== owner O, part 2 =====================
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';

select lives_ok(
  $$update public.sessions set status = 'cancelled' where id = '90000000-0000-0000-0000-000000000003'$$,
  'owner can cancel a session in any branch'
);
select results_eq(
  $$select entity_id::text || ' ' || actor_id::text || ' ' || (before ->> 'status') || ' -> ' || (after ->> 'status')
    from public.audit_log where entity = 'sessions' order by id$$,
  array['90000000-0000-0000-0000-000000000001 10000000-0000-0000-0000-000000000002 active -> cancelled',
        '90000000-0000-0000-0000-000000000003 10000000-0000-0000-0000-000000000001 active -> cancelled'],
  'every cancellation is in the audit log, with who did it'
);
select is(
  (select count(*)::int from public.audit_log where entity = 'sessions'), 2,
  'ending a session normally is not audited'
);
select throws_ok(
  $$delete from public.sessions where id = '90000000-0000-0000-0000-000000000003'$$,
  '42501', null, 'owner cannot delete a session'
);
reset role;

-- ===================== outsider X =====================
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}';

select is_empty('select * from public.sessions', 'an outsider sees no sessions of other organizations');
select is_empty('select * from public.session_segments', 'an outsider sees no segments of other organizations');
select throws_ok(
  $$insert into public.sessions (branch_id, station_id, kind, actual_start) values
    ('30000000-0000-0000-0000-00000000000a', '80000000-0000-0000-0000-000000000002', 'open', now())$$,
  '42501', null, 'an outsider cannot start a session in another organization'
);
reset role;

-- ===================== anonymous =====================
set local role anon;
select throws_ok('select * from public.sessions', '42501', null, 'anon cannot read sessions');
reset role;

select * from finish();
rollback;
