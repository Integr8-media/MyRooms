import type { Transaction } from '@powersync/common';

import {
  amountDue,
  billTotal,
  computeFinalBill,
  discountError,
  netPaid,
  packageFromRow,
  paymentError,
  rateRuleFromRow,
  refundError,
  segmentFromRow,
  type FinalBill,
  type PaymentMethod,
} from '@/domain/billing';
import type { Piasters } from '@/domain/money';
import { parseTimestamp } from '@/domain/sessions';
import { powersync } from '@/lib/powersync/database';
import type {
  PackageRow,
  RateRuleRow,
  SessionRow,
  SessionSegmentRow,
} from '@/lib/powersync/schema';

/**
 * Checkout writes go to the local database first, so payments are taken offline too.
 * The server checks the same rules (supabase/migrations, phase 4) and calculates the final
 * time charge itself: the local bill row is an estimate until it syncs (see the create-bill
 * Edge Function and src/lib/powersync/connector.ts).
 *
 * Only columns clients may write are ever updated (total, paid_amount and status are kept
 * by the server; the app derives them, see src/domain/billing.ts).
 */

class CheckoutError extends Error {}
const fail = (key: string): never => {
  throw new CheckoutError(key);
};

const iso = (ms: number) => new Date(ms).toISOString();

/** Price a completed session from the local database (same code the server runs). */
async function priceLocally(tx: Transaction, session: SessionRow): Promise<FinalBill | null> {
  const start = parseTimestamp(session.actual_start);
  const end = parseTimestamp(session.actual_end);
  if (start == null || end == null) return null;
  const segmentRows = await tx.getAll<SessionSegmentRow>(
    'SELECT * FROM session_segments WHERE session_id = ? ORDER BY started_at',
    [session.id],
  );
  const segments = segmentRows.map(segmentFromRow);
  if (segments.some((s) => s == null)) return null;
  const rules = await tx.getAll<RateRuleRow>('SELECT * FROM rate_rules WHERE org_id = ?', [
    session.org_id,
  ]);
  const pkg = session.package_id
    ? await tx.getOptional<PackageRow>('SELECT * FROM packages WHERE id = ?', [session.package_id])
    : null;
  const org = await tx.getOptional<{ timezone: string | null }>(
    'SELECT timezone FROM organizations WHERE id = ?',
    [session.org_id],
  );
  try {
    return computeFinalBill({
      segments: segments.filter((s) => s != null),
      sessionStart: start,
      sessionEnd: end,
      rules: rules.map(rateRuleFromRow),
      package: pkg ? packageFromRow(pkg) : null,
      timeZone: org?.timezone ?? 'Africa/Cairo',
    });
  } catch {
    return null;
  }
}

/**
 * Create the bill of a completed session inside `tx` (the bill id is the session id).
 * Does nothing if it already exists.
 */
export async function insertBill(tx: Transaction, sessionId: string, now = Date.now()) {
  const session = await tx.getOptional<SessionRow>('SELECT * FROM sessions WHERE id = ?', [
    sessionId,
  ]);
  if (!session) return fail('invalid_session');
  if (session.status !== 'completed') return fail('session_not_ended');
  if (await tx.getOptional('SELECT id FROM bills WHERE id = ?', [sessionId])) return;

  // If the session can't be priced here, the bill shows 0 until the server prices it.
  const priced = await priceLocally(tx, session);
  const timeAmount = priced?.timeAmount ?? 0;
  await tx.execute(
    `INSERT INTO bills (id, org_id, branch_id, session_id, number, time_amount, items_amount,
       discount_amount, total, paid_amount, status, details, closed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, NULL, ?, 0, 0, ?, 0, 'open', ?, ?, ?, ?)`,
    [
      sessionId,
      session.org_id,
      session.branch_id,
      sessionId,
      timeAmount,
      timeAmount,
      priced ? JSON.stringify(priced.details) : null,
      session.actual_end ?? iso(now),
      iso(now),
      iso(now),
    ],
  );
}

