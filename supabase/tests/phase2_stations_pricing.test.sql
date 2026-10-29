-- pgTAP: Phase 2 access rules for station types, stations, rate rules, packages, audit log.
-- Run with `npm run db:test` (needs local Supabase running).
--
-- Cast: org "Arena" with branches A and B; org "Other" (outsider X).
--   O  owner     M  manager of A     CA cashier in A     X  owner of "Other"
begin;
create extension if not exists pgtap with schema extensions;
select plan(41);

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
  ('50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'pc_desk', 'Other PC', 1);

-- ===================== owner O =====================
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';

select lives_ok(
  $$insert into public.station_types (id, org_id, kind, name, max_players) values
    ('50000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000001', 'ps_room', 'PS5 Room', 4),
    ('50000000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-000000000001', 'pc_desk', 'VIP PC', 1)$$,
  'owner can create station types'
);
select lives_ok(
  $$insert into public.rate_rules (id, org_id, station_type_id, price_per_hour, players_min, players_max) values
    ('60000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000099',
     '50000000-0000-0000-0000-0000000000a1', 6000, 1, 2)$$,
  'owner can create a rate rule'
);
select is(
  (select org_id::text from public.rate_rules where id = '60000000-0000-0000-0000-000000000001'),
  '20000000-0000-0000-0000-000000000001',
  'rate rules take org_id from the station type, whatever the client sent'
);
select lives_ok(
  $$insert into public.rate_rules (id, org_id, station_type_id, name, price_per_hour,
      days_of_week, from_minute, to_minute, priority) values
    ('60000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001',
     '50000000-0000-0000-0000-0000000000a1', 'Late night', 4000, 127, 1320, 120, 10)$$,
  'a time window may cross midnight'
);
select throws_ok(
  $$insert into public.rate_rules (org_id, station_type_id, price_per_hour, from_minute)
    values ('20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-0000000000a1', 5000, 600)$$,
  '23514', null, 'a time window needs both a start and an end'
);
select throws_ok(
  $$insert into public.rate_rules (org_id, station_type_id, price_per_hour, from_minute, to_minute)
    values ('20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-0000000000a1', 5000, 0, 1440)$$,
  '23514', null, 'a window from 00:00 to 24:00 must be written as "all day"'
);
select throws_ok(
  $$insert into public.rate_rules (org_id, station_type_id, price_per_hour, players_min, players_max)
    values ('20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-0000000000a1', 5000, 4, 2)$$,
  '23514', null, 'players_min cannot be above players_max'
);
select throws_ok(
  $$insert into public.rate_rules (org_id, station_type_id, price_per_hour)
    values ('20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-0000000000a1', -100)$$,
  '23514', null, 'prices cannot be negative'
);
select throws_ok(
  $$insert into public.rate_rules (org_id, station_type_id, price_per_hour)
    values ('20000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001', 5000)$$,
  '42501', null, 'owner cannot add prices to another organization''s station type'
);
select lives_ok(
  $$insert into public.packages (id, org_id, station_type_id, name, minutes, price) values
    ('70000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
     '50000000-0000-0000-0000-0000000000a1', '3 hours', 180, 15000)$$,
  'owner can create a package'
);
select lives_ok(
  $$insert into public.stations (id, org_id, branch_id, station_type_id, name) values
    ('80000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
     '30000000-0000-0000-0000-00000000000b', '50000000-0000-0000-0000-0000000000a2', 'PC 1')$$,
  'owner can add a station to any branch'
);
select throws_ok(
  $$insert into public.stations (org_id, branch_id, station_type_id, name) values
    ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a',
     '50000000-0000-0000-0000-000000000001', 'Wrong type')$$,
  '23514', 'invalid_station_type', 'a station''s type must belong to the same organization'
);
select throws_ok(
  $$insert into public.stations (org_id, branch_id, station_type_id, name) values
    ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000c',
     '50000000-0000-0000-0000-0000000000a2', 'Elsewhere')$$,
  '23514', 'invalid_station_type', 'owner cannot add a station to another organization''s branch'
);
update public.rate_rules set price_per_hour = 6500 where id = '60000000-0000-0000-0000-000000000001';
select is(
  (select price_per_hour from public.rate_rules where id = '60000000-0000-0000-0000-000000000001'), 6500,
  'owner can change a price'
);
select is(
  (select count(*)::int from public.audit_log), 6,
  'owner sees the audit log (2 types, 2 rules, 1 package, 1 price change)'
);
select is(
  (select (before ->> 'price_per_hour') || ' -> ' || (after ->> 'price_per_hour') from public.audit_log
   where entity = 'rate_rules' and action = 'update'),
  '6000 -> 6500',
  'the audit log records the old and new price'
);
select is(
  (select actor_id::text from public.audit_log where entity = 'rate_rules' and action = 'update'),
  '10000000-0000-0000-0000-000000000001',
  'the audit log records who changed it'
);
select throws_ok(
  $$insert into public.audit_log (org_id, entity, entity_id, action)
    values ('20000000-0000-0000-0000-000000000001', 'x', gen_random_uuid(), 'insert')$$,
  '42501', null, 'nobody can write the audit log directly'
);
select throws_ok(
  $$delete from public.station_types where id = '50000000-0000-0000-0000-0000000000a2'$$,
  '42501', null, 'station types are switched off, not deleted'
);
reset role;

