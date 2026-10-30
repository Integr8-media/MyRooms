import { ALL_DAYS, type StarterType } from '@/domain/setup';
import { powersync } from '@/lib/powersync/database';

/**
 * Quick setup: station types, a base hourly price each (all days, all hours, priority 0) and
 * numbered stations in the current branch, in one local transaction. PowerSync uploads it;
 * only owners pass the server's checks (the screen is owners only).
 */
export async function runQuickSetup(orgId: string, branchId: string, types: StarterType[]) {
  const now = new Date().toISOString();
  await powersync.writeTransaction(async (tx) => {
    let { typeOrder } = await tx.get<{ typeOrder: number }>(
      'SELECT COALESCE(MAX(sort_order), 0) + 1 AS typeOrder FROM station_types WHERE org_id = ?',
      [orgId],
    );
    let { stationOrder } = await tx.get<{ stationOrder: number }>(
      'SELECT COALESCE(MAX(sort_order), 0) + 1 AS stationOrder FROM stations WHERE branch_id = ?',
      [branchId],
    );
    for (const type of types) {
      // PowerSync tables are views (no INSERT … RETURNING): make the id first.
      const { id } = await tx.get<{ id: string }>('SELECT uuid() AS id');
      await tx.execute(
        `INSERT INTO station_types (id, org_id, kind, name, color, max_players, sort_order,
           is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        [id, orgId, type.kind, type.name, type.color, type.maxPlayers, typeOrder++, now, now],
      );
      await tx.execute(
        `INSERT INTO rate_rules (id, org_id, station_type_id, name, price_per_hour, players_min,
           players_max, days_of_week, from_minute, to_minute, priority, valid_from, valid_to,
           created_at, updated_at)
         VALUES (uuid(), ?, ?, NULL, ?, NULL, NULL, ?, NULL, NULL, 0, NULL, NULL, ?, ?)`,
        [orgId, id, type.pricePerHour, ALL_DAYS, now, now],
      );
      for (const name of type.stationNames) {
        await tx.execute(
          `INSERT INTO stations (id, org_id, branch_id, station_type_id, name, status, notes,
             sort_order, is_active, created_at, updated_at)
           VALUES (uuid(), ?, ?, ?, ?, 'active', NULL, ?, 1, ?, ?)`,
          [orgId, branchId, id, name, stationOrder++, now, now],
        );
      }
    }
  });
}
