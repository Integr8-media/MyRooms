-- pgTAP: Phase 10 "Delete my account" (public.delete_account, used by the delete-account
-- Edge Function). Run with `npm run db:test` (needs local Supabase running), or `npm run db:check` (PGlite).
--
-- Cast:
--   S  sole owner of "Solo" (nobody else): a full day of data that must all go.
--   O  only owner of "Arena", with cashier C: can't leave until someone else is owner.
--   P, Q  two owners of "Pair": either may leave, the org stays.
--   C  cashier in "Arena" (took a payment there): leaves; the payment stays.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

insert into auth.users (id, email, email_confirmed_at) values
  ('10000000-0000-0000-0000-000000000001', 'solo@test.local',  now()),
  ('10000000-0000-0000-0000-000000000002', 'owner@test.local', now()),
  ('10000000-0000-0000-0000-000000000003', 'ca@test.local',    now()),
  ('10000000-0000-0000-0000-000000000004', 'p@test.local',     now()),
  ('10000000-0000-0000-0000-000000000005', 'q@test.local',     now());

insert into public.organizations (id, name) values
  ('20000000-0000-0000-0000-000000000001', 'Solo'),
  ('20000000-0000-0000-0000-000000000002', 'Arena'),
  ('20000000-0000-0000-0000-000000000003', 'Pair');

insert into public.branches (id, org_id, name) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Solo branch'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'Arena branch'),
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003', 'Pair branch');

