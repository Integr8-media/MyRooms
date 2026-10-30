import type { StationKind } from '@/domain/validation';
import { powersync } from '@/lib/powersync/database';

/** Local writes; PowerSync uploads them when online. Only owners pass the server's checks. */

export type StationTypeInput = {
  name: string;
  kind: StationKind;
  maxPlayers: number;
  color: string | null;
};

export async function createStationType(orgId: string, values: StationTypeInput): Promise<string> {
  const now = new Date().toISOString();
  // PowerSync tables are views, so INSERT ... RETURNING isn't available: make the id first.
  const { id } = await powersync.get<{ id: string }>('SELECT uuid() AS id');
  await powersync.execute(
    `INSERT INTO station_types (id, org_id, kind, name, color, max_players, sort_order, is_active,
       created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?,
       (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM station_types WHERE org_id = ?), 1, ?, ?)`,
    [id, orgId, values.kind, values.name, values.color, values.maxPlayers, orgId, now, now],
  );
  return id;
}

export async function updateStationType(id: string, values: StationTypeInput) {
  await powersync.execute(
    'UPDATE station_types SET name = ?, kind = ?, color = ?, max_players = ? WHERE id = ?',
    [values.name, values.kind, values.color, values.maxPlayers, id],
  );
}

/** Station types are switched off, never deleted (stations and sessions point at them). */
export async function setStationTypeActive(id: string, active: boolean) {
  await powersync.execute('UPDATE station_types SET is_active = ? WHERE id = ?', [
    active ? 1 : 0,
    id,
  ]);
}

export type RateRuleInput = {
  name: string | null;
  pricePerHour: number;
  playersMin: number | null;
  playersMax: number | null;
  daysOfWeek: number;
  fromMinute: number | null;
  toMinute: number | null;
  priority: number;
  validFrom: string | null;
  validTo: string | null;
};

const ruleValues = (v: RateRuleInput) => [
  v.name,
  v.pricePerHour,
  v.playersMin,
  v.playersMax,
  v.daysOfWeek,
  v.fromMinute,
  v.toMinute,
  v.priority,
  v.validFrom,
  v.validTo,
];

export async function createRateRule(orgId: string, stationTypeId: string, values: RateRuleInput) {
  const now = new Date().toISOString();
  await powersync.execute(
    `INSERT INTO rate_rules (id, org_id, station_type_id, name, price_per_hour, players_min,
       players_max, days_of_week, from_minute, to_minute, priority, valid_from, valid_to,
       created_at, updated_at)
     VALUES (uuid(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [orgId, stationTypeId, ...ruleValues(values), now, now],
  );
}

export async function updateRateRule(id: string, values: RateRuleInput) {
  await powersync.execute(
    `UPDATE rate_rules SET name = ?, price_per_hour = ?, players_min = ?, players_max = ?,
       days_of_week = ?, from_minute = ?, to_minute = ?, priority = ?, valid_from = ?, valid_to = ?
     WHERE id = ?`,
    [...ruleValues(values), id],
  );
}

/** Rules can be deleted: bills keep their own amounts, and the audit log keeps the history. */
export async function deleteRateRule(id: string) {
  await powersync.execute('DELETE FROM rate_rules WHERE id = ?', [id]);
}

export type PackageInput = { name: string; minutes: number; price: number };

export async function createPackage(orgId: string, stationTypeId: string, values: PackageInput) {
  const now = new Date().toISOString();
  await powersync.execute(
    `INSERT INTO packages (id, org_id, station_type_id, name, minutes, price, is_active,
       created_at, updated_at)
     VALUES (uuid(), ?, ?, ?, ?, ?, 1, ?, ?)`,
    [orgId, stationTypeId, values.name, values.minutes, values.price, now, now],
  );
}

export async function updatePackage(id: string, values: PackageInput) {
  await powersync.execute('UPDATE packages SET name = ?, minutes = ?, price = ? WHERE id = ?', [
    values.name,
    values.minutes,
    values.price,
    id,
  ]);
}

/** Packages are switched off, never deleted (sessions will point at them). */
export async function setPackageActive(id: string, active: boolean) {
  await powersync.execute('UPDATE packages SET is_active = ? WHERE id = ?', [active ? 1 : 0, id]);
}
