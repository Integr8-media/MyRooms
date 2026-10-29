import { powersync } from '@/lib/powersync/database';

/** Local writes; PowerSync uploads them when online. */

export type BranchInput = { name: string; address: string | null; phone: string | null };

export async function createBranch(orgId: string, values: BranchInput) {
  const now = new Date().toISOString();
  await powersync.execute(
    `INSERT INTO branches (id, org_id, name, address, phone, is_active, created_at, updated_at)
     VALUES (uuid(), ?, ?, ?, ?, 1, ?, ?)`,
    [orgId, values.name, values.address, values.phone, now, now],
  );
}

export async function updateBranch(id: string, values: BranchInput) {
  await powersync.execute('UPDATE branches SET name = ?, address = ?, phone = ? WHERE id = ?', [
    values.name,
    values.address,
    values.phone,
    id,
  ]);
}

/** Branches are deactivated, never deleted (sessions and payments will point at them). */
export async function setBranchActive(id: string, active: boolean) {
  await powersync.execute('UPDATE branches SET is_active = ? WHERE id = ?', [active ? 1 : 0, id]);
}