insert into public.memberships (id, org_id, user_id, role) values
  ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'owner'),
  ('40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'owner'),
  ('40000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003', 'cashier'),
  ('40000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000004', 'owner'),
  ('40000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000005', 'owner');

insert into public.member_branches (membership_id, branch_id) values
  ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000002');

-- S is also invited to Arena (not accepted yet).
insert into public.invitations (org_id, email, role) values
  ('20000000-0000-0000-0000-000000000002', 'solo@test.local', 'manager');

-- Solo: prices, stations, a customer, a product with stock, an expense…
insert into public.station_types (id, org_id, kind, name, max_players) values
  ('50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'ps_room', 'PS5 Room', 4),
  ('50000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'ps_room', 'PS5 Room', 4);
insert into public.rate_rules (org_id, station_type_id, price_per_hour) values
  ('20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 6000);
insert into public.packages (id, org_id, station_type_id, name, minutes, price) values
  ('51000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '3 hours', 180, 15000);
insert into public.stations (id, org_id, branch_id, station_type_id, name) values
  ('80000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'Room 1'),
  ('80000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'Room 2'),
  ('80000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000002', 'Arena 1');
insert into public.customers (id, org_id, name, phone) values
  ('70000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Karim', '01000000000');
insert into public.products (id, org_id, name, price) values
  ('60000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Cola', 1500);

-- …a completed session with an item, a bill and a payment, a running session with a package,
-- and a completed Arena session.
insert into public.sessions (id, branch_id, station_id, kind, status, actual_start, scheduled_end, customer_id, package_id) values
  ('90000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', 'open', 'active', now() - interval '2 hours', null, '70000000-0000-0000-0000-000000000001', null),
  ('90000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000002', 'fixed', 'active', now() - interval '1 hour', now() + interval '2 hours', null, '51000000-0000-0000-0000-000000000001'),
  ('90000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000002', '80000000-0000-0000-0000-000000000003', 'open', 'active', now() - interval '2 hours', null, null, null);
insert into public.session_segments (session_id, station_id, players, started_at) values
  ('90000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', 2, now() - interval '2 hours'),
  ('90000000-0000-0000-0000-000000000002', '80000000-0000-0000-0000-000000000002', 2, now() - interval '1 hour');
insert into public.session_items (session_id, product_id, name, quantity, unit_price) values
  ('90000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', '', 2, 0);
update public.sessions set status = 'completed', actual_end = now() - interval '30 minutes'
 where id in ('90000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000003');

set local role service_role;
select public.create_bill('90000000-0000-0000-0000-000000000001', 9000, '{}', '10000000-0000-0000-0000-000000000001');
select public.create_bill('90000000-0000-0000-0000-000000000003', 9000, '{}', '10000000-0000-0000-0000-000000000003');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
insert into public.payments (bill_id, method, amount) values ('90000000-0000-0000-0000-000000000001', 'cash', 5000);
insert into public.stock_movements (branch_id, product_id, quantity, reason) values
  ('30000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 24, 'purchase');
insert into public.expenses (branch_id, category, amount, method, spent_on) values
  ('30000000-0000-0000-0000-000000000001', 'rent', 100000, 'cash', current_date);
update public.rate_rules set price_per_hour = 7000
 where org_id = '20000000-0000-0000-0000-000000000001';  -- an audit row
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}';
insert into public.payments (id, bill_id, method, amount) values
  ('c0000000-0000-0000-0000-000000000003', '90000000-0000-0000-0000-000000000003', 'visa', 9000);
reset role;

-- ===================== who may call it =====================
select ok(
  not has_function_privilege('authenticated', 'public.delete_account(uuid)', 'execute'),
  'signed-in users cannot call delete_account directly (only through the Edge Function)'
);
select ok(
  not has_function_privilege('anon', 'public.delete_account(uuid)', 'execute'),
  'signed-out visitors cannot call delete_account'
);
select ok(
  has_function_privilege('service_role', 'public.delete_account(uuid)', 'execute'),
  'the service role can call delete_account'
);

set local role service_role;

-- ===================== the only owner of an org with staff =====================
select throws_ok(
  $$select public.delete_account('10000000-0000-0000-0000-000000000002')$$,
  '23514', 'last_owner',
  'the only owner of an organization with other members must hand it over first'
);
select is(
  (select count(*)::int from public.memberships where org_id = '20000000-0000-0000-0000-000000000002'),
  2,
  'and nothing was removed'
);

-- ===================== sole member: the organization goes =====================
select is(
  public.delete_account('10000000-0000-0000-0000-000000000001'),
  '{"deleted_orgs": ["20000000-0000-0000-0000-000000000001"]}'::jsonb,
  'the sole owner''s organization is deleted with the account'
);
select is_empty(
  $$select 1 from public.organizations where id = '20000000-0000-0000-0000-000000000001'$$,
  'the organization is gone'
);
select is(
  (select count(*)::int from (
     select org_id from public.branches union all select org_id from public.stations
     union all select org_id from public.station_types union all select org_id from public.rate_rules
     union all select org_id from public.packages union all select org_id from public.sessions
     union all select org_id from public.session_segments union all select org_id from public.session_items
     union all select org_id from public.bills union all select org_id from public.payments
     union all select org_id from public.customers union all select org_id from public.products
     union all select org_id from public.stock_movements union all select org_id from public.expenses
     union all select org_id from public.audit_log union all select org_id from public.memberships
   ) t where org_id = '20000000-0000-0000-0000-000000000001'),
  0,
  'every row of the organization is gone (sessions, bills, payments, items, stock, expenses, audit…)'
);
reset role;
select is_empty(
  $$select 1 from private.bill_counters where branch_id = '30000000-0000-0000-0000-000000000001'$$,
  'the bill counter of its branch is gone'
);
set local role service_role;
select is_empty(
  $$select 1 from public.invitations where email = 'solo@test.local'$$,
  'invitations waiting for them are removed'
);
select is(
  (select count(*)::int from public.sessions where org_id = '20000000-0000-0000-0000-000000000002'),
  1,
  'other organizations keep their data'
);

-- ===================== a cashier leaves =====================
select is(
  public.delete_account('10000000-0000-0000-0000-000000000003'),
  '{"deleted_orgs": []}'::jsonb,
  'a cashier''s account deletion deletes no organization'
);
select is_empty(
  $$select 1 from public.memberships where user_id = '10000000-0000-0000-0000-000000000003'
    union all select 1 from public.member_branches where user_id = '10000000-0000-0000-0000-000000000003'$$,
  'their membership and branch assignments are removed'
);
select is(
  (select format('%s %s', amount, received_by) from public.payments where id = 'c0000000-0000-0000-0000-000000000003'),
  '9000 10000000-0000-0000-0000-000000000003',
  'the payment they took stays with the organization'
);

-- Now O is the only member of Arena: their org goes with them.
select is(
  public.delete_account('10000000-0000-0000-0000-000000000002'),
  '{"deleted_orgs": ["20000000-0000-0000-0000-000000000002"]}'::jsonb,
  'once the staff are gone, the owner can delete the account and the organization'
);

-- ===================== two owners =====================
select is(
  public.delete_account('10000000-0000-0000-0000-000000000004'),
  '{"deleted_orgs": []}'::jsonb,
  'one of two owners can leave'
);
select is(
  (select format('%s %s', o.name, m.user_id) from public.organizations o
     join public.memberships m on m.org_id = o.id where o.id = '20000000-0000-0000-0000-000000000003'),
  'Pair 10000000-0000-0000-0000-000000000005',
  'the organization stays with the other owner'
);
reset role;

-- ===================== staff still can't remove items from ended sessions =====================
-- (the delete check only skips rows whose session is being deleted)
insert into public.organizations (id, name) values ('20000000-0000-0000-0000-000000000009', 'Check');
insert into public.branches (id, org_id, name) values
  ('30000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000009', 'B');
insert into public.memberships (org_id, user_id, role) values
  ('20000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000005', 'owner');
insert into auth.users (id, email, email_confirmed_at) values
  ('10000000-0000-0000-0000-000000000006', 'ca2@test.local', now());
insert into public.memberships (id, org_id, user_id, role) values
  ('40000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000006', 'cashier');
insert into public.member_branches (membership_id, branch_id) values
  ('40000000-0000-0000-0000-000000000009', '30000000-0000-0000-0000-000000000009');
insert into public.station_types (id, org_id, kind, name, max_players) values
  ('50000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000009', 'pc_desk', 'PC', 1);
insert into public.stations (id, org_id, branch_id, station_type_id, name) values
  ('80000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000009', '30000000-0000-0000-0000-000000000009', '50000000-0000-0000-0000-000000000009', 'PC 1');
insert into public.products (id, org_id, name, price) values
  ('60000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000009', 'Tea', 1000);
insert into public.sessions (id, branch_id, station_id, kind, status, actual_start) values
  ('90000000-0000-0000-0000-000000000009', '30000000-0000-0000-0000-000000000009', '80000000-0000-0000-0000-000000000009', 'open', 'active', now() - interval '1 hour');
insert into public.session_items (id, session_id, product_id, name, quantity, unit_price) values
  ('a0000000-0000-0000-0000-000000000009', '90000000-0000-0000-0000-000000000009', '60000000-0000-0000-0000-000000000009', '', 1, 0);
update public.sessions set status = 'completed', actual_end = now() where id = '90000000-0000-0000-0000-000000000009';

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000006","role":"authenticated"}';
select throws_ok(
  $$delete from public.session_items where id = 'a0000000-0000-0000-0000-000000000009'$$,
  '42501', 'not_allowed',
  'a cashier still cannot remove an item after the session ended'
);
select throws_ok(
  $$delete from public.sessions where id = '90000000-0000-0000-0000-000000000009'$$,
  '42501', null,
  'clients cannot delete sessions (only delete_account does)'
);

select * from finish();
rollback;