/** Make the bill of a session that ended without one (e.g. before Phase 4). */
export async function createBill(sessionId: string) {
  await powersync.writeTransaction((tx) => insertBill(tx, sessionId));
}

type BillState = {
  id: string;
  time_amount: number | null;
  items_amount: number | null;
  discount_amount: number | null;
  status: string | null;
};

/** The bill, what it comes to and what was paid so far (from the local payments). */
async function billState(tx: Transaction, billId: string) {
  const bill = await tx.getOptional<BillState>(
    'SELECT id, time_amount, items_amount, discount_amount, status FROM bills WHERE id = ?',
    [billId],
  );
  if (!bill) return fail('invalid_bill');
  if (bill.status === 'void') fail('bill_void');
  const payments = await tx.getAll<{ kind: string; amount: number }>(
    'SELECT kind, amount FROM payments WHERE bill_id = ?',
    [billId],
  );
  const amounts = {
    timeAmount: bill.time_amount ?? 0,
    itemsAmount: bill.items_amount ?? 0,
    discountAmount: bill.discount_amount ?? 0,
  };
  return {
    bill,
    subtotal: amounts.timeAmount + amounts.itemsAmount,
    total: billTotal(amounts),
    paid: netPaid(payments),
  };
}

/** Owners and managers, before any payment (checked by the server too). 0 removes it. */
export async function applyDiscount(billId: string, amount: Piasters, reason: string) {
  await powersync.writeTransaction(async (tx) => {
    const { subtotal, paid } = await billState(tx, billId);
    if (paid !== 0) fail('bill_has_payments');
    const error = discountError(amount, subtotal);
    if (error) fail(error);
    await tx.execute('UPDATE bills SET discount_amount = ?, discount_reason = ? WHERE id = ?', [
      amount,
      amount > 0 ? reason.trim() || null : null,
      billId,
    ]);
  });
}

export type PaymentInput = {
  billId: string;
  method: PaymentMethod;
  amount: Piasters;
  reference?: string | null;
};

async function insertPayment(
  tx: Transaction,
  kind: 'payment' | 'refund',
  input: PaymentInput & { reason?: string | null },
  now: number,
) {
  const { id } = await tx.get<{ id: string }>('SELECT uuid() AS id');
  const bill = await tx.get<{ org_id: string; branch_id: string }>(
    'SELECT org_id, branch_id FROM bills WHERE id = ?',
    [input.billId],
  );
  await tx.execute(
    `INSERT INTO payments (id, org_id, branch_id, bill_id, kind, method, amount, reference, reason,
       paid_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      bill.org_id,
      bill.branch_id,
      input.billId,
      kind,
      input.method,
      input.amount,
      input.reference?.trim() || null,
      input.reason?.trim() || null,
      iso(now),
      iso(now),
      iso(now),
    ],
  );
  return id;
}

/** Record money received. Several payments (by different methods) can pay one bill. */
export async function addPayment(input: PaymentInput, now = Date.now()): Promise<string> {
  return powersync.writeTransaction(async (tx) => {
    const { total, paid } = await billState(tx, input.billId);
    const error = paymentError(input.amount, amountDue(total, paid));
    if (error) fail(error);
    return insertPayment(tx, 'payment', input, now);
  });
}

/** Owners and managers: give money back, with a reason (checked by the server too). */
export async function refund(
  input: PaymentInput & { reason: string },
  now = Date.now(),
): Promise<string> {
  return powersync.writeTransaction(async (tx) => {
    const { paid } = await billState(tx, input.billId);
    const error = refundError(input.amount, paid, input.reason);
    if (error) fail(error);
    return insertPayment(tx, 'refund', input, now);
  });
}

/** Owners and managers: the bill no longer counts (with a reason). Can't be undone. */
export async function voidBill(billId: string, reason: string) {
  await powersync.writeTransaction(async (tx) => {
    await billState(tx, billId);
    if (!reason.trim()) fail('reason_required');
    await tx.execute("UPDATE bills SET status = 'void', void_reason = ? WHERE id = ?", [
      reason.trim(),
      billId,
    ]);
  });
}
