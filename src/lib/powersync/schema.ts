import { column, Schema, Table } from '@powersync/common';

/**
 * Local SQLite schema mirrored from Postgres (supabase/migrations). PowerSync adds `id`.
 * Types on the device: uuid/enum/timestamptz -> text (ISO), boolean -> integer (0/1),
 * jsonb and arrays -> JSON text. Money columns will be integers (piasters).
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

export const AppSchema = new Schema({
  organizations,
  branches,
  memberships,
  member_branches,
  invitations,
});

export type Database = (typeof AppSchema)['types'];
type Row<T> = T & { id: string };
export type OrganizationRow = Row<Database['organizations']>;
export type BranchRow = Row<Database['branches']>;
export type MembershipRow = Row<Database['memberships']>;
export type MemberBranchRow = Row<Database['member_branches']>;
export type InvitationRow = Row<Database['invitations']>;
