-- Phase 9: offline hardening.
--
-- Sessions, payments and bills are timed on the device (they work offline), so a device with
-- a wrong clock makes wrong bills. The app compares its clock with this function whenever it
-- comes online and warns staff when it is more than 2 minutes off. Read-only, no data.

create function public.server_time()
returns timestamptz
language sql
stable
security invoker
set search_path = ''
as $$ select now() $$;

comment on function public.server_time() is
  'The server clock, for the app''s device-clock check (Phase 9). Signed-in users only.';

revoke execute on function public.server_time() from public, anon;
grant execute on function public.server_time() to authenticated;
