-- pgTAP: Phase 9 offline hardening (device clock check).
-- Run with `npm run db:test` (needs local Supabase running).
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users (id, email, email_confirmed_at) values
  ('10000000-0000-0000-0000-000000000001', 'owner@test.local', now());

select ok(
  not has_function_privilege('anon', 'public.server_time()', 'execute'),
  'signed-out visitors can''t call server_time'
);
select ok(
  has_function_privilege('authenticated', 'public.server_time()', 'execute'),
  'signed-in users can call server_time'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';

select is(public.server_time(), now(), 'server_time is the database clock');
select ok(
  (select provolatile = 's' and not prosecdef from pg_proc where proname = 'server_time'),
  'server_time is stable and runs with the caller''s rights'
);

select * from finish();
rollback;
