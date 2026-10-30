import { customRange, periodRange, type IncomeEntry } from './income';
import {
  compareBranches,
  netProfit,
  occupancyHeatmap,
  percentChange,
  previousRange,
  summarizeItemSales,
  summarizeUtilization,
  topCustomers,
  type ItemSale,
  type StationInfo,
  type UsageInterval,
} from './reports';

const TZ = 'Africa/Cairo';
const H = 3_600_000;
/** Cairo wall-clock time in January 2026 (UTC+2, no DST). */
const cairo = (day: number, hour: number, minute = 0) => Date.UTC(2026, 0, day, hour - 2, minute);

describe('previousRange', () => {
  // Monday 5 Jan 2026, 14:00 in Cairo. The week starts on Saturday the 3rd.
  const now = cairo(5, 14);

  it('today → yesterday', () => {
    const prev = previousRange(periodRange('today', now, TZ), 'today', TZ);
    expect([prev.fromDate, prev.toDate]).toEqual(['2026-01-04', '2026-01-04']);
    expect(prev.start).toBe(cairo(4, 0));
    expect(prev.end).toBe(cairo(5, 0));
  });

  it('this week → last week', () => {
    const prev = previousRange(periodRange('week', now, TZ), 'week', TZ);
    expect([prev.fromDate, prev.toDate]).toEqual(['2025-12-27', '2026-01-02']);
  });

  it('this month → the whole previous month (also across a year and into February)', () => {
    expect(previousRange(periodRange('month', now, TZ), 'month', TZ)).toMatchObject({
      fromDate: '2025-12-01',
      toDate: '2025-12-31',
    });
    const march = periodRange('month', Date.UTC(2028, 2, 15), TZ);
    expect(previousRange(march, 'month', TZ)).toMatchObject({
      fromDate: '2028-02-01',
      toDate: '2028-02-29',
    });
  });

  it('custom → the same number of days just before', () => {
    const range = customRange('2026-03-01', '2026-03-10', TZ).range!;
    expect(previousRange(range, 'custom', TZ)).toMatchObject({
      fromDate: '2026-02-19',
      toDate: '2026-02-28',
    });
  });
});

describe('percentChange and netProfit', () => {
  it('compares with the previous period', () => {
    expect(percentChange(125, 100)).toBe(25);
    expect(percentChange(90, 100)).toBe(-10);
    expect(percentChange(0, 100)).toBe(-100);
    expect(percentChange(50, 0)).toBeNull();
    expect(percentChange(50, -20)).toBeNull();
  });

  it('profit is income minus expenses, and can be negative', () => {
    expect(netProfit(50000, 20000)).toEqual({ income: 50000, expenses: 20000, profit: 30000 });
    expect(netProfit(1000, 5000).profit).toBe(-4000);
  });
});

const station = (id: string, over: Partial<StationInfo> = {}): StationInfo => ({
  id,
  branchId: 'A',
  stationTypeId: 'ps5',
  isActive: true,
  createdAt: null,
  ...over,
});

