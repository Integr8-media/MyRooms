import { useQuery } from '@powersync/react';

import { packageFromRow, rateRuleFromRow } from '@/domain/billing';
import type { HourPackage, RateRule } from '@/domain/pricing';
import type { PackageRow, RateRuleRow, StationTypeRow } from '@/lib/powersync/schema';

/** Local database rows -> pricing module types (shared with the server, see src/domain/billing.ts). */
export function toRateRule(row: RateRuleRow): RateRule {
  return rateRuleFromRow(row);
}

export function toPackage(row: PackageRow): HourPackage {
  return packageFromRow(row);
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
