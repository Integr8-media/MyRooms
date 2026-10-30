import { powersync } from '@/lib/powersync/database';

/** Local writes; PowerSync uploads them when online. */

export type StationInput = { name: string; stationTypeId: string; notes: string | null };

/** Names for adding several stations at once: "PC" × 3 -> "PC 1", "PC 2", "PC 3". */
export function stationNames(name: string, count: number, firstNumber = 1): string[] {
  if (count <= 1) return [name];
  return Array.from({ length: count }, (_, i) => `${name} ${firstNumber + i}`);
}

export async function createStations(
  orgId: string,
  branchId: string,
  values: StationInput,
  count: number,
) {
  const now = new Date().toISOString();
  await powersync.writeTransaction(async (tx) => {
    const { next } = await tx.get<{ next: number }>(
      'SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM stations WHERE branch_id = ?',
      [branchId],
    );
    let order = next;
    for (const name of stationNames(values.name, count)) {
      await tx.execute(
        `INSERT INTO stations (id, org_id, branch_id, station_type_id, name, status, notes,
           sort_order, is_active, created_at, updated_at)
         VALUES (uuid(), ?, ?, ?, ?, 'active', ?, ?, 1, ?, ?)`,
        [orgId, branchId, values.stationTypeId, name, values.notes, order++, now, now],
      );
    }
  });
}

export async function updateStation(id: string, values: StationInput) {
  await powersync.execute(
    'UPDATE stations SET name = ?, station_type_id = ?, notes = ? WHERE id = ?',
    [values.name, values.stationTypeId, values.notes, id],
  );
}

/** Out of service: can't be started or booked. */
export async function setStationMaintenance(id: string, maintenance: boolean) {
  await powersync.execute('UPDATE stations SET status = ? WHERE id = ?', [
    maintenance ? 'maintenance' : 'active',
    id,
  ]);
}

/** Removed stations are hidden, never deleted (sessions will point at them). */
export async function setStationActive(id: string, active: boolean) {
  await powersync.execute('UPDATE stations SET is_active = ? WHERE id = ?', [active ? 1 : 0, id]);
}
