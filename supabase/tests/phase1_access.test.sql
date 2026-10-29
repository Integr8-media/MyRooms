-- pgTAP: Phase 1 access rules. Run with `npm run db:test` (needs local Supabase running).
--
-- Cast: org "Arena" with branches A and B.
--   O  owner              M  manager of A
--   CA cashier in A       CB cashier in B
--   X  owner of another org (outsider)
--   I  invitee (confirmed email)    U  invitee (email not confirmed)
begin;
create extension if not exists pgtap with schema extensions;
select plan(59);

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('10000000-0000-0000-0000-000000000001', 'owner@test.local',   now(), '{"full_name":"Olivia Owner"}'),
  ('10000000-0000-0000-0000-000000000002', 'manager@test.local', now(), '{}'),
  ('10000000-0000-0000-0000-000000000003', 'ca@test.local',      now(), '{}'),
  ('10000000-0000-0000-0000-000000000004', 'cb@test.local',      now(), '{}'),
  ('10000000-0000-0000-0000-000000000005', 'x@test.local',       now(), '{}'),
  ('10000000-0000-0000-0000-000000000006', 'Invitee@Test.local', now(), '{}'),
  ('10000000-0000-0000-0000-000000000007', 'unconfirmed@test.local', null, '{}');

insert into public.organizations (id, name) values
  ('20000000-0000-0000-0000-000000000001', 'Arena');

insert into public.branches (id, org_id, name) values
  ('30000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000001', 'Branch A'),
  ('30000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-000000000001', 'Branch B');

insert into public.memberships (id, org_id, user_id, role) values
  ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'owner'),
  ('40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'manager'),
  ('40000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'cashier'),
  ('40000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', 'cashier');

insert into public.member_branches (membership_id, branch_id) values
  ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-00000000000a'),
  ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-00000000000a'),
  ('40000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-00000000000b');

-- Triggers copy identity onto memberships.
select is(
  (select display_name || ' <' || email || '>' from public.memberships
   where id = '40000000-0000-0000-0000-000000000001'),
  'Olivia Owner <owner@test.local>',
  'memberships get the user''s name and email'
);
select is(
  (select org_id::text from public.member_branches
   where membership_id = '40000000-0000-0000-0000-000000000003'),
  '20000000-0000-0000-0000-000000000001',
  'member_branches get org_id from the membership'
);

-- ===================== anonymous =====================
set local role anon;
select throws_ok('select * from public.branches', '42501', null, 'anon cannot read branches');
select throws_ok(
  $$select public.create_organization('Nope', 'Main')$$, '42501', null,
  'anon cannot create an organization'
);
reset role;

-- ===================== cashier CA (branch A) =====================
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}';

select results_eq('select name from public.organizations', array['Arena'], 'cashier sees their organization');
select results_eq('select name from public.branches order by name', array['Branch A'], 'cashier in A sees only branch A');
select results_eq(
  'select email from public.memberships order by email', array['ca@test.local'],
  'cashier sees only their own membership'
);
select is(
  (select count(*)::int from public.member_branches), 1,
  'cashier sees only their own branch assignment'
);
select is_empty('select * from public.invitations', 'cashier sees no invitations');

select throws_ok(
  $$insert into public.branches (org_id, name) values ('20000000-0000-0000-0000-000000000001', 'Sneaky')$$,
  '42501', null, 'cashier cannot create a branch'
);
update public.branches set name = 'Hacked' where id = '30000000-0000-0000-0000-00000000000a';
update public.organizations set feature_snacks = false;
update public.memberships set role = 'owner' where id = '40000000-0000-0000-0000-000000000003';
select throws_ok(
  $$insert into public.member_branches (membership_id, branch_id)
    values ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-00000000000b')$$,
  '42501', null, 'cashier cannot assign themselves to another branch'
);
select throws_ok(
  $$select public.invite_member('20000000-0000-0000-0000-000000000001', 'new@test.local', 'cashier',
    array['30000000-0000-0000-0000-00000000000a']::uuid[])$$,
  '42501', 'not_allowed', 'cashier cannot invite staff'
);
select ok(private.can_access_branch('30000000-0000-0000-0000-00000000000a'), 'cashier can operate branch A');
select ok(not private.can_access_branch('30000000-0000-0000-0000-00000000000b'), 'cashier cannot operate branch B');
select ok(
  not private.can_manage_branch('30000000-0000-0000-0000-00000000000a'),
  'cashier cannot manage branch A (no income, no price edits)'
);
select ok(not private.is_org_owner('20000000-0000-0000-0000-000000000001'), 'cashier is not an owner');
reset role;

select is(
  (select name from public.branches where id = '30000000-0000-0000-0000-00000000000a'), 'Branch A',
  'cashier rename of a branch had no effect'
);
select is(
  (select feature_snacks from public.organizations), true,
  'cashier change to feature toggles had no effect'
);
select is(
  (select role::text from public.memberships where id = '40000000-0000-0000-0000-000000000003'), 'cashier',
  'cashier cannot promote themselves'
);

-- ===================== manager M (branch A) =====================
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}';