-- ===================== manager M (branch A) =====================
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}';

select results_eq(
  'select name from public.station_types order by name', array['PS5 Room', 'VIP PC'],
  'manager sees their organization''s station types only'
);
select is((select count(*)::int from public.rate_rules), 2, 'manager can read prices');
select lives_ok(
  $$insert into public.stations (id, org_id, branch_id, station_type_id, name) values
    ('80000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001',
     '30000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-0000000000a1', 'Room 1')$$,
  'manager can add a station to their branch'
);
select throws_ok(
  $$insert into public.stations (org_id, branch_id, station_type_id, name) values
    ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000b',
     '50000000-0000-0000-0000-0000000000a1', 'Room B')$$,
  '42501', null, 'manager cannot add a station to another branch'
);
update public.stations set status = 'maintenance' where id = '80000000-0000-0000-0000-000000000002';
update public.stations set status = 'maintenance' where id = '80000000-0000-0000-0000-000000000001';
select throws_ok(
  $$update public.stations set branch_id = '30000000-0000-0000-0000-00000000000b'
    where id = '80000000-0000-0000-0000-000000000002'$$,
  '42501', null, 'nobody can move a station to another branch'
);
update public.rate_rules set price_per_hour = 1 where id = '60000000-0000-0000-0000-000000000001';
update public.packages set price = 1;
update public.station_types set name = 'Cheap';
select throws_ok(
  $$insert into public.rate_rules (org_id, station_type_id, price_per_hour)
    values ('20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-0000000000a1', 100)$$,
  '42501', null, 'manager cannot create prices'
);
select throws_ok(
  $$insert into public.station_types (org_id, kind, name)
    values ('20000000-0000-0000-0000-000000000001', 'pc_desk', 'Mine')$$,
  '42501', null, 'manager cannot create station types'
);
delete from public.rate_rules;
select is_empty('select * from public.audit_log', 'manager cannot read the audit log');
reset role;

select is(
  (select status::text from public.stations where id = '80000000-0000-0000-0000-000000000002'), 'maintenance',
  'manager can put their branch''s station into maintenance'
);
select is(
  (select status::text from public.stations where id = '80000000-0000-0000-0000-000000000001'), 'active',
  'manager cannot change another branch''s station'
);
select is(
  (select price_per_hour from public.rate_rules where id = '60000000-0000-0000-0000-000000000001'), 6500,
  'manager price change had no effect'
);
select is((select price from public.packages limit 1), 15000, 'manager package change had no effect');
select is(
  (select count(*)::int from public.station_types where name = 'Cheap'), 0,
  'manager station type change had no effect'
);
select is((select count(*)::int from public.rate_rules), 2, 'manager cannot delete prices');

-- ===================== cashier CA (branch A) =====================
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}';

select results_eq(
  'select name from public.stations order by name', array['Room 1'],
  'cashier in A sees only branch A''s stations'
);
select is((select count(*)::int from public.packages), 1, 'cashier can read packages (to bill them)');
update public.stations set status = 'active' where id = '80000000-0000-0000-0000-000000000002';
select throws_ok(
  $$insert into public.stations (org_id, branch_id, station_type_id, name) values
    ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a',
     '50000000-0000-0000-0000-0000000000a1', 'Room 2')$$,
  '42501', null, 'cashier cannot add stations'
);
reset role;

select is(
  (select status::text from public.stations where id = '80000000-0000-0000-0000-000000000002'), 'maintenance',
  'cashier cannot change maintenance status'
);

-- ===================== outsider X =====================
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}';

select results_eq(
  'select name from public.station_types', array['Other PC'],
  'an outsider sees only their own station types'
);
select is_empty('select * from public.rate_rules', 'an outsider sees no prices of other organizations');
select is_empty('select * from public.stations', 'an outsider sees no stations of other organizations');
reset role;

-- ===================== anonymous =====================
set local role anon;
select throws_ok('select * from public.rate_rules', '42501', null, 'anon cannot read prices');
reset role;

select * from finish();
rollback;
