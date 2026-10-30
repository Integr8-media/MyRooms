-- pgTAP: Phase 7 optional modules (customers, products, session items, stock, expenses).
-- Run with `npm run db:test` (needs local Supabase running).
--
-- Cast: org "Arena" with branches A and B; org "Other" (outsider X).
--   O  owner     M  manager of A     CA cashier in A     X  owner of "Other"
-- Products: Cola (15 EGP) and Chips (10 EGP) in Arena, Tea in Other.
-- Sessions in A: S1 active, S2 completed (customer Omar, 10% default discount), S3 completed,
-- S4 cancelled. In B: SB active.
begin;
create extension if not exists pgtap with schema extensions;
select plan(59);

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
  ('50000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000001', 'ps_room', 'PS5 Room', 4);

insert into public.stations (id, org_id, branch_id, station_type_id, name) values
  ('80000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-0000000000a1', 'Room 1'),
  ('80000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-0000000000a1', 'Room 2'),
  ('80000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-0000000000a1', 'Room 3'),
  ('80000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-0000000000a1', 'Room 4'),
  ('80000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000b', '50000000-0000-0000-0000-0000000000a1', 'Room B');

insert into public.products (id, org_id, name, price) values
  ('60000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Cola', 1500),
  ('60000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'Chips', 1000),
  ('60000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000002', 'Tea', 500);

-- Only owners and managers give a default discount, so Omar is set up as the owner.
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
insert into public.customers (id, org_id, name, phone, default_discount_pct) values
  ('70000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Omar', '01000000001', 10),
  ('70000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000002', 'Outsider', null, 0);
set local request.jwt.claims = '';

-- Sessions are made as walk-ins (the only kind that starts active), then closed.
insert into public.sessions (id, branch_id, station_id, kind, status, actual_start, customer_id) values
  ('90000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a', '80000000-0000-0000-0000-000000000001', 'open', 'active', now() - interval '2 hours', null),
  ('90000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-00000000000a', '80000000-0000-0000-0000-000000000002', 'open', 'active', now() - interval '2 hours', '70000000-0000-0000-0000-000000000001'),
  ('90000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-00000000000a', '80000000-0000-0000-0000-000000000003', 'open', 'active', now() - interval '2 hours', null),
  ('90000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-00000000000a', '80000000-0000-0000-0000-000000000004', 'open', 'active', now() - interval '2 hours', null),
  ('90000000-0000-0000-0000-0000000000b1', '30000000-0000-0000-0000-00000000000b', '80000000-0000-0000-0000-000000000006', 'open', 'active', now() - interval '1 hour', null);

-- Items sold while playing (added as the system, before the sessions end).
insert into public.session_items (id, session_id, product_id, name, quantity, unit_price) values
  ('a0000000-0000-0000-0000-000000000021', '90000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000001', '', 2, 0),
  ('a0000000-0000-0000-0000-000000000031', '90000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-000000000002', '', 1, 0);

update public.sessions set status = 'completed', actual_end = now() - interval '1 hour'
 where id in ('90000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-000000000003');
-- Only owners and managers cancel a running session.
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
update public.sessions set status = 'cancelled', actual_end = now() - interval '1 hour'
 where id = '90000000-0000-0000-0000-000000000004';
set local request.jwt.claims = '';

-- ===================== cashier CA (branch A): customers =====================
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}';

