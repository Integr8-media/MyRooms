-- Phase 4: checkout and payments.
--
-- bills     one per completed session (bills.id = sessions.id, so two devices checking out
--           the same session offline end up with the same bill). The time charge is
--           calculated by the server: the create-bill Edge Function runs src/domain/pricing.ts
--           on the session's segments and saves the result through public.create_bill(),
--           which only the service role may call. Clients never write amounts.
-- payments  money received for a bill (kind 'payment') or given back (kind 'refund'), by
--           method (cash / visa / instapay). A bill can be split across several payments.
--           Payments are never changed or deleted: a mistake is corrected with a refund.
--
-- Access: everyone working in the branch reads bills and takes payments. Only owners and the
-- branch's managers give discounts, refund and void. Every bill, discount, void, payment and
-- refund goes to the audit log.
--
-- bills.total, bills.paid_amount and bills.status are kept up to date by triggers (not
-- generated columns: those are not sent through logical replication to PowerSync).

create type public.bill_status as enum ('open', 'partially_paid', 'paid', 'void');
create type public.payment_kind as enum ('payment', 'refund');
create type public.payment_method as enum ('cash', 'visa', 'instapay');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.bills (
  id uuid primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  branch_id uuid not null references public.branches (id) on delete cascade,
  session_id uuid not null unique references public.sessions (id) on delete restrict,
  -- Receipt number, counting up per branch.
  number integer not null check (number > 0),
  time_amount integer not null check (time_amount between 0 and 1000000000), -- piasters
  items_amount integer not null default 0 check (items_amount between 0 and 1000000000),
  discount_amount integer not null default 0 check (discount_amount >= 0),
  total integer not null default 0,
  -- Payments minus refunds.
  paid_amount integer not null default 0,
  status public.bill_status not null default 'open',
  -- The priced lines (see BillDetails in src/domain/billing.ts), for the receipt.
  details jsonb not null default '{}'::jsonb,
  discount_reason text check (char_length(discount_reason) <= 200),
  discount_by uuid references auth.users (id) on delete set null,
  void_reason text check (char_length(void_reason) <= 200),
  voided_by uuid references auth.users (id) on delete set null,
  voided_at timestamptz,
  -- Who ended the session / asked for the bill, and when the session ended (device time).
  closed_by uuid references auth.users (id) on delete set null,
  closed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (id = session_id),
  check (discount_amount <= time_amount + items_amount),
  check (total = time_amount + items_amount - discount_amount),
  unique (branch_id, number)
);

create index bills_org_id_idx on public.bills (org_id);
create index bills_branch_id_status_idx on public.bills (branch_id, status);
create index bills_closed_by_idx on public.bills (closed_by);
create index bills_discount_by_idx on public.bills (discount_by);
create index bills_voided_by_idx on public.bills (voided_by);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  -- org_id and branch_id are copied from the bill by a trigger.
  org_id uuid not null references public.organizations (id) on delete cascade,
  branch_id uuid not null references public.branches (id) on delete cascade,
  bill_id uuid not null references public.bills (id) on delete restrict,
  kind public.payment_kind not null default 'payment',
  method public.payment_method not null,
  amount integer not null check (amount between 1 and 1000000000), -- piasters, always positive
  -- Card slip / Instapay transfer number.
  reference text check (char_length(reference) <= 100),
  -- Required for refunds.
  reason text check (char_length(reason) <= 200),
  received_by uuid references auth.users (id) on delete set null,
  -- When the money changed hands (device time; payments are taken offline too).
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index payments_org_id_idx on public.payments (org_id);
create index payments_branch_id_paid_at_idx on public.payments (branch_id, paid_at);
create index payments_bill_id_idx on public.payments (bill_id);
create index payments_received_by_idx on public.payments (received_by);

-- Last receipt number per branch. Not exposed to clients.
create table private.bill_counters (
  branch_id uuid primary key references public.branches (id) on delete cascade,
  last_number integer not null
);

