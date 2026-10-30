import { useQuery } from '@powersync/react';

import {
  amountDue,
  billFromDetails,
  billStatus,
  billTotal,
  netPaid,
  overpaid,
  parseBillDetails,
  type BillDetails,
  type BillStatus,
} from '@/domain/billing';
import type { Bill } from '@/domain/pricing';
import type { BillRow, PaymentRow } from '@/lib/powersync/schema';

export function useBill(id: string | null | undefined) {
  const { data, isLoading } = useQuery<BillRow>('SELECT * FROM bills WHERE id = ?', [id ?? null]);
  return { bill: data[0] as BillRow | undefined, isLoading };
}

export type PaymentWithPerson = PaymentRow & { person: string | null };

export function usePayments(billId: string | null | undefined): PaymentWithPerson[] {
  return useQuery<PaymentWithPerson>(
    `SELECT p.*, COALESCE(m.display_name, m.email) AS person
       FROM payments p
       LEFT JOIN memberships m ON m.user_id = p.received_by AND m.org_id = p.org_id
      WHERE p.bill_id = ?
      ORDER BY p.paid_at, p.created_at`,
    [billId ?? null],
  ).data;
}

/** Everything the checkout screen needs to know about the money, worked out on the device. */
export type BillSummary = {
  details: BillDetails | null;
  /** For BillBreakdown; null if the bill has no priced lines yet. */
  breakdown: Bill | null;
  subtotal: number;
  discount: number;
  total: number;
  paid: number;
  due: number;
  overpaid: number;
  status: BillStatus;
};

/**
 * Totals from the bill row and the local payments (not bills.total / paid_amount / status,
 * which only change when the server has seen the latest payments).
 */
export function summarizeBill(bill: BillRow, payments: readonly PaymentRow[]): BillSummary {
  const amounts = {
    timeAmount: bill.time_amount ?? 0,
    itemsAmount: bill.items_amount ?? 0,
    discountAmount: bill.discount_amount ?? 0,
  };
  const details = parseBillDetails(bill.details);
  const total = billTotal(amounts);
  const paid = netPaid(payments);
  return {
    details,
    breakdown: details ? billFromDetails(details, amounts) : null,
    subtotal: amounts.timeAmount + amounts.itemsAmount,
    discount: amounts.discountAmount,
    total,
    paid,
    due: amountDue(total, paid),
    overpaid: overpaid(total, paid),
    status: billStatus(total, paid, bill.status === 'void'),
  };
}

/** A completed session still waiting for payment (no bill yet, or not fully paid). */
export type UnpaidRow = {
  session_id: string;
  actual_end: string | null;
  station_name: string | null;
  bill_id: string | null;
  number: number | null;
  total: number | null;
  paid: number;
};

export function useUnpaid(branchId: string | null | undefined): UnpaidRow[] {
  return useQuery<UnpaidRow>(
    `SELECT * FROM (
       SELECT x.id AS session_id, x.actual_end, s.name AS station_name, b.id AS bill_id,
              b.number,
              b.time_amount + COALESCE(b.items_amount, 0) - COALESCE(b.discount_amount, 0) AS total,
              COALESCE((SELECT SUM(CASE WHEN p.kind = 'refund' THEN -p.amount ELSE p.amount END)
                          FROM payments p WHERE p.bill_id = b.id), 0) AS paid
         FROM sessions x
         LEFT JOIN bills b ON b.id = x.id
         LEFT JOIN stations s ON s.id = x.station_id
        WHERE x.branch_id = ? AND x.status = 'completed'
          AND (b.id IS NULL OR b.status IS NOT 'void')
     )
     WHERE bill_id IS NULL OR total > paid
     ORDER BY actual_end DESC`,
    [branchId ?? null],
  ).data;
}
