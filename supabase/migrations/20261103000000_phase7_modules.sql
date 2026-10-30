-- Phase 7: optional modules (customers, snacks & drinks with stock, expenses).
--
-- customers        org-wide list (name, phone, notes, default discount %). Any member adds and
--                  edits them (cashiers create customers while starting a session); only owners
--                  and managers set the default discount. Never deleted (is_active = false).
--                  sessions.customer_id links a walk-in or reservation to a customer.
-- products         org-wide snacks and drinks with a price (piasters). Owners only, like prices.
-- session_items    products sold during a session. The server sets the name and unit price
--                  from the product (clients can't write amounts) and keeps the bill's
--                  items_amount in step. Branch staff add items while the session runs or until
--                  its bill is void; removing an item after the session ended is for owners and
--                  managers, and only before any payment.
-- stock_movements  restocks ('purchase', positive) and count corrections ('adjustment') per
--                  branch, by owners and the branch's managers. Sales are NOT stock movements:
--                  stock = sum(movements) - sum(session_items) for the branch and product. So an
--                  item sold offline is never counted twice, and removing an item puts it back.
-- expenses         money spent per branch (category, amount, method, date). Owners and the
--                  branch's managers only; cashiers never see them.
--
-- The organization's feature toggles (feature_customers / feature_snacks / feature_expenses)
-- only hide the modules in the app. The server keeps accepting writes, so a sale or expense
-- recorded offline just before a module was switched off is not lost, and data is kept.
--
-- Bills: create_bill() now adds the session's items and the customer's default discount.
-- Every money change (product prices, default discounts, items, stock, expenses) is audited.

create type public.stock_reason as enum ('purchase', 'adjustment');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  -- Not unique: two devices may add the same person offline, and a refused customer would
  -- also refuse the session that points at it. The app suggests existing matches instead.
  phone text check (char_length(phone) <= 30),
  notes text check (char_length(notes) <= 500),
  default_discount_pct smallint not null default 0 check (default_discount_pct between 0 and 100),
  is_active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index customers_org_id_idx on public.customers (org_id);
create index customers_org_id_phone_idx on public.customers (org_id, phone);
create index customers_created_by_idx on public.customers (created_by);

alter table public.sessions
  add column customer_id uuid references public.customers (id) on delete restrict;
create index sessions_customer_id_idx on public.sessions (customer_id);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  category text check (char_length(category) <= 40),
  price integer not null check (price between 0 and 10000000), -- piasters
  track_stock boolean not null default true,
  -- Warn when the branch's stock is at or below this. Null: no warning.
  low_stock_at integer check (low_stock_at between 0 and 100000),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index products_org_id_idx on public.products (org_id);

create table public.session_items (
  id uuid primary key default gen_random_uuid(),
  -- org_id and branch_id are copied from the session, name and unit_price from the product.
  org_id uuid not null references public.organizations (id) on delete cascade,
  branch_id uuid not null references public.branches (id) on delete cascade,
  session_id uuid not null references public.sessions (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  name text not null check (char_length(name) <= 80),
  quantity integer not null check (quantity between 1 and 1000),
  unit_price integer not null check (unit_price between 0 and 10000000), -- piasters
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index session_items_org_id_idx on public.session_items (org_id);
create index session_items_branch_id_product_id_idx on public.session_items (branch_id, product_id);
create index session_items_session_id_idx on public.session_items (session_id);
create index session_items_product_id_idx on public.session_items (product_id);
create index session_items_created_by_idx on public.session_items (created_by);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  -- org_id is copied from the branch.
  org_id uuid not null references public.organizations (id) on delete cascade,
  branch_id uuid not null references public.branches (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  -- Purchases are positive; adjustments either way.
  quantity integer not null check (quantity <> 0 and quantity between -100000 and 100000),
  reason public.stock_reason not null,
  note text check (char_length(note) <= 200),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index stock_movements_org_id_idx on public.stock_movements (org_id);
create index stock_movements_branch_id_product_id_idx on public.stock_movements (branch_id, product_id);
create index stock_movements_product_id_idx on public.stock_movements (product_id);
create index stock_movements_created_by_idx on public.stock_movements (created_by);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  -- org_id is copied from the branch.
  org_id uuid not null references public.organizations (id) on delete cascade,
  branch_id uuid not null references public.branches (id) on delete cascade,
  -- Same list as EXPENSE_CATEGORIES in src/domain/expenses.ts.
  category text not null check (category in
    ('rent', 'salaries', 'electricity', 'internet', 'maintenance', 'supplies', 'snacks', 'other')),
  amount integer not null check (amount between 1 and 1000000000), -- piasters
  method public.payment_method not null default 'cash',
  -- Local date in the org's time zone ("YYYY-MM-DD").
  spent_on date not null,
  note text check (char_length(note) <= 200),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index expenses_org_id_idx on public.expenses (org_id);
create index expenses_branch_id_spent_on_idx on public.expenses (branch_id, spent_on);
create index expenses_created_by_idx on public.expenses (created_by);

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

-- Customers: who added them; only owners and managers give a default discount.
create function private.check_customer()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := (select auth.uid());
  end if;
  new.name := btrim(new.name);
  new.phone := nullif(btrim(new.phone), '');
  new.notes := nullif(btrim(new.notes), '');
  if (tg_op = 'INSERT' and new.default_discount_pct <> 0)
     or (tg_op = 'UPDATE' and new.default_discount_pct is distinct from old.default_discount_pct) then
    if coalesce(private.org_role(new.org_id) not in ('owner', 'manager'), true) then
      raise exception 'not_allowed' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- A session's customer must belong to the session's organization.
create function private.check_session_customer()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.customer_id is not null and not exists (
    select 1 from public.customers c where c.id = new.customer_id and c.org_id = new.org_id
  ) then
    raise exception 'invalid_customer' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- What a session's items come to (piasters).
create function private.session_items_total(p_session_id uuid)
returns integer
language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(i.quantity * i.unit_price), 0)::integer
    from public.session_items i where i.session_id = p_session_id
$$;

-- Adding an item: the session must be running or ended with a bill that isn't void.
-- Name and price come from the product (the client's values are ignored).
create function private.check_session_item()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_session public.sessions;
  v_product public.products;
  v_bill public.bills;
begin
  select * into v_session from public.sessions s where s.id = new.session_id;
  if v_session.id is null then
    raise exception 'invalid_session' using errcode = '23514';
  end if;
  select * into v_product from public.products p where p.id = new.product_id;
  if v_product.id is null or v_product.org_id <> v_session.org_id then
    raise exception 'invalid_product' using errcode = '23514';
  end if;
  if v_session.status not in ('active', 'completed') then
    raise exception 'session_closed' using errcode = '23514';
  end if;
  select * into v_bill from public.bills b where b.id = v_session.id for update;
  if v_bill.status = 'void' then
    raise exception 'bill_void' using errcode = '23514';
  end if;

  new.org_id := v_session.org_id;
  new.branch_id := v_session.branch_id;
  new.name := v_product.name;
  new.unit_price := v_product.price;
  new.created_by := (select auth.uid());
  return new;
end;
$$;

-- Removing an item: while the session runs, any branch staff (RLS). After it ended, only owners
-- and the branch's managers, before any payment, and never below the bill's discount.
create function private.check_session_item_delete()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_status public.session_status;
  v_bill public.bills;
begin
  select s.status into v_status from public.sessions s where s.id = old.session_id;
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

-- Keep bills.items_amount (and so total and status) in step with the session's items.
create function private.update_bill_items()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_session_id uuid := case when tg_op = 'DELETE' then old.session_id else new.session_id end;
begin
  update public.bills b
     set items_amount = private.session_items_total(v_session_id)
   where b.id = v_session_id and b.status <> 'void';
  return null;
end;
$$;

-- Stock movements: org from the branch, product of the same org, purchases add stock.
create function private.check_stock_movement()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  select b.org_id into new.org_id from public.branches b where b.id = new.branch_id;
  if not exists (
    select 1 from public.products p where p.id = new.product_id and p.org_id = new.org_id
  ) then
    raise exception 'invalid_product' using errcode = '23514';
  end if;
  if new.reason = 'purchase' and new.quantity <= 0 then
    raise exception 'invalid_quantity' using errcode = '23514';
  end if;
  new.note := nullif(btrim(new.note), '');
  new.created_by := (select auth.uid());
  return new;
end;
$$;

-- Expenses: org from the branch, who recorded them.
create function private.fill_expense()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    select b.org_id into new.org_id from public.branches b where b.id = new.branch_id;
    new.created_by := (select auth.uid());
  end if;
  new.note := nullif(btrim(new.note), '');
  return new;
end;
$$;

-- Same as Phase 4, plus the session's items and the customer's default discount
-- (discount_reason 'customer:<percent>', which the app shows as "Customer discount").
create or replace function public.create_bill(
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
  v_items integer;
  v_pct smallint;
  v_discount integer := 0;
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

  v_items := private.session_items_total(v_session.id);
  select c.default_discount_pct into v_pct from public.customers c where c.id = v_session.customer_id;
  if coalesce(v_pct, 0) > 0 then
    -- Same rounding as percentDiscount() in src/domain/billing.ts.
    v_discount := round((p_time_amount + v_items) * v_pct / 100.0)::integer;
  end if;

  insert into private.bill_counters as c (branch_id, last_number)
  values (v_session.branch_id, 1)
  on conflict (branch_id) do update set last_number = c.last_number + 1
  returning c.last_number into v_number;

  insert into public.bills (id, org_id, branch_id, session_id, number, time_amount, items_amount,
    discount_amount, discount_reason, details, closed_by, closed_at)
  values (v_session.id, v_session.org_id, v_session.branch_id, v_session.id, v_number,
    p_time_amount, v_items, v_discount,
    case when v_discount > 0 then 'customer:' || v_pct end,
    coalesce(p_details, '{}'::jsonb), p_actor, v_session.actual_end);
  return p_session_id;
end;
$$;

revoke execute on function public.create_bill(uuid, integer, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.create_bill(uuid, integer, jsonb, uuid) to service_role;

revoke execute on function private.check_customer(), private.check_session_customer(),
  private.session_items_total(uuid), private.check_session_item(),
  private.check_session_item_delete(), private.update_bill_items(),
  private.check_stock_movement(), private.fill_expense()
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Triggers (sessions_customer runs after sessions_check, which sets org_id on insert)
-- ---------------------------------------------------------------------------
create trigger customers_created_at before insert on public.customers
  for each row execute function private.set_created_at();
create trigger customers_updated_at before update on public.customers
  for each row execute function private.set_updated_at();
create trigger customers_check before insert or update on public.customers
  for each row execute function private.check_customer();
-- A default discount is a money rule: audit it.
create trigger customers_audit_insert after insert on public.customers
  for each row when (new.default_discount_pct <> 0) execute function private.audit_row();
create trigger customers_audit_update after update on public.customers
  for each row when (old.default_discount_pct is distinct from new.default_discount_pct)
  execute function private.audit_row();

create trigger sessions_customer before insert or update of customer_id on public.sessions
  for each row execute function private.check_session_customer();

create trigger products_created_at before insert on public.products
  for each row execute function private.set_created_at();
create trigger products_updated_at before update on public.products
  for each row execute function private.set_updated_at();
create trigger products_audit after insert or update on public.products
  for each row execute function private.audit_row();

create trigger session_items_created_at before insert on public.session_items
  for each row execute function private.set_created_at();
create trigger session_items_check before insert on public.session_items
  for each row execute function private.check_session_item();
create trigger session_items_check_delete before delete on public.session_items
  for each row execute function private.check_session_item_delete();
create trigger session_items_update_bill after insert or delete on public.session_items
  for each row execute function private.update_bill_items();
create trigger session_items_audit after insert or delete on public.session_items
  for each row execute function private.audit_row();

create trigger stock_movements_created_at before insert on public.stock_movements
  for each row execute function private.set_created_at();
create trigger stock_movements_check before insert on public.stock_movements
  for each row execute function private.check_stock_movement();
create trigger stock_movements_audit after insert on public.stock_movements
  for each row execute function private.audit_row();

create trigger expenses_created_at before insert on public.expenses
  for each row execute function private.set_created_at();
create trigger expenses_updated_at before update on public.expenses
  for each row execute function private.set_updated_at();
create trigger expenses_fill before insert or update on public.expenses
  for each row execute function private.fill_expense();
create trigger expenses_audit after insert or update or delete on public.expenses
  for each row execute function private.audit_row();

-- ---------------------------------------------------------------------------
-- Privileges: nothing by default, then only the columns clients may write.
-- ---------------------------------------------------------------------------
revoke all on public.customers, public.products, public.session_items, public.stock_movements,
  public.expenses from anon, authenticated;

grant select on public.customers, public.products, public.session_items, public.stock_movements,
  public.expenses to authenticated;

grant insert (id, org_id, name, phone, notes, default_discount_pct, is_active, created_at, updated_at)
  on public.customers to authenticated;
grant update (name, phone, notes, default_discount_pct, is_active) on public.customers to authenticated;

grant insert (customer_id) on public.sessions to authenticated;
grant update (customer_id) on public.sessions to authenticated;

grant insert (id, org_id, name, category, price, track_stock, low_stock_at, sort_order, is_active,
  created_at, updated_at) on public.products to authenticated;
grant update (name, category, price, track_stock, low_stock_at, sort_order, is_active)
  on public.products to authenticated;

-- name and unit_price are overwritten from the product; sent only so the device row is complete.
grant insert (id, org_id, branch_id, session_id, product_id, name, quantity, unit_price,
  created_at, updated_at) on public.session_items to authenticated;
grant delete on public.session_items to authenticated;
-- No update: change a quantity by removing the item and adding it again.

grant insert (id, org_id, branch_id, product_id, quantity, reason, note, created_at, updated_at)
  on public.stock_movements to authenticated;
-- No update or delete: a wrong count is corrected with another adjustment.

grant insert (id, org_id, branch_id, category, amount, method, spent_on, note, created_at, updated_at)
  on public.expenses to authenticated;
grant update (category, amount, method, spent_on, note) on public.expenses to authenticated;
grant delete on public.expenses to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.customers enable row level security;
alter table public.products enable row level security;
alter table public.session_items enable row level security;
alter table public.stock_movements enable row level security;
alter table public.expenses enable row level security;

-- Customers are shared by every branch of the organization.
create policy "customers: members read" on public.customers
  for select to authenticated using (private.is_org_member(org_id));
create policy "customers: members create" on public.customers
  for insert to authenticated with check (private.is_org_member(org_id));
-- The default discount is limited to owners and managers by the check_customer trigger.
create policy "customers: members update" on public.customers
  for update to authenticated
  using (private.is_org_member(org_id))
  with check (private.is_org_member(org_id));

create policy "products: members read" on public.products
  for select to authenticated using (private.is_org_member(org_id));
create policy "products: owners create" on public.products
  for insert to authenticated with check (private.is_org_owner(org_id));
create policy "products: owners update" on public.products
  for update to authenticated
  using (private.is_org_owner(org_id))
  with check (private.is_org_owner(org_id));

create policy "session_items: branch staff read" on public.session_items
  for select to authenticated using (private.can_access_branch(branch_id));
-- branch_id is overwritten from the session by the trigger before this check runs.
create policy "session_items: branch staff create" on public.session_items
  for insert to authenticated with check (private.can_access_branch(branch_id));
-- After the session ended, only owners and managers (check_session_item_delete).
create policy "session_items: branch staff delete" on public.session_items
  for delete to authenticated using (private.can_access_branch(branch_id));

create policy "stock_movements: branch staff read" on public.stock_movements
  for select to authenticated using (private.can_access_branch(branch_id));
create policy "stock_movements: owners and branch managers create" on public.stock_movements
  for insert to authenticated with check (private.can_manage_branch(branch_id));

create policy "expenses: owners and branch managers read" on public.expenses
  for select to authenticated using (private.can_manage_branch(branch_id));
create policy "expenses: owners and branch managers create" on public.expenses
  for insert to authenticated with check (private.can_manage_branch(branch_id));
create policy "expenses: owners and branch managers update" on public.expenses
  for update to authenticated
  using (private.can_manage_branch(branch_id))
  with check (private.can_manage_branch(branch_id));
create policy "expenses: owners and branch managers delete" on public.expenses
  for delete to authenticated using (private.can_manage_branch(branch_id));

-- ---------------------------------------------------------------------------
-- PowerSync (see deploy/powersync/sync-config.yaml)
-- ---------------------------------------------------------------------------
alter publication powersync add table public.customers, public.products, public.session_items,
  public.stock_movements, public.expenses;
