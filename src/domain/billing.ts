/**
 * Bills and payments (Phase 4). Pure TypeScript with relative imports only: the
 * create-bill Edge Function runs this same file (copied by scripts/sync-domain.mjs) to
 * calculate the final bill on the server, and the app uses it for the offline estimate.
 *
 * A bill = the session's time charge (src/domain/pricing.ts) + items − discount.
 * Payments add money, refunds take it back; a bill can be split across payment methods.
 */
import type { Piasters } from './money';
import { priceSession, type Bill, type HourPackage, type RateRule, type TimeLine } from './pricing';
import { parseTimestamp, toPricingSegments, type SegmentRecord } from './sessions';
import { MINUTE_MS } from './zoned-time';

export const PAYMENT_METHODS = ['cash', 'visa', 'instapay'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const BILL_STATUSES = ['open', 'partially_paid', 'paid', 'void'] as const;
export type BillStatus = (typeof BILL_STATUSES)[number];

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return PAYMENT_METHODS.includes(value as PaymentMethod);
}

// ---------------------------------------------------------------------------
// Database rows -> pricing types. Rows come from the local database (the app) or from
// PostgREST (the Edge Function); both use the Postgres column names.
// ---------------------------------------------------------------------------

type Nullable<T> = T | null | undefined;

export type RateRuleRowLike = {
  id: string;
  station_type_id?: Nullable<string>;
  name?: Nullable<string>;
  price_per_hour?: Nullable<number>;
  players_min?: Nullable<number>;
  players_max?: Nullable<number>;
  days_of_week?: Nullable<number>;
  from_minute?: Nullable<number>;
  to_minute?: Nullable<number>;
  priority?: Nullable<number>;
  valid_from?: Nullable<string>;
  valid_to?: Nullable<string>;
};

export function rateRuleFromRow(row: RateRuleRowLike): RateRule {
  return {
    id: row.id,
    stationTypeId: row.station_type_id ?? '',
    name: row.name ?? null,
    pricePerHour: row.price_per_hour ?? 0,
    playersMin: row.players_min ?? null,
    playersMax: row.players_max ?? null,
    daysOfWeek: row.days_of_week ?? 0,
    fromMinute: row.from_minute ?? null,
    toMinute: row.to_minute ?? null,
    priority: row.priority ?? 0,
    // Postgres dates arrive as "YYYY-MM-DD"; keep only the date part to be safe.
    validFrom: row.valid_from?.slice(0, 10) ?? null,
    validTo: row.valid_to?.slice(0, 10) ?? null,
  };
}

export type PackageRowLike = {
  id: string;
  name?: Nullable<string>;
  minutes?: Nullable<number>;
  price?: Nullable<number>;
};

export function packageFromRow(row: PackageRowLike): HourPackage {
  return { id: row.id, name: row.name ?? '', minutes: row.minutes ?? 0, price: row.price ?? 0 };
}

export type SegmentRowLike = {
  station_type_id?: Nullable<string>;
  players?: Nullable<number>;
  started_at?: Nullable<string>;
  ended_at?: Nullable<string>;
};

/** null if the row can't be read (no start or no station type). */
export function segmentFromRow(row: SegmentRowLike): SegmentRecord | null {
  const startedAt = parseTimestamp(row.started_at);
  if (startedAt == null || !row.station_type_id) return null;
  return {
    stationTypeId: row.station_type_id,
    players: row.players ?? 1,
    startedAt,
    endedAt: parseTimestamp(row.ended_at),
  };
}

// ---------------------------------------------------------------------------
// The final bill
// ---------------------------------------------------------------------------

/** What bills.details holds: the priced lines, for the checkout screen and the receipt. */
export type BillDetails = {
  version: 1;
  lines: TimeLine[];
  package: HourPackage | null;
  totalMinutes: number;
  /** Time no rate rule matched (charged 0). Someone should check the prices. */
  uncoveredMinutes: number;
  /** Time inside the session with no segment (not charged). Should never happen. */
  gapMinutes: number;
};

export type FinalBillInput = {
  segments: readonly SegmentRecord[];
  /** UTC epoch ms. */
  sessionStart: number;
  sessionEnd: number;
  rules: readonly RateRule[];
  package?: HourPackage | null;
  timeZone: string;
};

export type FinalBill = { timeAmount: Piasters; details: BillDetails };

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The time charge of a completed session. A segment still marked running is charged up to
 * the session's end. Throws RangeError if the segments are invalid.
 */