describe('summarizeUtilization', () => {
  const day = customRange('2026-01-05', '2026-01-05', TZ).range!;
  const afterDay = cairo(6, 12);

  it('divides time in use by the time each station could be used', () => {
    const intervals: UsageInterval[] = [
      // Room 1: 6 h in two sessions = 25% of 24 h.
      { stationId: 'r1', branchId: 'A', start: cairo(5, 10), end: cairo(5, 14) },
      { stationId: 'r1', branchId: 'A', start: cairo(5, 18), end: cairo(5, 20) },
      // Room 2: started the evening before; only today's 3 hours count.
      { stationId: 'r2', branchId: 'A', start: cairo(4, 22), end: cairo(5, 3) },
      // PC in branch B: 12 h.
      { stationId: 'pc1', branchId: 'B', start: cairo(5, 8), end: cairo(5, 20) },
    ];
    const stations = [
      station('r1'),
      station('r2'),
      station('pc1', { branchId: 'B', stationTypeId: 'pc' }),
    ];
    const u = summarizeUtilization(intervals, stations, day, afterDay);
    expect(u.byStation.r1).toEqual({ used: 6 * H, available: 24 * H, pct: 25 });
    expect(u.byStation.r2!.used).toBe(3 * H);
    expect(u.byType.ps5).toMatchObject({ used: 9 * H, available: 48 * H, pct: 19 });
    expect(u.byBranch.B!.pct).toBe(50);
    expect(u.overall).toMatchObject({ used: 21 * H, available: 72 * H, pct: 29 });

    const onlyB = summarizeUtilization(intervals, stations, day, afterDay, { branchId: 'B' });
    expect(onlyB.overall.pct).toBe(50);
    expect(onlyB.byStation.r1).toBeUndefined();
  });

  it('counts today only up to now, and running sessions up to now', () => {
    const intervals: UsageInterval[] = [
      { stationId: 'r1', branchId: 'A', start: cairo(5, 9), end: null },
    ];
    const u = summarizeUtilization(intervals, [station('r1')], day, cairo(5, 12));
    expect(u.byStation.r1).toEqual({ used: 3 * H, available: 12 * H, pct: 25 });
  });

  it('merges overlapping segments, skips unreadable ones and unused removed stations', () => {
    const intervals: UsageInterval[] = [
      { stationId: 'r1', branchId: 'A', start: cairo(5, 10), end: cairo(5, 12) },
      { stationId: 'r1', branchId: 'A', start: cairo(5, 11), end: cairo(5, 13) },
      { stationId: 'r1', branchId: 'A', start: null, end: cairo(5, 13) },
      { stationId: 'old2', branchId: 'A', start: cairo(5, 10), end: cairo(5, 11) },
    ];
    const stations = [
      station('r1'),
      station('old1', { isActive: false }),
      station('old2', { isActive: false }),
    ];
    const u = summarizeUtilization(intervals, stations, day, afterDay);
    expect(u.byStation.r1!.used).toBe(3 * H);
    expect(u.byStation.old1).toBeUndefined();
    expect(u.byStation.old2!.used).toBe(1 * H);
  });

  it('a station added during the period is only available from then on', () => {
    const u = summarizeUtilization(
      [{ stationId: 'new', branchId: 'A', start: cairo(5, 18), end: cairo(5, 21) }],
      [station('new', { createdAt: cairo(5, 12) })],
      day,
      afterDay,
    );
    expect(u.byStation.new).toEqual({ used: 3 * H, available: 12 * H, pct: 25 });
  });
});

describe('occupancyHeatmap', () => {
  it('averages busy stations per weekday and hour', () => {
    // Two Mondays (5th and 12th) in the range; Monday = weekday 1.
    const range = customRange('2026-01-05', '2026-01-12', TZ).range!;
    const intervals: UsageInterval[] = [
      // Monday 5th 18:00-20:00 two stations, 18:30-19:00 a third.
      { stationId: 'a', branchId: 'A', start: cairo(5, 18), end: cairo(5, 20) },
      { stationId: 'b', branchId: 'A', start: cairo(5, 18), end: cairo(5, 20) },
      { stationId: 'c', branchId: 'A', start: cairo(5, 18, 30), end: cairo(5, 19) },
      // Monday 12th 18:00-19:00 one station; other branch ignored with the filter.
      { stationId: 'a', branchId: 'A', start: cairo(12, 18), end: cairo(12, 19) },
      { stationId: 'z', branchId: 'B', start: cairo(12, 18), end: cairo(12, 19) },
    ];
    const map = occupancyHeatmap(intervals, range, cairo(20, 0), TZ, { branchId: 'A' });
    // 18:00 on Mondays: (2 + 0.5) h + 1 h over two Mondays = 1.75 stations on average.
    expect(map.busy[1]![18]).toBeCloseTo(1.75);
    expect(map.busy[1]![19]).toBeCloseTo(1);
    expect(map.busy[0]![18]).toBe(0);
    expect(map.max).toBeCloseTo(1.75);
    expect(map.peak).toEqual({ weekday: 1, hour: 18 });
  });

  it('uses local hours across a DST change and only counts hours that have passed', () => {
    // Cairo summer time 2026 starts at midnight on Friday 24 April (00:00 → 01:00).
    const range = customRange('2026-04-24', '2026-04-24', TZ).range!;
    const start = range.start; // 00:00 local = 22:00 UTC the day before (UTC+2)
    const map = occupancyHeatmap(
      [{ stationId: 'a', branchId: 'A', start, end: start + H }],
      range,
      start + 2 * H,
      TZ,
    );
    // The first real hour on that day is 01:00 local.
    expect(map.peak).toEqual({ weekday: 5, hour: 1 });
    expect(map.busy[5]![1]).toBeCloseTo(1);
  });

  it('is empty when nothing was used', () => {
    const range = periodRange('today', cairo(5, 14), TZ);
    expect(occupancyHeatmap([], range, cairo(5, 14), TZ)).toMatchObject({ max: 0, peak: null });
  });
});

