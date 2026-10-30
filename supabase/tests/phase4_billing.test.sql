-- pgTAP: Phase 4 bills and payments.
-- Run with `npm run db:test` (needs local Supabase running), or `npm run db:check` (PGlite).
--
-- Cast: org "Arena" with branches A and B; org "Other" (outsider X).
--   O  owner     M  manager of A     CA cashier in A     X  owner of "Other"
-- Sessions: S1, S2 completed in A; S3 still playing in A; SB completed in B.
begin;
create extension if not exists pgtap with schema extensions;
select plan(54);

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
  ('30000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-000000000001', 'Branch B');

insert into public.memberships (id, org_id, user_id, role) values
  ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'owner'),
  ('40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'manager'),
  ('40000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'cashier'),
  ('40000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000005', 'owner');

insert into public.member_branches (membership_id, branch_id) values
  ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-00000000000a'),
  ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-00000000000a');

insert into public.station_types (id, org_id, kind, name, max_players) values
  ('50000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000001', 'ps_room', 'PS5 Room', 4);

insert into public.stations (id, org_id, branch_id, station_type_id, name) values
  ('80000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-0000000000a1', 'Room 1'),
  ('80000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-0000000000a1', 'Room 2'),
  ('80000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-0000000000a1', 'Room 3'),
  ('80000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000b', '50000000-0000-0000-0000-0000000000a1', 'Room B');

insert into public.sessions (id, branch_id, station_id, kind, actual_start) values
  ('90000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a', '80000000-0000-0000-0000-000000000001', 'open', now() - interval '2 hours'),
  ('90000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-00000000000a', '80000000-0000-0000-0000-000000000002', 'open', now() - interval '2 hours'),
  ('90000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-00000000000a', '80000000-0000-0000-0000-000000000003', 'open', now() - interval '2 hours'),
  ('90000000-0000-0000-0000-0000000000b1', '30000000-0000-0000-0000-00000000000b', '80000000-0000-0000-0000-000000000006', 'open', now() - interval '2 hours');
update public.sessions set status = 'completed', actual_end = now() - interval '30 minutes'
 where id in ('90000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000002',
              '90000000-0000-0000-0000-0000000000b1');

-- ===================== clients can't make bills =====================
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}';

select throws_ok(
  $$select public.create_bill('90000000-0000-0000-0000-000000000001', 1, '{}', '10000000-0000-0000-0000-000000000003')$$,
  '42501', null,
  'clients cannot call create_bill (only the service role can write amounts)'
);
select throws_ok(
  $$insert into public.bills (id, org_id, branch_id, session_id, number, time_amount, closed_at) values
    ('90000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a',
     '90000000-0000-0000-0000-000000000001', 1, 1, now())$$,
  '42501', null,
  'clients cannot insert bills directly'
);

-- ===================== the create-bill Edge Function (service role) =====================
reset role;
set local role service_role;
set local request.jwt.claims = '';

select is(
  public.create_bill('90000000-0000-0000-0000-000000000001', 9000, '{"version":1,"lines":[]}', '10000000-0000-0000-0000-000000000003'),
  '90000000-0000-0000-0000-000000000001'::uuid,
  'create_bill saves the bill of a completed session and returns its id (= session id)'
);
select is(
  (select format('%s %s %s %s %s %s', number, time_amount, total, paid_amount, status, closed_by)
     from public.bills where id = '90000000-0000-0000-0000-000000000001'),
  '1 9000 9000 0 open 10000000-0000-0000-0000-000000000003',
  'the bill gets number 1, its total, status open and who closed it'
);
select is(
  (select b.closed_at = s.actual_end and b.org_id = s.org_id and b.branch_id = s.branch_id
     from public.bills b join public.sessions s on s.id = b.session_id
    where b.id = '90000000-0000-0000-0000-000000000001'),
  true,
  'closed_at, org and branch come from the session'
);
select is(
  public.create_bill('90000000-0000-0000-0000-000000000001', 1, '{}', '10000000-0000-0000-0000-000000000002'),
  '90000000-0000-0000-0000-000000000001'::uuid,
  'asking again for the same session returns the existing bill'
);
select is(
  (select time_amount from public.bills where id = '90000000-0000-0000-0000-000000000001'),
  9000,
  '...without changing it'
);
select lives_ok(
  $$select public.create_bill('90000000-0000-0000-0000-000000000002', 5000, null, '10000000-0000-0000-0000-000000000002')$$,
  'a manager of the branch can be the actor'
);
select lives_ok(
  $$select public.create_bill('90000000-0000-0000-0000-0000000000b1', 4000, '{}', '10000000-0000-0000-0000-000000000001')$$,
  'the owner can be the actor in any branch'
);
select results_eq(
  $$select number from public.bills order by branch_id, number$$,
  array[1, 2, 1],
  'receipt numbers count up per branch'
);
select throws_ok(
  $$select public.create_bill('90000000-0000-0000-0000-000000000003', 100, '{}', '10000000-0000-0000-0000-000000000003')$$,
  '23514', 'session_not_ended',
  'a session still playing has no bill'
);
select throws_ok(
  $$select public.create_bill('90000000-0000-0000-0000-0000000000b1', 100, '{}', '10000000-0000-0000-0000-000000000003')$$,
  '42501', 'not_allowed',
  'the actor must work in the session''s branch'
);
select throws_ok(
  $$select public.create_bill('90000000-0000-0000-0000-000000000001', 100, '{}', '10000000-0000-0000-0000-000000000005')$$,
  '42501', 'not_allowed',
  'an outsider can never be the actor'
);
select throws_ok(
  $$select public.create_bill('90000000-0000-0000-0000-000000000099', 100, '{}', '10000000-0000-0000-0000-000000000001')$$,
  '23514', 'invalid_session',
  'an unknown session has no bill'
);

-- ===================== cashier CA (branch A) =====================
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}';