select lives_ok(
  $$insert into public.customers (id, org_id, name, phone) values
    ('70000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '  Sara ', ' 01000000002 ')$$,
  'a cashier adds a customer'
);
select is(
  (select format('%s|%s|%s', name, phone, created_by) from public.customers
    where id = '70000000-0000-0000-0000-000000000002'),
  'Sara|01000000002|10000000-0000-0000-0000-000000000003',
  'name and phone are trimmed and created_by is the cashier'
);
select throws_ok(
  $$insert into public.customers (org_id, name, default_discount_pct) values
    ('20000000-0000-0000-0000-000000000001', 'Friend', 50)$$,
  '42501', 'not_allowed',
  'a cashier cannot give a new customer a default discount'
);
select throws_ok(
  $$update public.customers set default_discount_pct = 20 where id = '70000000-0000-0000-0000-000000000002'$$,
  '42501', 'not_allowed',
  'a cashier cannot change a default discount'
);
select lives_ok(
  $$update public.customers set phone = '01000000022', notes = 'Plays FIFA'
     where id = '70000000-0000-0000-0000-000000000002'$$,
  'a cashier edits a customer''s phone and notes'
);
select throws_ok(
  $$delete from public.customers where id = '70000000-0000-0000-0000-000000000002'$$,
  '42501', null,
  'customers are never deleted (switched off instead)'
);
select results_eq(
  $$select name from public.customers order by name$$,
  array['Omar', 'Sara'],
  'members see their organization''s customers only'
);
select throws_ok(
  $$update public.sessions set customer_id = '70000000-0000-0000-0000-000000000009'
     where id = '90000000-0000-0000-0000-000000000001'$$,
  '23514', 'invalid_customer',
  'a session cannot point at another organization''s customer'
);
select lives_ok(
  $$update public.sessions set customer_id = '70000000-0000-0000-0000-000000000002'
     where id = '90000000-0000-0000-0000-000000000001'$$,
  'a cashier links a running session to a customer'
);

-- ===================== cashier CA: products and items =====================
select throws_ok(
  $$insert into public.products (org_id, name, price) values ('20000000-0000-0000-0000-000000000001', 'Water', 500)$$,
  '42501', null,
  'a cashier cannot add products'
);
select results_eq(
  $$select name from public.products order by name$$,
  array['Chips', 'Cola'],
  'members see their organization''s products only'
);

select lives_ok(
  $$insert into public.session_items (id, org_id, branch_id, session_id, product_id, name, quantity, unit_price) values
    ('a0000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-00000000000b',
     '90000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 'Free cola', 3, 1)$$,
  'a cashier adds 3 colas to a running session'
);
select is(
  (select format('%s|%s|%s|%s|%s', org_id, branch_id, name, unit_price, created_by)
     from public.session_items where id = 'a0000000-0000-0000-0000-000000000011'),
  '20000000-0000-0000-0000-000000000001|30000000-0000-0000-0000-00000000000a|Cola|1500|10000000-0000-0000-0000-000000000003',
  'org, branch, name and price come from the session and product, not the client'
);
select throws_ok(
  $$insert into public.session_items (session_id, product_id, name, quantity, unit_price) values
    ('90000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000009', 'Tea', 1, 500)$$,
  '23514', 'invalid_product',
  'a product of another organization cannot be sold'
);
select throws_ok(
  $$insert into public.session_items (session_id, product_id, name, quantity, unit_price) values
    ('90000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-000000000001', 'Cola', 1, 1500)$$,
  '23514', 'session_closed',
  'nothing can be added to a cancelled session'
);
select throws_ok(
  $$insert into public.session_items (session_id, product_id, name, quantity, unit_price) values
    ('90000000-0000-0000-0000-0000000000b1', '60000000-0000-0000-0000-000000000001', 'Cola', 1, 1500)$$,
  '42501', null,
  'a cashier cannot sell in a branch they don''t work in'
);
select throws_ok(
  $$insert into public.session_items (session_id, product_id, name, quantity, unit_price) values
    ('90000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 'Cola', 0, 1500)$$,
  '23514', null,
  'a quantity must be at least 1'
);
select throws_ok(
  $$update public.session_items set quantity = 1 where id = 'a0000000-0000-0000-0000-000000000011'$$,
  '42501', null,
  'items are never updated (remove and add again)'
);

-- ===================== create-bill (service role): items and customer discount =====================
reset role;
set local role service_role;
set local request.jwt.claims = '';

select lives_ok(
  $$select public.create_bill('90000000-0000-0000-0000-000000000002', 9000, '{}', '10000000-0000-0000-0000-000000000003')$$,
  'create_bill makes the bill of S2'
);
select is(
  (select format('%s %s %s %s %s', time_amount, items_amount, discount_amount, discount_reason, total)
     from public.bills where id = '90000000-0000-0000-0000-000000000002'),
  '9000 3000 1200 customer:10 10800',
  'the bill includes the items (2 x 15) and Omar''s 10% default discount'
);
select lives_ok(
  $$select public.create_bill('90000000-0000-0000-0000-000000000003', 6000, '{}', '10000000-0000-0000-0000-000000000003')$$,
  'create_bill makes the bill of S3 (no customer)'
);
select is(
  (select format('%s %s %s', items_amount, discount_amount, total) from public.bills
    where id = '90000000-0000-0000-0000-000000000003'),
  '1000 0 7000',
  'a session without a customer gets no discount'
);

-- ===================== cashier CA: items after the bill =====================
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}';

select lives_ok(
  $$insert into public.session_items (id, session_id, product_id, name, quantity, unit_price) values
    ('a0000000-0000-0000-0000-000000000032', '90000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-000000000001', '', 1, 0)$$,
  'a cashier adds a cola at checkout (the session ended, the bill is open)'
);
select is(
  (select format('%s %s %s', items_amount, total, status) from public.bills
    where id = '90000000-0000-0000-0000-000000000003'),
  '2500 8500 open',
  'the bill''s items and total follow'
);
select throws_ok(
  $$delete from public.session_items where id = 'a0000000-0000-0000-0000-000000000032'$$,
  '42501', 'not_allowed',
  'a cashier cannot remove an item once the session ended'
);
select lives_ok(
  $$delete from public.session_items where id = 'a0000000-0000-0000-0000-000000000011'$$,
  'a cashier removes an item while the session is running'
);

-- ===================== manager M (branch A) =====================
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}';

select lives_ok(
  $$update public.customers set default_discount_pct = 15 where id = '70000000-0000-0000-0000-000000000002'$$,
  'a manager gives a customer a default discount'
);
select lives_ok(
  $$delete from public.session_items where id = 'a0000000-0000-0000-0000-000000000032'$$,
  'a manager removes an item from an ended session before any payment'
);
select is(
  (select format('%s %s', items_amount, total) from public.bills where id = '90000000-0000-0000-0000-000000000003'),
  '1000 7000',
  'the bill goes back down'
);
update public.bills set discount_amount = 10000 where id = '90000000-0000-0000-0000-000000000002';
select throws_ok(
  $$delete from public.session_items where id = 'a0000000-0000-0000-0000-000000000021'$$,
  '23514', 'invalid_discount',
  'removing an item cannot leave a discount bigger than the bill'
);
update public.bills set discount_amount = 0 where id = '90000000-0000-0000-0000-000000000002';
insert into public.payments (bill_id, method, amount) values ('90000000-0000-0000-0000-000000000002', 'cash', 1000);
select throws_ok(
  $$delete from public.session_items where id = 'a0000000-0000-0000-0000-000000000021'$$,
  '23514', 'bill_has_payments',
  'items cannot be removed after a payment (refund instead)'
);
update public.bills set status = 'void', void_reason = 'Test' where id = '90000000-0000-0000-0000-000000000003';
select throws_ok(
  $$insert into public.session_items (session_id, product_id, name, quantity, unit_price) values
    ('90000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-000000000001', '', 1, 0)$$,
  '23514', 'bill_void',
  'nothing can be added to a void bill'
);
update public.products set price = 2000 where id = '60000000-0000-0000-0000-000000000001';
select is(
  (select price from public.products where id = '60000000-0000-0000-0000-000000000001'), 1500,
  'a manager cannot change product prices (nothing is updated)'
);

-- Stock
select lives_ok(
  $$insert into public.stock_movements (id, org_id, branch_id, product_id, quantity, reason, note) values
    ('b0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002',
     '30000000-0000-0000-0000-00000000000a', '60000000-0000-0000-0000-000000000001', 24, 'purchase', ' crate ')$$,
  'a manager restocks 24 colas in branch A'
);
select is(
  (select format('%s|%s|%s', org_id, note, created_by) from public.stock_movements
    where id = 'b0000000-0000-0000-0000-000000000001'),
  '20000000-0000-0000-0000-000000000001|crate|10000000-0000-0000-0000-000000000002',
  'org comes from the branch, the note is trimmed, created_by is the manager'
);
select lives_ok(
  $$insert into public.stock_movements (branch_id, product_id, quantity, reason) values
    ('30000000-0000-0000-0000-00000000000a', '60000000-0000-0000-0000-000000000001', -2, 'adjustment')$$,
  'a manager corrects the count (-2)'
);
select throws_ok(
  $$insert into public.stock_movements (branch_id, product_id, quantity, reason) values
    ('30000000-0000-0000-0000-00000000000a', '60000000-0000-0000-0000-000000000001', -5, 'purchase')$$,
  '23514', 'invalid_quantity',
  'a purchase must add stock'
);
select throws_ok(
  $$insert into public.stock_movements (branch_id, product_id, quantity, reason) values
    ('30000000-0000-0000-0000-00000000000a', '60000000-0000-0000-0000-000000000009', 5, 'purchase')$$,
  '23514', 'invalid_product',
  'stock of another organization''s product cannot be added'
);
select throws_ok(
  $$insert into public.stock_movements (branch_id, product_id, quantity, reason) values
    ('30000000-0000-0000-0000-00000000000b', '60000000-0000-0000-0000-000000000001', 5, 'purchase')$$,
  '42501', null,
  'a manager cannot restock a branch they don''t manage'
);
select is(
  (select sum(q)::int from (
     select quantity as q from public.stock_movements
      where branch_id = '30000000-0000-0000-0000-00000000000a' and product_id = '60000000-0000-0000-0000-000000000001'
     union all
     select -quantity from public.session_items
      where branch_id = '30000000-0000-0000-0000-00000000000a' and product_id = '60000000-0000-0000-0000-000000000001') t),
  20,
  'stock = 24 bought - 2 corrected - 2 sold (the removed items went back)'
);

-- Expenses
select lives_ok(
  $$insert into public.expenses (id, org_id, branch_id, category, amount, method, spent_on, note) values
    ('c0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-00000000000a',
     'electricity', 250000, 'cash', '2026-10-30', 'October bill')$$,
  'a manager records an expense in branch A'
);
select is(
  (select format('%s|%s', org_id, created_by) from public.expenses where id = 'c0000000-0000-0000-0000-000000000001'),
  '20000000-0000-0000-0000-000000000001|10000000-0000-0000-0000-000000000002',
  'org comes from the branch, created_by is the manager'
);
select throws_ok(
  $$insert into public.expenses (branch_id, category, amount, spent_on) values
    ('30000000-0000-0000-0000-00000000000b', 'rent', 100, '2026-10-30')$$,
  '42501', null,
  'a manager cannot record expenses in a branch they don''t manage'
);
select throws_ok(
  $$insert into public.expenses (branch_id, category, amount, spent_on) values
    ('30000000-0000-0000-0000-00000000000a', 'parties', 100, '2026-10-30')$$,
  '23514', null,
  'the category must be one of the list'
);
select lives_ok(
  $$update public.expenses set amount = 260000 where id = 'c0000000-0000-0000-0000-000000000001'$$,
  'a manager corrects an expense'
);
select lives_ok(
  $$insert into public.expenses (id, branch_id, category, amount, spent_on) values
    ('c0000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-00000000000a', 'other', 100, '2026-10-30')$$,
  'a manager records a second expense'
);
select lives_ok(
  $$delete from public.expenses where id = 'c0000000-0000-0000-0000-000000000002'$$,
  'a manager deletes an expense'
);

-- ===================== cashier CA again: stock and expenses =====================
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}';

