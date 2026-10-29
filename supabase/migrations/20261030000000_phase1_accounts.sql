-- Phase 1: organizations, branches, memberships (roles), branch assignments, invitations.
--
-- Access model
--   owner    everything in the organization, all branches.
--   manager  only the branches they are assigned to; can invite/assign cashiers there.
--   cashier  only the branches they are assigned to; read-only for setup data.
--
-- Rules for later phases: use the private.* helpers below in RLS policies, e.g.
--   prices / org setup   -> private.is_org_owner(org_id)
--   income, reports      -> private.can_manage_branch(branch_id)   (cashiers: own shift only)
--   daily operations     -> private.can_access_branch(branch_id)
--
-- Writes from devices go through PowerSync's upload queue: inserts are plain inserts
-- (ON CONFLICT DO NOTHING) and updates only send changed columns, so column-level
-- grants below decide which columns a client may ever change.

-- ---------------------------------------------------------------------------
-- Phase 0 demo table is replaced by the real schema.
-- ---------------------------------------------------------------------------
alter publication powersync drop table public.sync_checks;
drop table public.sync_checks;

-- ---------------------------------------------------------------------------
-- Private schema: helpers used by policies. Not exposed through the REST API.
-- ---------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create type public.app_role as enum ('owner', 'manager', 'cashier');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  currency text not null default 'EGP' check (currency ~ '^[A-Z]{3}$'),
  timezone text not null default 'Africa/Cairo',
  feature_customers boolean not null default true,
  feature_snacks boolean not null default true,
  feature_expenses boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index organizations_created_by_idx on public.organizations (created_by);

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  address text check (char_length(address) <= 300),
  phone text check (char_length(phone) <= 30),
  opening_hours jsonb check (opening_hours is null or jsonb_typeof(opening_hours) = 'object'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index branches_org_id_idx on public.branches (org_id);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  -- Copied from auth.users by triggers so staff lists work offline without a profiles table.
  email text not null default '',
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, user_id)
);

create index memberships_user_id_idx on public.memberships (user_id);

-- Which branches a manager or cashier works in. Owners need no rows: they see every branch.
-- org_id and user_id are copied from the membership (by trigger) to keep policies and
-- PowerSync streams simple.
create table public.member_branches (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.memberships (id) on delete cascade,
  branch_id uuid not null references public.branches (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (membership_id, branch_id)
);

create index member_branches_branch_id_idx on public.member_branches (branch_id);
create index member_branches_org_id_idx on public.member_branches (org_id);
create index member_branches_user_id_idx on public.member_branches (user_id);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role public.app_role not null,
  branch_ids uuid[] not null default '{}',
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  unique (org_id, email)
);

create index invitations_invited_by_idx on public.invitations (invited_by);
create index invitations_email_idx on public.invitations (email);

-- ---------------------------------------------------------------------------
-- Access helpers (security definer: they read memberships without RLS recursion).
-- Each one only ever answers for the calling user (auth.uid()).
-- ---------------------------------------------------------------------------

-- The caller's role in an organization, or null.
create function private.org_role(p_org_id uuid)
returns public.app_role
language sql stable security definer set search_path = ''
as $$
  select m.role from public.memberships m
  where m.org_id = p_org_id and m.user_id = (select auth.uid())
$$;