select results_eq(
  $$select id::text from public.bills order by id$$,
  array['90000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000002'],
  'a cashier sees the bills of their branch only'
);
select throws_ok(
  $$update public.bills set discount_amount = 1000 where id = '90000000-0000-0000-0000-000000000001'$$,
  '42501', 'not_allowed',
  'a cashier cannot give a discount'
);
select throws_ok(
  $$update public.bills set time_amount = 1 where id = '90000000-0000-0000-0000-000000000001'$$,
  '42501', null,
  'nobody can change the time charge'
);
select throws_ok(
  $$update public.bills set status = 'void', void_reason = 'x' where id = '90000000-0000-0000-0000-000000000001'$$,
  '42501', 'not_allowed',
  'a cashier cannot void a bill'
);
select lives_ok(
  $$insert into public.payments (id, org_id, branch_id, bill_id, method, amount, received_by) values
    ('c0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-00000000000b',
     '90000000-0000-0000-0000-000000000001', 'cash', 5000, '10000000-0000-0000-0000-000000000001')$$,
  'a cashier takes a cash payment (sending a wrong org, branch and person)'
);
select is(
  (select format('%s %s %s %s', org_id, branch_id, received_by, kind) from public.payments
    where id = 'c0000000-0000-0000-0000-000000000001'),
  '20000000-0000-0000-0000-000000000001 30000000-0000-0000-0000-00000000000a 10000000-0000-0000-0000-000000000003 payment',
  'org and branch come from the bill and received_by is the caller'
);
select is(
  (select format('%s %s', paid_amount, status) from public.bills where id = '90000000-0000-0000-0000-000000000001'),
  '5000 partially_paid',
  'a part payment makes the bill partly paid'
);
select lives_ok(
  $$insert into public.payments (id, bill_id, method, amount, reference) values
    ('c0000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-000000000001', 'visa', 4000, '  SLIP-77 ')$$,
  'the rest is paid by Visa (split payment)'
);
select is(
  (select format('%s %s', paid_amount, status) from public.bills where id = '90000000-0000-0000-0000-000000000001'),
  '9000 paid',
  'the bill is paid once payments reach the total'
);
select is(
  (select reference from public.payments where id = 'c0000000-0000-0000-0000-000000000002'),
  'SLIP-77',
  'the reference is trimmed'
);
select throws_ok(
  $$insert into public.payments (bill_id, kind, method, amount, reason) values
    ('90000000-0000-0000-0000-000000000001', 'refund', 'cash', 1000, 'Too much')$$,
  '42501', 'not_allowed',
  'a cashier cannot refund'
);
select throws_ok(
  $$insert into public.payments (bill_id, method, amount) values ('90000000-0000-0000-0000-000000000001', 'cash', 0)$$,
  '23514', null,
  'a payment must be more than 0'
);
select throws_ok(
  $$insert into public.payments (bill_id, method, amount) values ('90000000-0000-0000-0000-0000000000b1', 'cash', 1000)$$,
  '42501', null,
  'a cashier cannot take payments for another branch''s bill'
);
select throws_ok(
  $$update public.payments set amount = 1 where id = 'c0000000-0000-0000-0000-000000000001'$$,
  '42501', null,
  'payments cannot be changed'
);
select throws_ok(
  $$delete from public.payments where id = 'c0000000-0000-0000-0000-000000000001'$$,
  '42501', null,
  'payments cannot be deleted'
);
select is_empty(
  $$select id from public.audit_log$$,
  'a cashier cannot read the audit log'
);

-- ===================== manager M (branch A) =====================
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}';