const entry = (over: Partial<IncomeEntry>): IncomeEntry => ({
  kind: 'payment',
  method: 'cash',
  amount: 10000,
  paidAt: cairo(5, 13),
  branchId: 'A',
  stationTypeId: 'ps5',
  receivedBy: 'u1',
  billVoided: false,
  billId: 'b1',
  customerId: 'c1',
  ...over,
});

describe('topCustomers', () => {
  const range = periodRange('today', cairo(5, 14), TZ);

  it('ranks customers by money paid, with the number of bills', () => {
    const entries = [
      entry({}),
      entry({ amount: 5000, method: 'visa' }), // split payment on the same bill
      entry({ billId: 'b2', amount: 2000 }),
      entry({ kind: 'refund', billId: 'b2', amount: 1000 }),
      entry({ customerId: 'c2', billId: 'b3', amount: 30000 }),
      entry({ customerId: null, billId: 'b4', amount: 99999 }), // walk-in without a customer
      entry({ customerId: 'c3', billId: 'b5', amount: 50000, billVoided: true }),
      entry({ customerId: 'c3', billId: 'b6', amount: 50000, paidAt: cairo(4, 13) }),
    ];
    expect(topCustomers(entries, range)).toEqual([
      { customerId: 'c2', net: 30000, visits: 1 },
      { customerId: 'c1', net: 16000, visits: 2 },
    ]);
    expect(topCustomers(entries, range, { branchId: 'B' })).toEqual([]);
    expect(topCustomers(entries, range, {}, 1)).toHaveLength(1);
  });
});

describe('summarizeItemSales', () => {
  const range = periodRange('today', cairo(5, 14), TZ);
  const sale = (over: Partial<ItemSale>): ItemSale => ({
    productId: 'cola',
    name: 'Cola',
    quantity: 1,
    unitPrice: 1500,
    soldAt: cairo(5, 12),
    branchId: 'A',
    excluded: false,
    ...over,
  });

  it('adds up quantities and amounts per product', () => {
    const s = summarizeItemSales(
      [
        sale({ quantity: 2 }),
        sale({ quantity: 1 }),
        sale({ productId: 'chips', name: 'Chips', quantity: 5, unitPrice: 1000 }),
        sale({ quantity: 10, excluded: true }),
        sale({ quantity: 10, soldAt: cairo(4, 12) }),
        sale({ quantity: 10, branchId: 'B' }),
      ],
      range,
      { branchId: 'A' },
    );
    expect(s).toEqual({
      quantity: 8,
      amount: 9500,
      byProduct: [
        { productId: 'chips', name: 'Chips', quantity: 5, amount: 5000 },
        { productId: 'cola', name: 'Cola', quantity: 3, amount: 4500 },
      ],
    });
  });
});

describe('compareBranches', () => {
  it('lines up income, expenses, profit and utilization per branch', () => {
    const range = { fromDate: '2026-01-05', toDate: '2026-01-05' };
    const rows = compareBranches(
      ['A', 'B'],
      { A: 50000 },
      [
        { branch_id: 'A', category: 'rent', amount: 20000, method: 'cash', spent_on: '2026-01-05' },
        { branch_id: 'B', category: 'rent', amount: 7000, method: 'cash', spent_on: '2026-01-05' },
        { branch_id: 'B', category: 'rent', amount: 9000, method: 'cash', spent_on: '2026-01-04' },
      ],
      range,
      { A: { used: 1, available: 4, pct: 25 } },
    );
    expect(rows).toEqual([
      { branchId: 'A', income: 50000, expenses: 20000, profit: 30000, utilization: 25 },
      { branchId: 'B', income: 0, expenses: 7000, profit: -7000, utilization: null },
    ]);
  });
});
