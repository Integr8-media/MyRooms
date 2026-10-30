/**
 * Income reports (Phase 5). Pure TypeScript: no React, no database.
 *
 * Income = money received (payments) minus money given back (refunds), counted on the day
 * it changed hands (paid_at) in the organization's time zone. Payments on void bills don't
 * count: a void bill is not income, whatever was taken for it.
 */
import { PAYMENT_METHODS, isPaymentMethod, type PaymentMethod } from './billing';
import type { Piasters } from './money';
import { dateKey, fromLocal, parseDateKey, toLocal } from './zoned-time';

export const INCOME_PERIODS = ['today', 'week', 'month', 'custom'] as const;
export type IncomePeriod = (typeof INCOME_PERIODS)[number];

/** Saturday: the usual first day of the week in Egypt. 0 = Sunday ... 6 = Saturday. */
export const DEFAULT_WEEK_START = 6;

/** A custom range can't be longer than this (keeps the device query small). */
export const MAX_RANGE_DAYS = 366;

/** [start, end) in UTC epoch ms, plus the local dates it covers (end date inclusive). */
export type DateRange = { start: number; end: number; fromDate: string; toDate: string };

/** Local midnight at the start of this date, and the next day's midnight. */
function dayBounds(timeZone: string, year: number, month: number, day: number) {
  return {
    start: fromLocal(timeZone, year, month, day),
    // Date.UTC rolls day + 1 over into the next month/year.
    end: fromLocal(timeZone, year, month, day + 1),
  };
}

