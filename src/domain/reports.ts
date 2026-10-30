/**
 * Advanced reports (Phase 8). Pure TypeScript: no React, no database.
 *
 * Builds on income.ts (money received, by paid_at) and expenses.ts (money spent, by spent_on):
 * - net profit = income - expenses, and the change against the previous period;
 * - utilization = time stations were in use / time they could have been used;
 * - busiest hours = average number of busy stations per weekday and hour;
 * - top customers (by money paid) and snack sales (by product).
 */
import { summarizeExpenses, type ExpenseLike } from './expenses';
import {
  countedEntries,
  customRange,
  rangeDays,
  type DateRange,
  type IncomeEntry,
  type IncomeFilter,
  type IncomePeriod,
} from './income';
import type { Piasters } from './money';
import { dateKey, parseDateKey, toLocal } from './zoned-time';

const HOUR_MS = 3_600_000;

// ---------------------------------------------------------------------------
// Periods and comparison
// ---------------------------------------------------------------------------

function shiftKey(key: string, days: number): string {
  const d = parseDateKey(key)!;
  const t = new Date(Date.UTC(d.year, d.month - 1, d.day + days));
  return dateKey({ year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() });
}

/**
 * The period to compare with: yesterday, last week, last month (the whole calendar month),
 * or for a custom range the same number of days just before it.
 */
export function previousRange(range: DateRange, period: IncomePeriod, timeZone: string): DateRange {
  if (period === 'month') {
    const d = parseDateKey(range.fromDate)!;
    const first = new Date(Date.UTC(d.year, d.month - 2, 1));
    const last = new Date(Date.UTC(d.year, d.month - 1, 0));
    const key = (t: Date) =>
      dateKey({ year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() });
    return customRange(key(first), key(last), timeZone).range!;
  }
  const days = rangeDays(range);
  const to = shiftKey(range.fromDate, -1);
  return customRange(shiftKey(to, -(days - 1)), to, timeZone).range!;
}

/**
 * Change from `previous` to `current` as a whole percent (+25, -10), or null when there is
 * nothing to compare with (previous is 0 or negative).
 */
export function percentChange(current: number, previous: number): number | null {
  if (!(previous > 0)) return null;
  return Math.round(((current - previous) * 100) / previous);
}

// ---------------------------------------------------------------------------
// Net profit and branches
// ---------------------------------------------------------------------------

export type ProfitSummary = { income: Piasters; expenses: Piasters; profit: Piasters };

export function netProfit(income: Piasters, expenses: Piasters): ProfitSummary {
  return { income, expenses, profit: income - expenses };
}

export type BranchFigures = ProfitSummary & {
  branchId: string;
  /** Whole percent, or null when the branch had no station time to use. */
  utilization: number | null;
};