select results_eq('select name from public.branches order by name', array['Branch A'], 'manager of A sees only branch A');
select results_eq(
  'select email from public.memberships order by email', array['ca@test.local', 'manager@test.local'],
  'manager sees themselves and staff of their branches only'
);
select ok(private.can_manage_branch('30000000-0000-0000-0000-00000000000a'), 'manager can manage branch A');
select ok(not private.can_manage_branch('30000000-0000-0000-0000-00000000000b'), 'manager cannot manage branch B');

select throws_ok(
  $$insert into public.branches (org_id, name) values ('20000000-0000-0000-0000-000000000001', 'Mine')$$,
  '42501', null, 'manager cannot create a branch'
);
update public.branches set phone = '0100' where id = '30000000-0000-0000-0000-00000000000a';
update public.branches set phone = '0100' where id = '30000000-0000-0000-0000-00000000000b';
select throws_ok(
  $$update public.branches set org_id = '20000000-0000-0000-0000-000000000099'
    where id = '30000000-0000-0000-0000-00000000000a'$$,
  '42501', null, 'nobody can move a branch to another organization'
);
update public.organizations set feature_expenses = false;
update public.memberships set role = 'manager' where id = '40000000-0000-0000-0000-000000000003';

select lives_ok(
  $$insert into public.member_branches (membership_id, branch_id)
    values ('40000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-00000000000a')$$,
  'manager can assign a cashier to their branch'
);
select throws_ok(
  $$insert into public.member_branches (membership_id, branch_id)
    values ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-00000000000b')$$,
  '42501', null, 'manager cannot assign staff to a branch they do not manage'
);
select throws_ok(
  $$select public.invite_member('20000000-0000-0000-0000-000000000001', 'boss@test.local', 'manager',
    array['30000000-0000-0000-0000-00000000000a']::uuid[])$$,
  '42501', 'not_allowed', 'manager cannot invite a manager'
);
select throws_ok(
  $$select public.invite_member('20000000-0000-0000-0000-000000000001', 'new@test.local', 'cashier',
    array['30000000-0000-0000-0000-00000000000b']::uuid[])$$,
  '42501', 'not_allowed', 'manager cannot invite to a branch they do not manage'
);
select lives_ok(
  $$select public.invite_member('20000000-0000-0000-0000-000000000001', ' New@Test.local ', 'cashier',
    array['30000000-0000-0000-0000-00000000000a']::uuid[])$$,
  'manager can invite a cashier to their branch'
);
reset role;

select is(
  (select phone from public.branches where id = '30000000-0000-0000-0000-00000000000a'), '0100',
  'manager can edit their branch'
);
select is(
  (select phone from public.branches where id = '30000000-0000-0000-0000-00000000000b'), null,
  'manager edit of another branch had no effect'
);
select is(
  (select feature_expenses from public.organizations), true,
  'manager cannot change organization settings'
);
select is(
  (select role::text from public.memberships where id = '40000000-0000-0000-0000-000000000003'), 'cashier',
  'manager cannot change roles'
);
select is(
  (select email from public.invitations where invited_by = '10000000-0000-0000-0000-000000000002'),
  'new@test.local', 'invited emails are normalized'
);

-- ===================== owner O =====================
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';