export function computeFinalBill(input: FinalBillInput): FinalBill {
  const segments = toPricingSegments(input.segments, input.sessionEnd).map((s) => ({
    ...s,
    // Nothing is charged after the session ended.
    end: Math.max(s.start, Math.min(s.end, input.sessionEnd)),
  }));
  const bill = priceSession({
    segments,
    rules: [...input.rules],
    timeZone: input.timeZone,
    package: input.package ?? null,
  });
  const played = segments.reduce((sum, s) => sum + (s.end - s.start), 0);
  const length = Math.max(0, input.sessionEnd - input.sessionStart);
  return {
    timeAmount: bill.timeAmount,
    details: {
      version: 1,
      lines: bill.lines,
      package: bill.package,
      totalMinutes: round2(bill.totalMinutes),
      uncoveredMinutes: round2(bill.uncovered.reduce((sum, l) => sum + l.minutes, 0)),
      gapMinutes: round2(Math.max(0, length - played) / MINUTE_MS),
    },
  };
}

/** bills.details from the database (JSON text on the device, an object from PostgREST). */
export function parseBillDetails(value: unknown): BillDetails | null {
  let data = value;
  if (typeof value === 'string') {
    try {
      data = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== 'object') return null;
  const d = data as Partial<BillDetails>;
  if (!Array.isArray(d.lines)) return null;
  return {
    version: 1,
    lines: d.lines,
    package: d.package ?? null,
    totalMinutes: Number(d.totalMinutes) || 0,
    uncoveredMinutes: Number(d.uncoveredMinutes) || 0,
    gapMinutes: Number(d.gapMinutes) || 0,
  };
}

export type BillAmounts = {
  timeAmount: Piasters;
  itemsAmount: Piasters;
  discountAmount: Piasters;
};

export function billTotal(a: BillAmounts): Piasters {
  return a.timeAmount + a.itemsAmount - a.discountAmount;
}

/** The saved details and amounts as a pricing Bill (what BillBreakdown shows). */
export function billFromDetails(details: BillDetails, amounts: BillAmounts): Bill {
  return {
    lines: details.lines,
    package: details.package,
    totalMinutes: details.totalMinutes,
    timeAmount: amounts.timeAmount,
    itemsAmount: amounts.itemsAmount,
    discountAmount: amounts.discountAmount,
    total: billTotal(amounts),
    uncovered: details.lines.filter((l) => !l.coveredByPackage && l.ruleId === null),
  };
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export type PaymentLike = { kind: Nullable<string>; amount: Nullable<number> };

/** Payments minus refunds. */
export function netPaid(payments: readonly PaymentLike[]): Piasters {
  return payments.reduce(
    (sum, p) => sum + (p.kind === 'refund' ? -(p.amount ?? 0) : (p.amount ?? 0)),
    0,
  );
}

/** Same rule as private.check_bill() in the Phase 4 migration. */
export function billStatus(total: Piasters, paid: Piasters, voided: boolean): BillStatus {
  if (voided) return 'void';
  if (paid >= total) return 'paid';
  return paid > 0 ? 'partially_paid' : 'open';
}

/** Still to pay (never negative). */
export function amountDue(total: Piasters, paid: Piasters): Piasters {
  return Math.max(0, total - paid);
}

/** Paid more than the total (to give back). */
export function overpaid(total: Piasters, paid: Piasters): Piasters {
  return Math.max(0, paid - total);
}

/** Change to give for cash: what the customer handed over minus what is paid now. */
export function changeDue(tendered: Piasters, amount: Piasters): Piasters {
  return Math.max(0, tendered - amount);
}

/** The discount for `percent` of the subtotal, rounded to the piaster. */
export function percentDiscount(subtotal: Piasters, percent: number): Piasters {
  const p = Math.min(100, Math.max(0, percent));
  return Math.min(subtotal, Math.round((subtotal * p) / 100));
}

export type MoneyError = 'invalid_amount' | 'reason_required' | 'invalid_discount';

/** A payment: more than 0 and no more than what is still due. */
export function paymentError(amount: Piasters, due: Piasters): MoneyError | null {
  return Number.isSafeInteger(amount) && amount > 0 && amount <= due ? null : 'invalid_amount';
}

/** A refund: more than 0, no more than what was paid, and with a reason. */
export function refundError(amount: Piasters, paid: Piasters, reason: string): MoneyError | null {
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > paid) return 'invalid_amount';
  return reason.trim() ? null : 'reason_required';
}

/** A discount: between 0 and the subtotal. */
export function discountError(amount: Piasters, subtotal: Piasters): MoneyError | null {
  return Number.isSafeInteger(amount) && amount >= 0 && amount <= subtotal
    ? null
    : 'invalid_discount';
}
