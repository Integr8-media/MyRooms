import { useQuery } from '@powersync/react';

import type { ExpenseLike } from '@/domain/expenses';
import type { ItemSale, StationInfo, UsageInterval } from '@/domain/reports';
import { parseTimestamp } from '@/domain/sessions';

/**
 * Report data, read from what this device has synced (owners: every branch; managers: their
 * branches). Timestamps are text in two formats (see utcDateWindow): SQL only pre-filters by
 * UTC date, the exact range check is done in src/domain/reports.ts.
 */

/** Expenses between two local dates (inclusive). Owners and managers only sync them. */
export function useReportExpenses(
  orgId: string | null | undefined,
  fromDate: string,
  toDate: string,
): ExpenseLike[] {
  return useQuery<ExpenseLike>(
    `SELECT branch_id, category, amount, method, spent_on FROM expenses
      WHERE org_id = ? AND substr(spent_on, 1, 10) BETWEEN ? AND ?`,
    [orgId ?? null, fromDate, toDate],
  ).data;
}

type SegmentRow = {
  station_id: string | null;
  branch_id: string | null;
  started_at: string | null;
  ended_at: string | null;
};

/**
 * Time stations were in use: segments of running and completed sessions that overlap the
 * UTC dates (cancelled sessions were never billed and don't count).
 */
export function useUsageIntervals(
  orgId: string | null | undefined,
  window: [string, string],
): UsageInterval[] {
  const { data } = useQuery<SegmentRow>(
    `SELECT g.station_id, g.branch_id, g.started_at, g.ended_at
       FROM session_segments g
       JOIN sessions x ON x.id = g.session_id
      WHERE g.org_id = ? AND x.status IN ('active', 'completed')
        AND substr(g.started_at, 1, 10) <= ?
        AND (g.ended_at IS NULL OR substr(g.ended_at, 1, 10) >= ?)`,
    [orgId ?? null, window[1], window[0]],
  );
  return data.map((r) => ({
    stationId: r.station_id ?? '',
    branchId: r.branch_id,
    start: parseTimestamp(r.started_at),
    end: r.ended_at == null ? null : parseTimestamp(r.ended_at),
  }));
}

type StationListRow = {
  id: string;
  name: string | null;
  branch_id: string | null;
  station_type_id: string | null;
  is_active: number | null;
  created_at: string | null;
};

export type ReportStation = StationInfo & { name: string };

/** Every station of the organization this device knows about (removed ones included). */
export function useReportStations(orgId: string | null | undefined): ReportStation[] {
  const { data } = useQuery<StationListRow>(
    `SELECT id, name, branch_id, station_type_id, is_active, created_at FROM stations
      WHERE org_id = ? ORDER BY sort_order, name`,
    [orgId ?? null],
  );
  return data.map((r) => ({
    id: r.id,
    name: r.name ?? '',
    branchId: r.branch_id,
    stationTypeId: r.station_type_id,
    isActive: r.is_active !== 0,
    createdAt: parseTimestamp(r.created_at),
  }));
}

type ItemRow = {
  product_id: string | null;
  name: string | null;
  quantity: number | null;
  unit_price: number | null;
  created_at: string | null;
  branch_id: string | null;
  session_status: string | null;
  bill_status: string | null;
};

/** Snacks and drinks added to sessions between the UTC dates. */
export function useItemSales(
  orgId: string | null | undefined,
  window: [string, string],
): ItemSale[] {
  const { data } = useQuery<ItemRow>(
    `SELECT i.product_id, i.name, i.quantity, i.unit_price, i.created_at, i.branch_id,
            x.status AS session_status, b.status AS bill_status
       FROM session_items i
       LEFT JOIN sessions x ON x.id = i.session_id
       LEFT JOIN bills b ON b.id = i.session_id
      WHERE i.org_id = ? AND substr(i.created_at, 1, 10) BETWEEN ? AND ?`,
    [orgId ?? null, window[0], window[1]],
  );
  return data.map((r) => ({
    productId: r.product_id,
    name: r.name,
    quantity: r.quantity,
    unitPrice: r.unit_price,
    soldAt: parseTimestamp(r.created_at),
    branchId: r.branch_id,
    excluded: r.session_status === 'cancelled' || r.bill_status === 'void',
  }));
}

/** Names by id for the organization's customers and products. */
export function useReportNames(orgId: string | null | undefined) {
  const customers = useQuery<{ id: string; name: string | null; phone: string | null }>(
    'SELECT id, name, phone FROM customers WHERE org_id = ?',
    [orgId ?? null],
  ).data;
  const products = useQuery<{ id: string; name: string | null }>(
    'SELECT id, name FROM products WHERE org_id = ?',
    [orgId ?? null],
  ).data;
  return {
    customers: new Map(customers.map((c) => [c.id, c])),
    products: new Map(products.map((p) => [p.id, p.name ?? ''])),
  };
}