/** One line per branch: income, expenses, profit and utilization, in the given order. */
export function compareBranches(
  branchIds: readonly string[],
  incomeByBranch: Record<string, Piasters>,
  expenseRows: readonly ExpenseLike[],
  range: Pick<DateRange, 'fromDate' | 'toDate'>,
  utilizationByBranch: Record<string, Utilization>,
): BranchFigures[] {
  return branchIds.map((branchId) => ({
    branchId,
    ...netProfit(
      incomeByBranch[branchId] ?? 0,
      summarizeExpenses(expenseRows, range, branchId).total,
    ),
    utilization: utilizationByBranch[branchId]?.pct ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Utilization and busiest hours
// ---------------------------------------------------------------------------

/** Time a station was in use (a session segment). end null = still running. */
export type UsageInterval = {
  stationId: string;
  branchId: string | null | undefined;
  /** UTC epoch ms; null if unreadable (skipped). */
  start: number | null;
  end: number | null;
};

export type StationInfo = {
  id: string;
  branchId: string | null | undefined;
  stationTypeId: string | null | undefined;
  /** Removed stations only count when they were used in the period. */
  isActive: boolean;
  /** Stations added during the period are only available from then on. */
  createdAt: number | null;
};

export type Utilization = {
  /** Milliseconds in use. */
  used: number;
  /** Milliseconds the station(s) could have been used. */
  available: number;
  /** Whole percent (0 when nothing was available). */
  pct: number;
};

export type UtilizationReport = {
  overall: Utilization;
  byStation: Record<string, Utilization>;
  byType: Record<string, Utilization>;
  byBranch: Record<string, Utilization>;
};

/** The part of the range that has already happened: [start, min(end, now)). */
export function elapsedWindow(range: Pick<DateRange, 'start' | 'end'>, now: number) {
  return { start: range.start, end: Math.max(range.start, Math.min(range.end, now)) };
}

/** Each station's usage inside the window, overlaps merged, running segments up to now. */
function usedPieces(
  intervals: readonly UsageInterval[],
  window: { start: number; end: number },
  now: number,
): Map<string, [number, number][]> {
  const byStation = new Map<string, [number, number][]>();
  for (const i of intervals) {
    if (i.start == null) continue;
    const start = Math.max(i.start, window.start);
    const end = Math.min(i.end ?? now, window.end);
    if (end <= start) continue;
    const list = byStation.get(i.stationId) ?? [];
    list.push([start, end]);
    byStation.set(i.stationId, list);
  }
  for (const [id, list] of byStation) {
    list.sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [];
    for (const piece of list) {
      const last = merged[merged.length - 1];
      if (last && piece[0] <= last[1]) last[1] = Math.max(last[1], piece[1]);
      else merged.push([piece[0], piece[1]]);
    }
    byStation.set(id, merged);
  }
  return byStation;
}

const util = (used: number, available: number): Utilization => ({
  used,
  available,
  pct: available > 0 ? Math.min(100, Math.round((used * 100) / available)) : 0,
});

/**
 * How much of the elapsed part of the range each station was in use, over the whole day
 * (24 h: opening hours are not set up yet). Totals per type and branch add up the stations.
 */
export function summarizeUtilization(
  intervals: readonly UsageInterval[],
  stations: readonly StationInfo[],
  range: Pick<DateRange, 'start' | 'end'>,
  now: number,
  filter: { branchId?: string | null } = {},
): UtilizationReport {
  const window = elapsedWindow(range, now);
  const pieces = usedPieces(intervals, window, now);
  const report: UtilizationReport = {
    overall: util(0, 0),
    byStation: {},
    byType: {},
    byBranch: {},
  };
  const addTo = (map: Record<string, Utilization>, key: string, used: number, avail: number) => {
    const u = map[key] ?? util(0, 0);
    map[key] = util(u.used + used, u.available + avail);
  };
  let used = 0;
  let available = 0;
  for (const s of stations) {
    if (filter.branchId && s.branchId !== filter.branchId) continue;
    const stationUsed = (pieces.get(s.id) ?? []).reduce((sum, [a, b]) => sum + b - a, 0);
    if (!s.isActive && stationUsed === 0) continue;
    const from = Math.max(window.start, s.createdAt ?? window.start);
    const avail = Math.max(window.end - from, stationUsed);
    if (avail <= 0) continue;
    report.byStation[s.id] = util(stationUsed, avail);
    addTo(report.byType, s.stationTypeId ?? '', stationUsed, avail);
    addTo(report.byBranch, s.branchId ?? '', stationUsed, avail);
    used += stationUsed;
    available += avail;
  }
  report.overall = util(used, available);
  return report;
}

export type Heatmap = {
  /** busy[weekday][hour]: average number of stations in use (weekday 0 = Sunday). */
  busy: number[][];
  /** The highest value in `busy` (0 when nothing was used). */
  max: number;
  /** Busiest weekday and hour, or null when nothing was used. */
  peak: { weekday: number; hour: number } | null;
};

const grid = () => Array.from({ length: 7 }, () => Array<number>(24).fill(0));

/**
 * Average number of busy stations for each weekday and local hour over the elapsed part of
 * the range. The range starts at local midnight, so stepping one hour at a time stays on
 * local hour boundaries (also across DST changes, which move whole hours).
 */
export function occupancyHeatmap(
  intervals: readonly UsageInterval[],
  range: Pick<DateRange, 'start' | 'end'>,
  now: number,
  timeZone: string,
  filter: { branchId?: string | null } = {},
): Heatmap {
  const window = elapsedWindow(range, now);
  const slots = Math.ceil((window.end - window.start) / HOUR_MS);
  const label: { weekday: number; hour: number }[] = [];
  const seen = grid();
  for (let i = 0; i < slots; i++) {
    const t = window.start + i * HOUR_MS;
    const l = toLocal(t, timeZone);
    label.push({ weekday: l.weekday, hour: l.hour });
    seen[l.weekday]![l.hour]! += (Math.min(t + HOUR_MS, window.end) - t) / HOUR_MS;
  }
  const usedMs = grid();
  const kept = intervals.filter((i) => !filter.branchId || i.branchId === filter.branchId);
  for (const list of usedPieces(kept, window, now).values()) {
    for (const [a, b] of list) {
      for (let i = Math.floor((a - window.start) / HOUR_MS); i < slots; i++) {
        const slotStart = window.start + i * HOUR_MS;
        if (slotStart >= b) break;
        const overlap = Math.min(b, slotStart + HOUR_MS) - Math.max(a, slotStart);
        const { weekday, hour } = label[i]!;
        usedMs[weekday]![hour]! += overlap;
      }
    }
  }
  const busy = grid();
  let max = 0;
  let peak: Heatmap['peak'] = null;
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      const hours = seen[d]![h]!;
      const value = hours > 0 ? usedMs[d]![h]! / (hours * HOUR_MS) : 0;
      busy[d]![h] = value;
      if (value > max) {
        max = value;
        peak = { weekday: d, hour: h };
      }
    }
  }
  return { busy, max, peak };
}

// ---------------------------------------------------------------------------
// Customers and snacks
// ---------------------------------------------------------------------------

export type CustomerTotal = {
  customerId: string;
  /** Payments minus refunds in the period. */
  net: Piasters;
  /** Bills they paid something towards in the period. */
  visits: number;
};

/** Customers who paid the most in the period (only sessions linked to a customer). */
export function topCustomers(
  entries: readonly IncomeEntry[],
  range: Pick<DateRange, 'start' | 'end'>,
  filter: IncomeFilter = {},
  limit = 10,
): CustomerTotal[] {
  const totals = new Map<string, { net: number; bills: Set<string> }>();
  for (const e of countedEntries(entries, range, filter)) {
    if (!e.customerId) continue;
    const t = totals.get(e.customerId) ?? { net: 0, bills: new Set<string>() };
    t.net += e.kind === 'refund' ? -e.amount! : e.amount!;
    if (e.kind === 'payment' && e.billId) t.bills.add(e.billId);
    totals.set(e.customerId, t);
  }
  return [...totals]
    .map(([customerId, t]) => ({ customerId, net: t.net, visits: t.bills.size }))
    .sort(
      (a, b) => b.net - a.net || b.visits - a.visits || a.customerId.localeCompare(b.customerId),
    )
    .slice(0, limit);
}

/** One snack/drink line on a session, read from the local database. */
export type ItemSale = {
  productId: string | null | undefined;
  name: string | null | undefined;
  quantity: number | null | undefined;
  unitPrice: number | null | undefined;
  /** When it was added (UTC epoch ms); null if unreadable (skipped). */
  soldAt: number | null;
  branchId: string | null | undefined;
  /** Cancelled session or void bill: never paid for, so not a sale. */
  excluded: boolean;
};

export type ProductSales = { productId: string; name: string; quantity: number; amount: Piasters };

export type ItemSalesSummary = { quantity: number; amount: Piasters; byProduct: ProductSales[] };

/** Snacks and drinks sold in the period, per product, largest amount first. */
export function summarizeItemSales(
  items: readonly ItemSale[],
  range: Pick<DateRange, 'start' | 'end'>,
  filter: { branchId?: string | null } = {},
): ItemSalesSummary {
  const byProduct = new Map<string, ProductSales>();
  let quantity = 0;
  let amount = 0;
  for (const i of items) {
    if (i.excluded || i.soldAt == null || i.soldAt < range.start || i.soldAt >= range.end) continue;
    if (filter.branchId && i.branchId !== filter.branchId) continue;
    const qty = i.quantity ?? 0;
    const price = i.unitPrice ?? 0;
    if (!Number.isSafeInteger(qty) || qty <= 0 || !Number.isSafeInteger(price)) continue;
    const key = i.productId ?? '';
    const p = byProduct.get(key) ?? { productId: key, name: i.name ?? '', quantity: 0, amount: 0 };
    p.quantity += qty;
    p.amount += qty * price;
    byProduct.set(key, p);
    quantity += qty;
    amount += qty * price;
  }
  return {
    quantity,
    amount,
    byProduct: [...byProduct.values()].sort(
      (a, b) => b.amount - a.amount || b.quantity - a.quantity || a.name.localeCompare(b.name),
    ),
  };
}
