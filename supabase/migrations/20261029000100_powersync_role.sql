-- Database role used by the PowerSync service to read changes (logical replication).
-- No password here: set it once on each server, see deploy/README.md.
do $$
begin
  if not exists (select from pg_roles where rolname = 'powersync_role') then
    create role powersync_role with replication bypassrls login;
  end if;
end
$$;

grant usage on schema public to powersync_role;
grant select on all tables in schema public to powersync_role;
alter default privileges in schema public grant select on tables to powersync_role;
