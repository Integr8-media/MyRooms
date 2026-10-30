import { useQuery } from '@powersync/react';

import type { IncomeEntry } from '@/domain/income';
import { parseTimestamp } from '@/domain/sessions';

/** A payment or refund with what the income screen needs to group it. */
export type IncomeRow = {
  id: string;
  kind: string | null;
  method: string | null;
  amount: number | null;
  paid_at: string | null;
  branch_id: string | null;
  received_by: string | null;
  bill_status: string | null;
  bill_number: number | null;
  station_name: string | null;
  station_type_id: string | null;
  bill_id?: string | null;
  customer_id?: string | null;
};

/**
 * Payments and refunds of the organization paid between two UTC dates (inclusive; see
 * utcDateWindow). Only rows synced to this device: owners get every branch, managers and
 * cashiers the branches they work in. The station type is the session's current station's.
 */
export function useIncomeRows(orgId: string | null | undefined, window: [string, string]) {
  return useQuery<IncomeRow>(
    `SELECT p.id, p.kind, p.method, p.amount, p.paid_at, p.branch_id, p.received_by,
            p.bill_id, x.customer_id, b.status AS bill_status, b.number AS bill_number,
            st.name AS station_name, st.station_type_id
       FROM payments p
       LEFT JOIN bills b ON b.id = p.bill_id
       LEFT JOIN sessions x ON x.id = p.bill_id
       LEFT JOIN stations st ON st.id = x.station_id
      WHERE p.org_id = ? AND substr(p.paid_at, 1, 10) BETWEEN ? AND ?
      ORDER BY p.paid_at DESC`,
    [orgId ?? null, window[0], window[1]],
  );
}

export function toIncomeEntry(row: IncomeRow): IncomeEntry {
  return {
    kind: row.kind,
    method: row.method,
    amount: row.amount,
    paidAt: parseTimestamp(row.paid_at),
    branchId: row.branch_id,
    stationTypeId: row.station_type_id,
    receivedBy: row.received_by,
    billVoided: row.bill_status === 'void',
    billId: row.bill_id ?? null,
    customerId: row.customer_id ?? null,
  };
}

/** Station type names of the organization, by id. */
export function useStationTypeNames(orgId: string | null | undefined): Map<string, string> {
  const { data } = useQuery<{ id: string; name: string | null }>(
    'SELECT id, name FROM station_types WHERE org_id = ?',
    [orgId ?? null],
  );
  return new Map(data.map((r) => [r.id, r.name ?? '']));
}