function shiftDate(year: number, month: number, day: number, days: number) {
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** Local dates from..to (inclusive) as an instant range. Assumes from <= to. */
function rangeOf(
  timeZone: string,
  from: { year: number; month: number; day: number },
  to: { year: number; month: number; day: number },
): DateRange {
  return {
    start: dayBounds(timeZone, from.year, from.month, from.day).start,
    end: dayBounds(timeZone, to.year, to.month, to.day).end,
    fromDate: dateKey(from),
    toDate: dateKey(to),
  };
}

/** Today, this week or this month around `now`, in the org's time zone. */
export function periodRange(
  period: Exclude<IncomePeriod, 'custom'>,
  now: number,
  timeZone: string,
  weekStart: number = DEFAULT_WEEK_START,
): DateRange {
  const l = toLocal(now, timeZone);
  if (period === 'today') return rangeOf(timeZone, l, l);
  if (period === 'week') {
    const back = (l.weekday - weekStart + 7) % 7;
    const first = shiftDate(l.year, l.month, l.day, -back);
    return rangeOf(timeZone, first, shiftDate(first.year, first.month, first.day, 6));
  }
  const lastDay = new Date(Date.UTC(l.year, l.month, 0)).getUTCDate();
  return rangeOf(
    timeZone,
    { year: l.year, month: l.month, day: 1 },
    { year: l.year, month: l.month, day: lastDay },
  );
}

export type CustomRangeError = 'invalid_date' | 'end_before_start' | 'range_too_long';

/** A custom range from two "YYYY-MM-DD" inputs (both days included). */
export function customRange(
  from: string,
  to: string,
  timeZone: string,
): { range: DateRange; error: null } | { range: null; error: CustomRangeError } {
  const a = parseDateKey(from);
  const b = parseDateKey(to);
  if (!a || !b) return { range: null, error: 'invalid_date' };
  const days =
    (Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 864e5;
  if (days < 0) return { range: null, error: 'end_before_start' };
  if (days + 1 > MAX_RANGE_DAYS) return { range: null, error: 'range_too_long' };
  return { range: rangeOf(timeZone, a, b), error: null };
}

/** Number of calendar days in the range. */
export function rangeDays(range: Pick<DateRange, 'fromDate' | 'toDate'>): number {
  const a = parseDateKey(range.fromDate)!;
  const b = parseDateKey(range.toDate)!;
  return (Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 864e5 + 1;
}

/**
 * UTC dates ("YYYY-MM-DD") that surely contain the range, one day wider on each side.
 * The device stores paid_at as text in two formats (ISO from the app, Postgres text after
 * sync); both start with the UTC date, so this pre-filters rows in SQL. The exact check
 * is done in summarizeIncome.
 */
export function utcDateWindow(range: Pick<DateRange, 'start' | 'end'>): [string, string] {
  const day = 864e5;
  const key = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return [key(range.start - day), key(range.end + day)];
}

// ---------------------------------------------------------------------------
// Totals
// ---------------------------------------------------------------------------

/** One payment or refund, read from the local database. */
export type IncomeEntry = {
  kind: string | null | undefined;
  method: string | null | undefined;
  amount: number | null | undefined;
  /** UTC epoch ms; null if it couldn't be read (skipped). */
  paidAt: number | null;
  branchId: string | null | undefined;
  stationTypeId: string | null | undefined;
  receivedBy: string | null | undefined;
  /** The bill was voided: none of its money counts. */
  billVoided: boolean;
};

export type IncomeFilter = { branchId?: string | null; receivedBy?: string | null };

export type IncomeSummary = {
  /** Received minus refunded. */
  net: Piasters;
  received: Piasters;
  refunded: Piasters;
  payments: number;
  refunds: number;
  /** Net per method (every method is present, 0 if unused). */
  byMethod: Record<PaymentMethod, Piasters>;
  /** Net per branch id. */
  byBranch: Record<string, Piasters>;
  /** Net per station type id ('' = unknown). */
  byStationType: Record<string, Piasters>;
  /** Net per local date "YYYY-MM-DD". */
  byDay: Record<string, Piasters>;
};

export function emptySummary(): IncomeSummary {
  return {
    net: 0,
    received: 0,
    refunded: 0,
    payments: 0,
    refunds: 0,
    byMethod: Object.fromEntries(PAYMENT_METHODS.map((m) => [m, 0])) as Record<
      PaymentMethod,
      Piasters
    >,
    byBranch: {},
    byStationType: {},
    byDay: {},
  };
}

const add = (map: Record<string, Piasters>, key: string, amount: Piasters) => {
  map[key] = (map[key] ?? 0) + amount;
};

/** The entries that count for this range and filter. */
export function countedEntries(
  entries: readonly IncomeEntry[],
  range: Pick<DateRange, 'start' | 'end'>,
  filter: IncomeFilter = {},
): IncomeEntry[] {
  return entries.filter(
    (e) =>
      !e.billVoided &&
      e.paidAt != null &&
      e.paidAt >= range.start &&
      e.paidAt < range.end &&
      Number.isSafeInteger(e.amount) &&
      (e.amount ?? 0) > 0 &&
      (e.kind === 'payment' || e.kind === 'refund') &&
      isPaymentMethod(e.method) &&
      (!filter.branchId || e.branchId === filter.branchId) &&
      (!filter.receivedBy || e.receivedBy === filter.receivedBy),
  );
}

export function summarizeIncome(
  entries: readonly IncomeEntry[],
  range: Pick<DateRange, 'start' | 'end'>,
  timeZone: string,
  filter: IncomeFilter = {},
): IncomeSummary {
  const s = emptySummary();
  for (const e of countedEntries(entries, range, filter)) {
    const amount = e.amount!;
    const signed = e.kind === 'refund' ? -amount : amount;
    if (e.kind === 'refund') {
      s.refunded += amount;
      s.refunds += 1;
    } else {
      s.received += amount;
      s.payments += 1;
    }
    s.net += signed;
    s.byMethod[e.method as PaymentMethod] += signed;
    add(s.byBranch, e.branchId ?? '', signed);
    add(s.byStationType, e.stationTypeId ?? '', signed);
    add(s.byDay, dateKey(toLocal(e.paidAt!, timeZone)), signed);
  }
  return s;
}

/** Map entries sorted by amount, largest first (ties by key, so the order is stable). */
export function ranked(map: Record<string, Piasters>): [string, Piasters][] {
  return Object.entries(map).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** Share of `part` in `total` as a whole percent (0 when the total isn't positive). */
export function share(part: Piasters, total: Piasters): number {
  return total > 0 ? Math.round((Math.max(0, part) * 100) / total) : 0;
}

/** Every local date in the range, oldest first. */
export function datesInRange(range: Pick<DateRange, 'fromDate' | 'toDate'>): string[] {
  const a = parseDateKey(range.fromDate)!;
  return Array.from({ length: rangeDays(range) }, (_, i) =>
    dateKey(shiftDate(a.year, a.month, a.day, i)),
  );
}
