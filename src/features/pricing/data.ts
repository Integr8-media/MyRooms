import { useQuery } from '@powersync/react';

import type { HourPackage, RateRule } from '@/domain/pricing';
import type { PackageRow, RateRuleRow, StationTypeRow } from '@/lib/powersync/schema';

/** Local database rows -> pricing module types. */
export function toRateRule(row: RateRuleRow): RateRule {
  return {
    id: row.id,
    stationTypeId: row.station_type_id ?? '',
    name: row.name,
    pricePerHour: row.price_per_hour ?? 0,
    playersMin: row.players_min,
    playersMax: row.players_max,
    daysOfWeek: row.days_of_week ?? 0,
    fromMinute: row.from_minute,
    toMinute: row.to_minute,
    priority: row.priority ?? 0,
    // Postgres dates arrive as "YYYY-MM-DD"; keep only the date part to be safe.
    validFrom: row.valid_from?.slice(0, 10) ?? null,
    validTo: row.valid_to?.slice(0, 10) ?? null,
  };
}

export function toPackage(row: PackageRow): HourPackage {
  return { id: row.id, name: row.name ?? '', minutes: row.minutes ?? 0, price: row.price ?? 0 };
}

export function useStationTypes(orgId: string | null | undefined) {
  return useQuery<StationTypeRow>(
    'SELECT * FROM station_types WHERE org_id = ? ORDER BY is_active DESC, sort_order, name',
    [orgId ?? null],
  ).data;
}

export function useStationType(id: string | null | undefined) {
  return useQuery<StationTypeRow>('SELECT * FROM station_types WHERE id = ?', [id ?? null]).data[0];
}

export function useRateRules(stationTypeId: string | null | undefined) {
  return useQuery<RateRuleRow>(
    'SELECT * FROM rate_rules WHERE station_type_id = ? ORDER BY priority DESC, price_per_hour',
    [stationTypeId ?? null],
  ).data;
}

export function usePackages(stationTypeId: string | null | undefined) {
  return useQuery<PackageRow>(
    'SELECT * FROM packages WHERE station_type_id = ? ORDER BY is_active DESC, minutes',
    [stationTypeId ?? null],
  ).data;
}