create function private.is_org_member(p_org_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select private.org_role(p_org_id) is not null $$;

create function private.is_org_owner(p_org_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce(private.org_role(p_org_id) = 'owner', false) $$;

-- The caller's role for a branch: owners have it for every branch of their org,
-- managers and cashiers only for branches they are assigned to. Null = no access.
create function private.branch_role(p_branch_id uuid)
returns public.app_role
language sql stable security definer set search_path = ''
as $$
  select m.role
  from public.branches b
  join public.memberships m on m.org_id = b.org_id and m.user_id = (select auth.uid())
  where b.id = p_branch_id
    and (
      m.role = 'owner'
      or exists (
        select 1 from public.member_branches mb
        where mb.membership_id = m.id and mb.branch_id = b.id
      )
    )
$$;

create function private.can_access_branch(p_branch_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select private.branch_role(p_branch_id) is not null $$;

-- Owner, or a manager assigned to the branch.
create function private.can_manage_branch(p_branch_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce(private.branch_role(p_branch_id) in ('owner', 'manager'), false) $$;

-- Can the caller see this membership? Own row; owners see everyone in the org;
-- managers see people who share one of their branches.
create function private.can_view_membership(p_membership_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships t
    join public.memberships me on me.org_id = t.org_id and me.user_id = (select auth.uid())
    where t.id = p_membership_id
      and (
        t.user_id = me.user_id
        or me.role = 'owner'
        or (
          me.role = 'manager'
          and exists (
            select 1
            from public.member_branches tb
            join public.member_branches mb on mb.branch_id = tb.branch_id
            where tb.membership_id = t.id and mb.membership_id = me.id
          )
        )
      )
  )
$$;

-- Can the caller add/remove this membership <-> branch assignment?
-- Owners: anyone in their org. Managers: cashiers, and only for branches they manage.
create function private.can_assign_branch(p_membership_id uuid, p_branch_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships t
    join public.branches b on b.id = p_branch_id and b.org_id = t.org_id
    where t.id = p_membership_id
      and (
        private.is_org_owner(t.org_id)
        or (t.role = 'cashier' and private.org_role(t.org_id) = 'manager'
            and private.can_manage_branch(p_branch_id))
      )
  )
$$;

-- The caller's email, only once it is confirmed (an unconfirmed address proves nothing).
create function private.confirmed_email()
returns text
language sql stable security definer set search_path = ''
as $$
  select lower(u.email) from auth.users u
  where u.id = (select auth.uid()) and u.email_confirmed_at is not null
$$;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create function private.set_updated_at()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Clients may send created_at/updated_at; the server's clock wins.
create function private.set_created_at()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.created_at := now();
  if tg_table_name <> 'member_branches' then
    new.updated_at := new.created_at;
  end if;
  return new;
end;
$$;

create function private.check_timezone()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'invalid_timezone' using errcode = '22023';
  end if;
  return new;
end;
$$;

create function private.fill_membership_identity()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  select lower(coalesce(u.email, '')), coalesce(u.raw_user_meta_data ->> 'full_name', '')
    into new.email, new.display_name
  from auth.users u where u.id = new.user_id;
  return new;
end;
$$;

-- Keeps memberships.email / display_name in sync with the user's account.
create function private.sync_membership_identity()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.memberships
     set email = lower(coalesce(new.email, '')),
         display_name = coalesce(new.raw_user_meta_data ->> 'full_name', '')
   where user_id = new.id;
  return new;
end;
$$;

-- An organization must always keep at least one owner.
create function private.protect_last_owner()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.role = 'owner' and (tg_op = 'DELETE' or new.role <> 'owner')
     -- the organization itself is being deleted: nothing to protect
     and exists (select 1 from public.organizations o where o.id = old.org_id)
     and not exists (
       select 1 from public.memberships m
       where m.org_id = old.org_id and m.role = 'owner' and m.id <> old.id
     )
  then
    raise exception 'last_owner' using errcode = '23514';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create function private.fill_member_branch()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  select m.org_id, m.user_id into new.org_id, new.user_id
  from public.memberships m where m.id = new.membership_id;

  if not exists (
    select 1 from public.branches b where b.id = new.branch_id and b.org_id = new.org_id
  ) then
    raise exception 'invalid_branch' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger organizations_created_at before insert on public.organizations
  for each row execute function private.set_created_at();
create trigger organizations_updated_at before update on public.organizations
  for each row execute function private.set_updated_at();
create trigger organizations_timezone before insert or update of timezone on public.organizations
  for each row execute function private.check_timezone();

create trigger branches_created_at before insert on public.branches
  for each row execute function private.set_created_at();
create trigger branches_updated_at before update on public.branches
  for each row execute function private.set_updated_at();

create trigger memberships_created_at before insert on public.memberships
  for each row execute function private.set_created_at();
create trigger memberships_updated_at before update on public.memberships
  for each row execute function private.set_updated_at();
create trigger memberships_identity before insert on public.memberships
  for each row execute function private.fill_membership_identity();
create trigger memberships_last_owner before update of role or delete on public.memberships
  for each row execute function private.protect_last_owner();

create trigger member_branches_created_at before insert on public.member_branches
  for each row execute function private.set_created_at();
create trigger member_branches_fill before insert on public.member_branches
  for each row execute function private.fill_member_branch();

create trigger on_auth_user_updated after update of email, raw_user_meta_data on auth.users
  for each row execute function private.sync_membership_identity();

-- ---------------------------------------------------------------------------
-- Privileges. Supabase grants everything to anon/authenticated by default;
-- start from nothing and grant only what the app needs. RLS then filters rows.
-- ---------------------------------------------------------------------------
revoke all on public.organizations, public.branches, public.memberships,
  public.member_branches, public.invitations from anon, authenticated;

grant select on public.organizations, public.branches, public.memberships,
  public.member_branches, public.invitations to authenticated;

grant update (name, timezone, feature_customers, feature_snacks, feature_expenses)
  on public.organizations to authenticated;

grant insert (id, org_id, name, address, phone, opening_hours, is_active, created_at, updated_at)
  on public.branches to authenticated;
grant update (name, address, phone, opening_hours, is_active) on public.branches to authenticated;

grant update (role) on public.memberships to authenticated;
grant delete on public.memberships to authenticated;

grant insert (id, membership_id, branch_id, org_id, user_id, created_at)
  on public.member_branches to authenticated;
grant delete on public.member_branches to authenticated;

grant delete on public.invitations to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.branches enable row level security;
alter table public.memberships enable row level security;
alter table public.member_branches enable row level security;
alter table public.invitations enable row level security;

-- organizations: created only through create_organization(); never deleted by clients.
create policy "organizations: members read" on public.organizations
  for select to authenticated using (private.is_org_member(id));

create policy "organizations: owners update" on public.organizations
  for update to authenticated
  using (private.is_org_owner(id))
  with check (private.is_org_owner(id));

-- branches: deactivate instead of delete (sessions and payments will reference them).
create policy "branches: assigned staff read" on public.branches
  for select to authenticated using (private.can_access_branch(id));

create policy "branches: owners create" on public.branches
  for insert to authenticated with check (private.is_org_owner(org_id));

create policy "branches: owners and branch managers update" on public.branches
  for update to authenticated
  using (private.can_manage_branch(id))
  with check (private.can_manage_branch(id));

-- memberships: created by create_organization() / accept_invitation().
create policy "memberships: read own, owners all, managers their branches" on public.memberships
  for select to authenticated using (private.can_view_membership(id));

create policy "memberships: owners change other members' roles" on public.memberships
  for update to authenticated
  using (private.is_org_owner(org_id) and user_id <> (select auth.uid()))
  with check (private.is_org_owner(org_id) and user_id <> (select auth.uid()));

create policy "memberships: owners remove others, anyone leaves" on public.memberships
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    or private.is_org_owner(org_id)
  );

-- member_branches
create policy "member_branches: read own, owners, branch managers" on public.member_branches
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or private.is_org_owner(org_id)
    or private.can_manage_branch(branch_id)
  );

create policy "member_branches: owners and managers assign" on public.member_branches
  for insert to authenticated
  with check (private.can_assign_branch(membership_id, branch_id));

create policy "member_branches: owners and managers unassign" on public.member_branches
  for delete to authenticated
  using (private.can_assign_branch(membership_id, branch_id));

-- invitations: created through invite_member(), accepted through accept_invitation().
create policy "invitations: owners, inviter and invitee read" on public.invitations
  for select to authenticated
  using (
    private.is_org_owner(org_id)
    or invited_by = (select auth.uid())
    or email = (select private.confirmed_email())
  );

create policy "invitations: owners, inviter and invitee delete" on public.invitations
  for delete to authenticated
  using (
    private.is_org_owner(org_id)
    or invited_by = (select auth.uid())
    or email = (select private.confirmed_email())
  );

-- ---------------------------------------------------------------------------
-- RPCs (online only). Errors are raised with a stable key the app translates.
-- ---------------------------------------------------------------------------

-- First login: the caller creates an organization, becomes its owner, and gets a first branch.
create function public.create_organization(
  p_name text,
  p_branch_name text,
  p_timezone text default 'Africa/Cairo'
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_org_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  insert into public.organizations (name, timezone, created_by)
  values (btrim(p_name), coalesce(nullif(btrim(p_timezone), ''), 'Africa/Cairo'), v_uid)
  returning id into v_org_id;

  insert into public.memberships (org_id, user_id, role) values (v_org_id, v_uid, 'owner');
  insert into public.branches (org_id, name) values (v_org_id, btrim(p_branch_name));

  return v_org_id;
end;
$$;

-- Owners invite any role; managers invite cashiers to branches they manage.
-- Re-inviting the same email replaces the pending invitation.
create function public.invite_member(
  p_org_id uuid,
  p_email text,
  p_role public.app_role,
  p_branch_ids uuid[] default '{}'
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_my_role public.app_role := private.org_role(p_org_id);
  v_email text := lower(btrim(p_email));
  v_branch_ids uuid[];
  v_id uuid;
begin
  if v_my_role is null or v_my_role = 'cashier' then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if v_my_role = 'manager' and p_role <> 'cashier' then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if p_role = 'owner' then
    v_branch_ids := '{}';
  else
    select coalesce(array_agg(distinct b), '{}') into v_branch_ids
    from unnest(coalesce(p_branch_ids, '{}')) as b;
    if cardinality(v_branch_ids) = 0 then
      raise exception 'branches_required' using errcode = '22023';
    end if;
  end if;

  if exists (
    select 1 from unnest(v_branch_ids) as b(id)
    where not exists (
      select 1 from public.branches br where br.id = b.id and br.org_id = p_org_id
    )
  ) then
    raise exception 'invalid_branch' using errcode = '22023';
  end if;

  if v_my_role = 'manager' and exists (
    select 1 from unnest(v_branch_ids) as b(id) where not private.can_manage_branch(b.id)
  ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.memberships m where m.org_id = p_org_id and m.email = v_email
  ) then
    raise exception 'already_member' using errcode = '23505';
  end if;

  insert into public.invitations as i (org_id, email, role, branch_ids, invited_by)
  values (p_org_id, v_email, p_role, v_branch_ids, v_uid)
  on conflict (org_id, email) do update
    set role = excluded.role,
        branch_ids = excluded.branch_ids,
        invited_by = excluded.invited_by,
        created_at = now(),
        expires_at = now() + interval '14 days',
        accepted_at = null
    -- a manager can't overwrite a pending invitation someone else sent
    where i.accepted_at is not null or v_my_role = 'owner' or i.invited_by = v_uid
  returning i.id into v_id;

  if v_id is null then
    raise exception 'already_invited' using errcode = '23505';
  end if;
  return v_id;
end;
$$;

-- Pending invitations for the caller's (confirmed) email, with the organization name.
create function public.my_invitations()
returns table (
  id uuid,
  org_id uuid,
  org_name text,
  role public.app_role,
  expires_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select i.id, i.org_id, o.name, i.role, i.expires_at
  from public.invitations i
  join public.organizations o on o.id = i.org_id
  where i.email = private.confirmed_email()
    and i.accepted_at is null
    and i.expires_at > now()
  order by i.created_at desc
$$;

create function public.accept_invitation(p_invitation_id uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := private.confirmed_email();
  v_inv public.invitations;
  v_membership_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if v_email is null then
    raise exception 'email_not_confirmed' using errcode = '42501';
  end if;

  select * into v_inv from public.invitations where id = p_invitation_id for update;
  if not found or v_inv.email <> v_email then
    raise exception 'invitation_not_found' using errcode = 'P0002';
  end if;
  if v_inv.accepted_at is not null then
    raise exception 'invitation_used' using errcode = '22023';
  end if;
  if v_inv.expires_at <= now() then
    raise exception 'invitation_expired' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.memberships m where m.org_id = v_inv.org_id and m.user_id = v_uid
  ) then
    raise exception 'already_member' using errcode = '23505';
  end if;

  insert into public.memberships (org_id, user_id, role)
  values (v_inv.org_id, v_uid, v_inv.role)
  returning id into v_membership_id;

  insert into public.member_branches (membership_id, branch_id)
  select v_membership_id, b.id
  from public.branches b
  where b.id = any (v_inv.branch_ids) and b.org_id = v_inv.org_id;

  update public.invitations set accepted_at = now() where id = v_inv.id;

  return v_inv.org_id;
end;
$$;

revoke execute on function public.create_organization(text, text, text) from public, anon;
revoke execute on function public.invite_member(uuid, text, public.app_role, uuid[]) from public, anon;
revoke execute on function public.my_invitations() from public, anon;
revoke execute on function public.accept_invitation(uuid) from public, anon;
grant execute on function public.create_organization(text, text, text) to authenticated;
grant execute on function public.invite_member(uuid, text, public.app_role, uuid[]) to authenticated;
grant execute on function public.my_invitations() to authenticated;
grant execute on function public.accept_invitation(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- PowerSync: replicate the new tables (see deploy/powersync/sync-config.yaml).
-- ---------------------------------------------------------------------------
alter publication powersync add table
  public.organizations,
  public.branches,
  public.memberships,
  public.member_branches,
  public.invitations;