select throws_ok(
  $$update public.bills set discount_amount = 1000 where id = '90000000-0000-0000-0000-000000000001'$$,
  '23514', 'bill_has_payments',
  'no discount once money was taken'
);
select lives_ok(
  $$update public.bills set discount_amount = 1000, discount_reason = '  Regular customer '
     where id = '90000000-0000-0000-0000-000000000002'$$,
  'a manager gives a discount before any payment'
);
select is(
  (select format('%s %s %s %s', total, status, discount_by, discount_reason) from public.bills
    where id = '90000000-0000-0000-0000-000000000002'),
  '4000 open 10000000-0000-0000-0000-000000000002 Regular customer',
  'the discount lowers the total and records who gave it and why'
);
select throws_ok(
  $$update public.bills set discount_amount = 5001 where id = '90000000-0000-0000-0000-000000000002'$$,
  '23514', 'invalid_discount',
  'a discount cannot be more than the bill'
);
select throws_ok(
  $$insert into public.payments (bill_id, kind, method, amount) values
    ('90000000-0000-0000-0000-000000000001', 'refund', 'cash', 1000)$$,
  '23514', 'reason_required',
  'a refund needs a reason'
);
select throws_ok(
  $$insert into public.payments (bill_id, kind, method, amount, reason) values
    ('90000000-0000-0000-0000-000000000001', 'refund', 'cash', 9001, 'x')$$,
  '23514', 'invalid_amount',
  'a refund cannot be more than what was paid'
);
select lives_ok(
  $$insert into public.payments (id, bill_id, kind, method, amount, reason) values
    ('c0000000-0000-0000-0000-000000000003', '90000000-0000-0000-0000-000000000001', 'refund', 'cash', 1000, 'Ended early')$$,
  'a manager refunds with a reason'
);
select is(
  (select format('%s %s', paid_amount, status) from public.bills where id = '90000000-0000-0000-0000-000000000001'),
  '8000 partially_paid',
  'a refund lowers what was paid'
);
select throws_ok(
  $$update public.bills set status = 'void' where id = '90000000-0000-0000-0000-000000000002'$$,
  '23514', 'reason_required',
  'voiding needs a reason'
);
select throws_ok(
  $$update public.bills set void_reason = 'x' where id = '90000000-0000-0000-0000-000000000002'$$,
  '23514', 'invalid_bill',
  'a void reason alone does not void the bill'
);
select lives_ok(
  $$update public.bills set status = 'void', void_reason = 'Test session' where id = '90000000-0000-0000-0000-000000000002'$$,
  'a manager voids a bill with a reason'
);
select is(
  (select format('%s %s %s', status, voided_by, voided_at is not null) from public.bills
    where id = '90000000-0000-0000-0000-000000000002'),
  'void 10000000-0000-0000-0000-000000000002 t',
  'the void records who and when'
);
select throws_ok(
  $$insert into public.payments (bill_id, method, amount) values ('90000000-0000-0000-0000-000000000002', 'cash', 1000)$$,
  '23514', 'bill_void',
  'a void bill takes no payments'
);
select throws_ok(
  $$update public.bills set discount_amount = 0 where id = '90000000-0000-0000-0000-000000000002'$$,
  '23514', 'bill_void',
  'a void bill cannot be changed'
);
select throws_ok(
  $$update public.bills set status = 'open' where id = '90000000-0000-0000-0000-000000000002'$$,
  '23514', 'bill_void',
  'a void cannot be undone'
);
select is_empty(
  $$select id from public.bills where branch_id = '30000000-0000-0000-0000-00000000000b'$$,
  'a manager does not see other branches'' bills'
);

-- ===================== owner O =====================
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';

select is(
  (select count(*)::int from public.bills), 3,
  'the owner sees every bill of the organization'
);
select lives_ok(
  $$insert into public.payments (bill_id, method, amount) values ('90000000-0000-0000-0000-000000000001', 'instapay', 5000)$$,
  'paying more than the total is accepted (a payment taken offline is never lost)'
);
select is(
  (select format('%s %s', paid_amount, status) from public.bills where id = '90000000-0000-0000-0000-000000000001'),
  '13000 paid',
  'an overpaid bill is paid'
);
select is(
  (select count(*)::int from public.audit_log where entity = 'payments'), 4,
  'every payment and refund is audited'
);
select results_eq(
  $$select format('%s %s', action, actor_id) from public.audit_log
     where entity = 'bills' and entity_id = '90000000-0000-0000-0000-000000000002' order by id$$,
  array[
    'insert 10000000-0000-0000-0000-000000000002',
    'update 10000000-0000-0000-0000-000000000002',
    'update 10000000-0000-0000-0000-000000000002'
  ],
  'the bill, its discount and its void are audited with who did it'
);
select is(
  (select count(*)::int from public.audit_log
    where entity = 'bills' and entity_id = '90000000-0000-0000-0000-000000000001'), 1,
  'payments changing a bill''s status are not audited twice'
);

-- ===================== outsider X =====================
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}';

select is_empty($$select id from public.bills$$, 'an outsider sees no bills');
select is_empty($$select id from public.payments$$, 'an outsider sees no payments');

select * from finish();
rollback;
