import { useQuery } from '@powersync/react';

import type { CustomerRow } from '@/lib/powersync/schema';

export function useCustomers(orgId: string | null | undefined): CustomerRow[] {
  return useQuery<CustomerRow>(
    'SELECT * FROM customers WHERE org_id = ? ORDER BY is_active DESC, name',
    [orgId ?? null],
  ).data;
}

export function useCustomer(id: string | null | undefined): CustomerRow | undefined {
  return useQuery<CustomerRow>('SELECT * FROM customers WHERE id = ?', [id ?? null]).data[0];
}

/** One visit (session or reservation) of a customer, with what the bill came to. */
export type VisitRow = {
  id: string;
  kind: string | null;
  status: string | null;
  scheduled_start: string | null;
  actual_start: string | null;
  actual_end: string | null;
  station_name: string | null;
  bill_id: string | null;
  bill_status: string | null;
  /** Time + items - discount, from the local rows (as at checkout). Null without a bill. */
  total: number | null;
};

/** The customer's visits this device knows about (the branches the user works in), newest first. */
export function useCustomerVisits(customerId: string | null | undefined): VisitRow[] {
  return useQuery<VisitRow>(
    `SELECT x.id, x.kind, x.status, x.scheduled_start, x.actual_start, x.actual_end,
            s.name AS station_name, b.id AS bill_id, b.status AS bill_status,
            CASE WHEN b.id IS NULL THEN NULL ELSE
              COALESCE(b.time_amount, 0) - COALESCE(b.discount_amount, 0)
              + COALESCE((SELECT SUM(i.quantity * i.unit_price) FROM session_items i
                           WHERE i.session_id = x.id), 0)
            END AS total
       FROM sessions x
       LEFT JOIN stations s ON s.id = x.station_id
       LEFT JOIN bills b ON b.id = x.id
      WHERE x.customer_id = ?
      ORDER BY COALESCE(x.actual_start, x.scheduled_start) DESC
      LIMIT 100`,
    [customerId ?? null],
  ).data;
}
