-- pgTAP: run with `npx supabase test db` (needs local Supabase running).
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'b@test.local');

insert into public.sync_checks (user_id, note, platform) values
  ('11111111-1111-1111-1111-111111111111', 'from A', 'web'),
  ('22222222-2222-2222-2222-222222222222', 'from B', 'android');

-- Act as user A.
set local role authenticated;
set local request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

select results_eq(
  'select note from public.sync_checks',
  array['from A'],
  'a user only sees their own records'
);

select lives_ok(
  $$insert into public.sync_checks (note, platform) values ('new', 'ios')$$,
  'a user can insert a record for themselves (user_id defaults to auth.uid())'
);

select throws_ok(
  $$insert into public.sync_checks (user_id, note, platform)
    values ('22222222-2222-2222-2222-222222222222', 'spoof', 'web')$$,
  '42501',
  null,
  'a user cannot insert a record for someone else'
);

select is(
  (select count(*)::int from public.sync_checks where user_id = '22222222-2222-2222-2222-222222222222'),
  0,
  'other users'' records are invisible'
);

select * from finish();
rollback;