select results_eq(
  'select name from public.branches order by name', array['Branch A', 'Branch B'],
  'owner sees every branch'
);
select is((select count(*)::int from public.memberships), 4, 'owner sees all staff');
select is((select count(*)::int from public.invitations), 1, 'owner sees all invitations');
select lives_ok(
  $$insert into public.branches (org_id, name) values ('20000000-0000-0000-0000-000000000001', 'Branch C')$$,
  'owner can create a branch'
);
update public.organizations set feature_snacks = false;
select throws_ok(
  $$update public.organizations set currency = 'USD'$$, '42501', null,
  'currency cannot be changed by clients'
);
select throws_ok(
  $$update public.organizations set timezone = 'Mars/Olympus'$$, '22023', 'invalid_timezone',
  'timezone must be a real time zone'
);
update public.memberships set role = 'manager' where id = '40000000-0000-0000-0000-000000000004';
update public.memberships set role = 'cashier' where id = '40000000-0000-0000-0000-000000000001';
select throws_ok(
  $$delete from public.memberships where id = '40000000-0000-0000-0000-000000000001'$$,
  '23514', 'last_owner', 'the last owner cannot leave'
);
select throws_ok(
  $$select public.invite_member('20000000-0000-0000-0000-000000000001', 'ca@test.local', 'cashier',
    array['30000000-0000-0000-0000-00000000000a']::uuid[])$$,
  '23505', 'already_member', 'cannot invite someone who is already a member'
);
select throws_ok(
  $$select public.invite_member('20000000-0000-0000-0000-000000000001', 'someone@test.local', 'cashier',
    '{}'::uuid[])$$,
  '22023', 'branches_required', 'staff invitations need at least one branch'
);
select lives_ok(
  $$select public.invite_member('20000000-0000-0000-0000-000000000001', 'invitee@test.local', 'manager',
    array['30000000-0000-0000-0000-00000000000a']::uuid[])$$,
  'owner can invite a manager'
);
select lives_ok(
  $$select public.invite_member('20000000-0000-0000-0000-000000000001', 'unconfirmed@test.local', 'cashier',
    array['30000000-0000-0000-0000-00000000000b']::uuid[])$$,
  'owner can invite a cashier'
);
reset role;

select is((select feature_snacks from public.organizations), false, 'owner can switch a feature off');
select is(
  (select role::text from public.memberships where id = '40000000-0000-0000-0000-000000000004'), 'manager',
  'owner can change another member''s role'
);
select is(
  (select role::text from public.memberships where id = '40000000-0000-0000-0000-000000000001'), 'owner',
  'owner cannot demote themselves'
);

-- ===================== outsider X =====================
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}';

select is_empty('select * from public.branches', 'an outsider sees no branches');
select lives_ok(
  $$select public.create_organization('Other Center', 'Downtown')$$,
  'any signed-in user can create their own organization'
);
select results_eq(
  'select o.name || '' / '' || b.name || '' / '' || m.role from public.organizations o
   join public.branches b on b.org_id = o.id join public.memberships m on m.org_id = o.id',
  array['Other Center / Downtown / owner'],
  'the creator becomes owner and gets a first branch; other organizations stay invisible'
);
select throws_ok(
  $$select public.accept_invitation(
    (select id from public.invitations where email = 'invitee@test.local'))$$,
  'P0002', 'invitation_not_found', 'cannot accept an invitation sent to someone else'
);

-- ===================== invitees =====================
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}';
select is_empty('select * from public.my_invitations()', 'unconfirmed emails see no invitations');

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000006","role":"authenticated"}';
select results_eq(
  'select org_name || '' / '' || role from public.my_invitations()', array['Arena / manager'],
  'invitee sees their pending invitation'
);
reset role;
select lives_ok(
  $$select set_config('test.inv', (select id::text from public.invitations where email = 'invitee@test.local'), true)$$,
  'remember the invitation id'
);
set local role authenticated;
select is(
  public.accept_invitation(current_setting('test.inv')::uuid)::text,
  '20000000-0000-0000-0000-000000000001', 'invitee can accept'
);
select results_eq(
  'select name from public.branches order by name', array['Branch A'],
  'new manager sees the branches from the invitation'
);
select throws_ok(
  $$select public.accept_invitation(current_setting('test.inv')::uuid)$$,
  '22023', 'invitation_used', 'an invitation works only once'
);
reset role;

select * from finish();
rollback;