-- ---------------------------------------------------------------------------
-- create_bill: called by the create-bill Edge Function with the service role, after it
-- priced the session with src/domain/pricing.ts. Returns the bill id. Calling it again for
-- the same session returns the existing bill (uploads are retried, two devices may ask).
-- ---------------------------------------------------------------------------
create function public.create_bill(
  p_session_id uuid,
  p_time_amount integer,
  p_details jsonb,
  p_actor uuid
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_session public.sessions;
  v_number integer;
begin
  select * into v_session from public.sessions s where s.id = p_session_id for update;
  if v_session.id is null then
    raise exception 'invalid_session' using errcode = '23514';
  end if;
  -- The actor must work in the session's branch (owner, or assigned to it).
  if p_actor is null or not exists (
    select 1 from public.memberships m
     where m.org_id = v_session.org_id and m.user_id = p_actor
       and (m.role = 'owner' or exists (
         select 1 from public.member_branches mb
          where mb.membership_id = m.id and mb.branch_id = v_session.branch_id))
  ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if exists (select 1 from public.bills b where b.id = p_session_id) then
    return p_session_id;
  end if;
  if v_session.status <> 'completed' then
    raise exception 'session_not_ended' using errcode = '23514';
  end if;
  if p_time_amount is null or p_time_amount < 0 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;

  insert into private.bill_counters as c (branch_id, last_number)
  values (v_session.branch_id, 1)
  on conflict (branch_id) do update set last_number = c.last_number + 1
  returning c.last_number into v_number;

  insert into public.bills (id, org_id, branch_id, session_id, number, time_amount, details,
    closed_by, closed_at)
  values (v_session.id, v_session.org_id, v_session.branch_id, v_session.id, v_number,
    p_time_amount, coalesce(p_details, '{}'::jsonb), p_actor, v_session.actual_end);
  return p_session_id;
end;
$$;

revoke execute on function public.create_bill(uuid, integer, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.create_bill(uuid, integer, jsonb, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- Bills: clients may only give a discount (owners and branch managers, before any payment)
-- or void the bill (owners and branch managers, with a reason). Totals and status are derived.
create function private.check_bill()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if old.status = 'void' then
      raise exception 'bill_void' using errcode = '23514';
    end if;

    if new.discount_amount is distinct from old.discount_amount
       or new.discount_reason is distinct from old.discount_reason then
      if not private.can_manage_branch(new.branch_id) then
        raise exception 'not_allowed' using errcode = '42501';
      end if;
      if old.paid_amount <> 0 then
        raise exception 'bill_has_payments' using errcode = '23514';
      end if;
      if new.discount_amount < 0 or new.discount_amount > new.time_amount + new.items_amount then
        raise exception 'invalid_discount' using errcode = '23514';
      end if;
      new.discount_reason := nullif(btrim(new.discount_reason), '');
      new.discount_by := case when new.discount_amount > 0 then (select auth.uid()) end;
    end if;

    if new.status = 'void' then
      if not private.can_manage_branch(new.branch_id) then
        raise exception 'not_allowed' using errcode = '42501';
      end if;
      new.void_reason := nullif(btrim(new.void_reason), '');
      if new.void_reason is null then
        raise exception 'reason_required' using errcode = '23514';
      end if;
      new.voided_by := (select auth.uid());
      new.voided_at := now();
    elsif new.void_reason is distinct from old.void_reason then
      raise exception 'invalid_bill' using errcode = '23514';
    end if;
  end if;

  new.total := new.time_amount + new.items_amount - new.discount_amount;
  new.status := case
    when new.voided_at is not null then 'void'
    when new.paid_amount >= new.total then 'paid'
    when new.paid_amount > 0 then 'partially_paid'
    else 'open'
  end::public.bill_status;
  return new;
end;
$$;

create function private.check_payment()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_bill public.bills;
begin
  select * into v_bill from public.bills b where b.id = new.bill_id for update;
  if v_bill.id is null then
    raise exception 'invalid_bill' using errcode = '23514';
  end if;
  if v_bill.status = 'void' then
    raise exception 'bill_void' using errcode = '23514';
  end if;
  new.org_id := v_bill.org_id;
  new.branch_id := v_bill.branch_id;
  new.received_by := (select auth.uid());
  new.reference := nullif(btrim(new.reference), '');
  new.reason := nullif(btrim(new.reason), '');
  new.paid_at := coalesce(new.paid_at, now());

  if new.kind = 'refund' then
    if not private.can_manage_branch(new.branch_id) then
      raise exception 'not_allowed' using errcode = '42501';
    end if;
    if new.reason is null then
      raise exception 'reason_required' using errcode = '23514';
    end if;
    if new.amount > v_bill.paid_amount then
      raise exception 'invalid_amount' using errcode = '23514';
    end if;
  end if;
  -- Paying more than the total is accepted: a payment taken offline must never be lost.
  -- The app shows the overpayment so it can be refunded.
  return new;
end;
$$;

-- Keep bills.paid_amount (and so status) in step with the payments.
create function private.update_bill_paid()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.bills b
     set paid_amount = coalesce((
       select sum(case when p.kind = 'refund' then -p.amount else p.amount end)
         from public.payments p where p.bill_id = b.id), 0)
   where b.id = new.bill_id;
  return null;
end;
$$;

-- Audit: who created the bill, gave a discount or voided it. Bills are created by the
-- service role, so the actor falls back to closed_by.
create function private.audit_bill()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.audit_log (org_id, actor_id, entity, entity_id, action, before, after)
  values (new.org_id, coalesce((select auth.uid()), new.closed_by), 'bills', new.id, lower(tg_op),
    case when tg_op = 'UPDATE' then to_jsonb(old) end, to_jsonb(new));
  return null;
end;
$$;

revoke execute on function private.check_bill(), private.check_payment(),
  private.update_bill_paid(), private.audit_bill() from public, anon, authenticated;

create trigger bills_created_at before insert on public.bills
  for each row execute function private.set_created_at();
create trigger bills_updated_at before update on public.bills
  for each row execute function private.set_updated_at();
create trigger bills_check before insert or update on public.bills
  for each row execute function private.check_bill();
create trigger bills_audit_insert after insert on public.bills
  for each row execute function private.audit_bill();
create trigger bills_audit_update after update on public.bills
  for each row when (
    old.discount_amount is distinct from new.discount_amount
    or old.discount_reason is distinct from new.discount_reason
    or old.voided_at is distinct from new.voided_at
  )
  execute function private.audit_bill();

create trigger payments_created_at before insert on public.payments
  for each row execute function private.set_created_at();
create trigger payments_check before insert on public.payments
  for each row execute function private.check_payment();
create trigger payments_update_bill after insert on public.payments
  for each row execute function private.update_bill_paid();
-- Uses the Phase 2 audit_row() (actor = the caller).
create trigger payments_audit after insert on public.payments
  for each row execute function private.audit_row();

-- ---------------------------------------------------------------------------
-- Privileges: nothing by default, then only what clients may write.
-- ---------------------------------------------------------------------------
revoke all on public.bills, public.payments from anon, authenticated;
revoke all on private.bill_counters from public, anon, authenticated;

grant select on public.bills, public.payments to authenticated;
-- No insert on bills: they are created by create_bill() only.
grant update (discount_amount, discount_reason, status, void_reason) on public.bills to authenticated;

grant insert (id, org_id, branch_id, bill_id, kind, method, amount, reference, reason,
  received_by, paid_at, created_at, updated_at) on public.payments to authenticated;
-- No update or delete on payments.

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.bills enable row level security;
alter table public.payments enable row level security;

create policy "bills: branch staff read" on public.bills
  for select to authenticated using (private.can_access_branch(branch_id));
-- Discounts and voids are limited to owners and branch managers by the check_bill trigger.
create policy "bills: branch staff update" on public.bills
  for update to authenticated
  using (private.can_access_branch(branch_id))
  with check (private.can_access_branch(branch_id));

create policy "payments: branch staff read" on public.payments
  for select to authenticated using (private.can_access_branch(branch_id));
-- branch_id is overwritten from the bill by the trigger before this check runs.
-- Refunds are limited to owners and branch managers by the check_payment trigger.
create policy "payments: branch staff create" on public.payments
  for insert to authenticated with check (private.can_access_branch(branch_id));

-- ---------------------------------------------------------------------------
-- PowerSync (see deploy/powersync/sync-config.yaml)
-- ---------------------------------------------------------------------------
alter publication powersync add table public.bills, public.payments;