select throws_ok(
  $$insert into public.stock_movements (branch_id, product_id, quantity, reason) values
    ('30000000-0000-0000-0000-00000000000a', '60000000-0000-0000-0000-000000000001', 5, 'purchase')$$,
  '42501', null,
  'a cashier cannot restock'
);
select is(
  (select count(*)::int from public.stock_movements), 2,
  'a cashier sees the branch''s stock movements (to show stock levels)'
);
select throws_ok(
  $$delete from public.stock_movements where id = 'b0000000-0000-0000-0000-000000000001'$$,
  '42501', null,
  'stock movements are never deleted (another adjustment corrects them)'
);
select throws_ok(
  $$insert into public.expenses (branch_id, category, amount, spent_on) values
    ('30000000-0000-0000-0000-00000000000a', 'rent', 100, '2026-10-30')$$,
  '42501', null,
  'a cashier cannot record expenses'
);
select is_empty($$select id from public.expenses$$, 'a cashier sees no expenses');

-- ===================== owner O =====================
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';

select lives_ok(
  $$update public.products set price = 2000 where id = '60000000-0000-0000-0000-000000000001'$$,
  'the owner changes a product price'
);
select is(
  (select count(*)::int from public.expenses), 1,
  'the owner sees every expense'
);

-- ===================== audit log (as the system) =====================
reset role;
select results_eq(
  $$select format('%s %s %s', entity, action, actor_id) from public.audit_log
     where entity in ('customers', 'products') and action = 'update' order by id$$,
  array[
    'customers update 10000000-0000-0000-0000-000000000002',
    'products update 10000000-0000-0000-0000-000000000001'
  ],
  'default discount and price changes are audited with who did it'
);
select results_eq(
  $$select format('%s %s', entity, action) from public.audit_log
     where entity in ('session_items', 'stock_movements', 'expenses') and actor_id is not null order by id$$,
  array[
    'session_items insert', 'session_items insert', 'session_items delete', 'session_items delete',
    'stock_movements insert', 'stock_movements insert',
    'expenses insert', 'expenses update', 'expenses insert', 'expenses delete'
  ],
  'items added and removed, stock movements and expenses are audited'
);

-- ===================== outsider X =====================
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}';

select results_eq($$select name from public.customers$$, array['Outsider'], 'an outsider sees only their own customers');
select is_empty($$select id from public.session_items$$, 'an outsider sees no session items');
select is_empty($$select id from public.stock_movements$$, 'an outsider sees no stock');

select * from finish();
rollback;
