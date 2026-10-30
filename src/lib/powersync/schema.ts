import { column, Schema, Table } from '@powersync/common';

/**
 * Local SQLite schema mirrored from Postgres (supabase/migrations). PowerSync adds `id`.
 * Types on the device: uuid/enum/timestamptz -> text (ISO), boolean -> integer (0/1),
 * jsonb and arrays -> JSON text. Money columns are integers (piasters).
 *
 * Writes: never set created_at/updated_at in an UPDATE (the server owns them and clients
 * have no privilege on those columns, so the change would be rejected).
 */
const organizations = new Table({
  name: column.text,
  currency: column.text,
  timezone: column.text,
  feature_customers: column.integer,
  feature_snacks: column.integer,
  feature_expenses: column.integer,
  created_by: column.text,
  created_at: column.text,
  updated_at: column.text,
});

const branches = new Table(
  {
    org_id: column.text,
    name: column.text,
    address: column.text,
    phone: column.text,
    opening_hours: column.text,
    is_active: column.integer,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: { org: ['org_id'] } },
);

const memberships = new Table(
  {
    org_id: column.text,
    user_id: column.text,
    role: column.text,
    email: column.text,
    display_name: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: { org: ['org_id'], user: ['user_id'] } },
);

const member_branches = new Table(
  {
    membership_id: column.text,
    branch_id: column.text,
    org_id: column.text,
    user_id: column.text,
    created_at: column.text,
  },
  { indexes: { membership: ['membership_id'], branch: ['branch_id'] } },
);

const invitations = new Table(
  {
    org_id: column.text,
    email: column.text,
    role: column.text,
    branch_ids: column.text,
    invited_by: column.text,
    created_at: column.text,
    expires_at: column.text,
    accepted_at: column.text,
  },
  { indexes: { org: ['org_id'] } },
);

const station_types = new Table(
  {
    org_id: column.text,
    kind: column.text,
    name: column.text,
    color: column.text,
    max_players: column.integer,
    sort_order: column.integer,
    is_active: column.integer,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: { org: ['org_id'] } },
);

const stations = new Table(
  {
    org_id: column.text,
    branch_id: column.text,
    station_type_id: column.text,
    name: column.text,
    status: column.text,
    notes: column.text,
    sort_order: column.integer,
    is_active: column.integer,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: { branch: ['branch_id'], type: ['station_type_id'] } },
);

/** Prices are integer piasters. Times: minutes after local midnight. Dates: "YYYY-MM-DD". */
const rate_rules = new Table(
  {
    org_id: column.text,
    station_type_id: column.text,
    name: column.text,
    price_per_hour: column.integer,
    players_min: column.integer,
    players_max: column.integer,
    days_of_week: column.integer,
    from_minute: column.integer,
    to_minute: column.integer,
    priority: column.integer,
    valid_from: column.text,
    valid_to: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: { type: ['station_type_id'] } },
);

const packages = new Table(
  {
    org_id: column.text,
    station_type_id: column.text,
    name: column.text,
    minutes: column.integer,
    price: column.integer,
    is_active: column.integer,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: { type: ['station_type_id'] } },
);

/** Times are ISO timestamps. A segment with no ended_at is still running. */
const sessions = new Table(
  {
    org_id: column.text,
    branch_id: column.text,
    station_id: column.text,
    kind: column.text,
    status: column.text,
    package_id: column.text,
    scheduled_start: column.text,
    scheduled_end: column.text,
    actual_start: column.text,
    actual_end: column.text,
    note: column.text,
    created_by: column.text,
    ended_by: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: { branch_status: ['branch_id', 'status'], station: ['station_id'] } },
);

const session_segments = new Table(
  {
    org_id: column.text,
    branch_id: column.text,
    session_id: column.text,
    station_id: column.text,
    station_type_id: column.text,
    players: column.integer,
    started_at: column.text,
    ended_at: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: { session: ['session_id'], branch: ['branch_id'] } },
);

/**
 * One bill per completed session (id = session id). Amounts are piasters. The server
 * calculates time_amount and keeps total / paid_amount / status up to date; on the device,
 * derive the total and what was paid from the columns and the local payments instead
 * (see src/domain/billing.ts), so offline changes show at once. details is JSON text.
 */
const bills = new Table(
  {
    org_id: column.text,
    branch_id: column.text,
    session_id: column.text,
    number: column.integer,
    time_amount: column.integer,
    items_amount: column.integer,
    discount_amount: column.integer,
    total: column.integer,
    paid_amount: column.integer,
    status: column.text,
    details: column.text,
    discount_reason: column.text,
    discount_by: column.text,
    void_reason: column.text,
    voided_by: column.text,
    voided_at: column.text,
    closed_by: column.text,
    closed_at: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: { branch_status: ['branch_id', 'status'] } },
);

/** Money received (kind 'payment') or given back ('refund'). Never updated or deleted. */
const payments = new Table(
  {
    org_id: column.text,
    branch_id: column.text,
    bill_id: column.text,
    kind: column.text,
    method: column.text,
    amount: column.integer,
    reference: column.text,
    reason: column.text,
    received_by: column.text,
    paid_at: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: { bill: ['bill_id'], branch_paid: ['branch_id', 'paid_at'] } },
);

export const AppSchema = new Schema({
  organizations,
  branches,
  memberships,
  member_branches,
  invitations,
  station_types,
  stations,
  rate_rules,
  packages,
  sessions,
  session_segments,
  bills,
  payments,
});

export type Database = (typeof AppSchema)['types'];
type Row<T> = T & { id: string };
export type OrganizationRow = Row<Database['organizations']>;
export type BranchRow = Row<Database['branches']>;
export type MembershipRow = Row<Database['memberships']>;
export type MemberBranchRow = Row<Database['member_branches']>;
export type InvitationRow = Row<Database['invitations']>;
export type StationTypeRow = Row<Database['station_types']>;
export type StationRow = Row<Database['stations']>;
export type RateRuleRow = Row<Database['rate_rules']>;
export type PackageRow = Row<Database['packages']>;
export type SessionRow = Row<Database['sessions']>;
export type SessionSegmentRow = Row<Database['session_segments']>;
export type BillRow = Row<Database['bills']>;
export type PaymentRow = Row<Database['payments']>;
