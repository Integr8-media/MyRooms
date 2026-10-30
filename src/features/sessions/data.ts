import { useQuery } from '@powersync/react';
import { useEffect, useState } from 'react';

import { segmentFromRow } from '@/domain/billing';
import { priceSession, type Bill, type HourPackage, type RateRule } from '@/domain/pricing';
import { parseTimestamp, toPricingSegments, type SessionTiming } from '@/domain/sessions';
import { toPackage, toRateRule } from '@/features/pricing/data';
import type {
  PackageRow,
  RateRuleRow,
  SessionRow,
  SessionSegmentRow,
} from '@/lib/powersync/schema';

/** The current time, updated every `intervalMs` (timers on the floor and session sheet). */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** One row per station in the branch, with its running session (if any). */
export type FloorRow = {
  id: string;
  name: string | null;
  status: string | null;
  sort_order: number | null;
  type_id: string;
  type_name: string | null;
  type_color: string | null;
  type_kind: string | null;
  max_players: number | null;
  session_id: string | null;
  session_kind: string | null;
  actual_start: string | null;
  scheduled_end: string | null;
  package_id: string | null;
  note: string | null;
};

export function useFloor(branchId: string | null | undefined): FloorRow[] {
  const { data } = useQuery<FloorRow>(
    `SELECT s.id, s.name, s.status, s.sort_order, t.id AS type_id, t.name AS type_name,
            t.color AS type_color, t.kind AS type_kind, t.max_players,
            x.id AS session_id, x.kind AS session_kind, x.actual_start, x.scheduled_end,
            x.package_id, x.note
       FROM stations s
       JOIN station_types t ON t.id = s.station_type_id
       LEFT JOIN sessions x ON x.station_id = s.id AND x.status = 'active'
      WHERE s.branch_id = ? AND s.is_active = 1
      ORDER BY t.sort_order, t.name, s.sort_order, s.name, x.actual_start`,
    [branchId ?? null],
  );
  // Two devices may have started the same station offline; show the first until sync settles it.
  const seen = new Set<string>();
  return data.filter((row) => !seen.has(row.id) && seen.add(row.id));
}

/** Segments of every running session in the branch. */
export function useActiveSegments(branchId: string | null | undefined): SessionSegmentRow[] {
  return useQuery<SessionSegmentRow>(
    `SELECT g.* FROM session_segments g JOIN sessions x ON x.id = g.session_id
      WHERE x.branch_id = ? AND x.status = 'active'
      ORDER BY g.started_at`,
    [branchId ?? null],
  ).data;
}

/** Every rate rule and package of the organization, ready for the pricing module. */
export function useOrgPricing(orgId: string | null | undefined) {
  const { data: ruleRows } = useQuery<RateRuleRow>('SELECT * FROM rate_rules WHERE org_id = ?', [
    orgId ?? null,
  ]);
  const { data: packageRows } = useQuery<PackageRow>('SELECT * FROM packages WHERE org_id = ?', [
    orgId ?? null,
  ]);
  return {
    rules: ruleRows.map(toRateRule),
    packages: new Map(packageRows.map((row) => [row.id, toPackage(row)])),
  };
}

export function useSession(id: string | null | undefined) {
  const { data, isLoading } = useQuery<SessionRow>('SELECT * FROM sessions WHERE id = ?', [
    id ?? null,
  ]);
  return { session: data[0] as SessionRow | undefined, isLoading };
}

export type SegmentWithStation = SessionSegmentRow & {
  station_name: string | null;
  type_name: string | null;
};

export function useSessionSegments(sessionId: string | null | undefined): SegmentWithStation[] {
  return useQuery<SegmentWithStation>(
    `SELECT g.*, s.name AS station_name, t.name AS type_name
       FROM session_segments g
       LEFT JOIN stations s ON s.id = g.station_id
       LEFT JOIN station_types t ON t.id = g.station_type_id
      WHERE g.session_id = ?
      ORDER BY g.started_at`,
    [sessionId ?? null],
  ).data;
}

export function sessionTiming(row: {
  actual_start: string | null;
  scheduled_end: string | null;
}): SessionTiming | null {
  const start = parseTimestamp(row.actual_start);
  if (start == null) return null;
  return { start, scheduledEnd: parseTimestamp(row.scheduled_end) };
}

/**
 * Live estimate of what the session costs so far (the final bill is made by the server at
 * checkout). Returns null if the segments can't be read.
 */
export function estimateSession(
  segments: readonly SessionSegmentRow[],
  rules: RateRule[],
  pkg: HourPackage | null,
  timeZone: string,
  now: number,
): Bill | null {
  const records = [];
  for (const g of segments) {
    const record = segmentFromRow(g);
    if (!record) return null;
    records.push(record);
  }
  if (!records.length) return null;
  try {
    return priceSession({
      segments: toPricingSegments(records, now),
      rules,
      timeZone,
      package: pkg,
    });
  } catch {
    return null;
  }
}
