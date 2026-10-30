-- Phase 10: "Delete my account" (required by Google Play and the App Store).
--
-- The `delete-account` Edge Function calls delete_account() with the service role, then
-- soft-deletes the auth user (GoTrue keeps the row with the email scrubbed, so the
-- `on delete set null` references on sessions, bills, payments… never fire and closed
-- records are not rewritten).
--
-- What happens to the person's organizations:
--   * only member      → the organization and all its data are deleted;
--   * only owner, but other members remain → refused ('last_owner'): make someone else owner;
--   * otherwise        → their membership (and branch assignments) are removed.
-- Records they made (sessions, payments, …) stay with the organization; their name and email
-- were only on the membership, which is gone.

-- Deleting a whole session (only delete_account does that: clients have no DELETE on
-- sessions) cascades to its items. The item delete check is for staff removing one item,
-- so skip it when the session itself is gone, like protect_last_owner does for organizations.
create or replace function private.check_session_item_delete()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_status public.session_status;
  v_bill public.bills;
begin
  select s.status into v_status from public.sessions s where s.id = old.session_id;
  if not found then
    return old; -- the session itself is being deleted
  end if;
  if v_status = 'active' then
    return old;
  end if;
  if v_status <> 'completed' then
    raise exception 'session_closed' using errcode = '23514';
  end if;
  if not private.can_manage_branch(old.branch_id) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select * into v_bill from public.bills b where b.id = old.session_id for update;
  if v_bill.id is not null then
    if v_bill.status = 'void' then
      raise exception 'bill_void' using errcode = '23514';
    end if;
    if v_bill.paid_amount <> 0 then
      raise exception 'bill_has_payments' using errcode = '23514';
    end if;
    if v_bill.discount_amount > v_bill.time_amount + v_bill.items_amount - old.quantity * old.unit_price then
      raise exception 'invalid_discount' using errcode = '23514';
    end if;
  end if;
  return old;
end;
$$;

-- Deletes one organization and everything in it. Children first: sessions, bills, payments,
-- products and customers use `on delete restrict`, so a plain cascade from the organization
-- would fail.
create function private.purge_organization(p_org uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.payments where org_id = p_org;
  delete from public.bills where org_id = p_org;
  delete from public.sessions where org_id = p_org;  -- cascades to segments and items
  delete from public.stock_movements where org_id = p_org;
  delete from public.expenses where org_id = p_org;
  delete from public.products where org_id = p_org;
  delete from public.customers where org_id = p_org;
  delete from public.packages where org_id = p_org;
  delete from public.rate_rules where org_id = p_org;
  delete from public.stations where org_id = p_org;
  delete from public.station_types where org_id = p_org;
  -- Last: the deletes above write audit rows.
  delete from public.audit_log where org_id = p_org;
  -- Cascades to branches (+ bill counters), memberships, branch assignments, invitations.
  delete from public.organizations where id = p_org;
end;
$$;

create function public.delete_account(p_user uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_org uuid;
  v_deleted uuid[] := '{}';
  v_email text;
begin
  if p_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  -- Refuse before changing anything: the only owner of an organization that has other people.
  if exists (
    select 1 from public.memberships m
    where m.user_id = p_user and m.role = 'owner'
      and not exists (
        select 1 from public.memberships o
        where o.org_id = m.org_id and o.role = 'owner' and o.user_id <> p_user)
      and exists (
        select 1 from public.memberships o where o.org_id = m.org_id and o.user_id <> p_user)
  ) then
    raise exception 'last_owner' using errcode = '23514';
  end if;

  -- Organizations where they are the only member go with them.
  for v_org in
    select m.org_id from public.memberships m
    where m.user_id = p_user
      and not exists (
        select 1 from public.memberships o where o.org_id = m.org_id and o.user_id <> p_user)
  loop
    perform private.purge_organization(v_org);
    v_deleted := v_deleted || v_org;
  end loop;

  -- Everywhere else: leave (branch assignments cascade).
  delete from public.memberships where user_id = p_user;

  -- Invitations waiting for them.
  select lower(u.email) into v_email from auth.users u where u.id = p_user;
  if v_email is not null then
    delete from public.invitations where email = v_email and accepted_at is null;
  end if;

  return jsonb_build_object('deleted_orgs', to_jsonb(v_deleted));
end;
$$;

comment on function public.delete_account(uuid) is
  'Removes a user from every organization before their account is deleted (Phase 10). Service role only: called by the delete-account Edge Function.';

revoke execute on function private.purge_organization(uuid) from public, anon, authenticated;
revoke execute on function public.delete_account(uuid) from public, anon, authenticated;
grant execute on function public.delete_account(uuid) to service_role;
