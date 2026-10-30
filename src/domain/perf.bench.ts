/**
 * Performance check (Phase 9): the device-side work for a big center, on synthetic data.
 * Not part of `npm test` (timings depend on the machine). Run with `npm run perf`.
 *
 * Jest's environment runs this code about 10x slower than plain Node, which makes it a fair
 * stand-in for a phone's Hermes engine. The floor tick runs every second, so it must stay far
 * below 1000 ms; reports run once when opened, so up to about a second is acceptable.
 */
import { DEFAULT_WEEK_START, periodRange, summarizeIncome, type IncomeEntry } from './income';
import type { RateRule } from './pricing';
import { priceSession } from './pricing';
import {
  occupancyHeatmap,
  summarizeUtilization,
  topCustomers,
  type StationInfo,
  type UsageInterval,
} from './reports';

const TZ = 'Africa/Cairo';
const NOW = Date.UTC(2026, 9, 30, 16, 0);
const HOUR = 3_600_000;
const TYPES = ['pc', 'ps4', 'ps5'];

const rules: RateRule[] = TYPES.flatMap((type, i) => [
  {
    id: `${type}-base`,
    stationTypeId: type,
    pricePerHour: 2000 + i * 1000,
    daysOfWeek: 127,
    priority: 0,
  },
  {
    id: `${type}-peak`,
    stationTypeId: type,
    pricePerHour: 3000 + i * 1000,
    daysOfWeek: 127,
    fromMinute: 18 * 60,
    toMinute: 24 * 60,
    priority: 10,
  },
  {
    id: `${type}-weekend`,
    stationTypeId: type,
    pricePerHour: 3500 + i * 1000,
    daysOfWeek: 0b0100000 | 0b1000000,
    priority: 5,
  },
  {
    id: `${type}-4p`,
    stationTypeId: type,
    pricePerHour: 4000 + i * 1000,
    daysOfWeek: 127,
    playersMin: 3,
    priority: 20,
  },
]);

function time(label: string, budgetMs: number, fn: () => unknown, runs = 3): number {
  fn(); // warm up
  let best = Infinity;
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    fn();
    best = Math.min(best, performance.now() - t0);
  }
  console.log(`${label}: ${best.toFixed(1)} ms (budget ${budgetMs} ms)`);
  return best;
}

/** A year of a 40-station center: ~8 sessions per station per day, a third with a customer. */
function yearOfData(stationCount = 40) {
  const stations: StationInfo[] = Array.from({ length: stationCount }, (_, i) => ({
    id: `st${i}`,
    branchId: i % 2 ? 'A' : 'B',
    stationTypeId: TYPES[i % 3]!,
    isActive: true,
    createdAt: NOW - 400 * 24 * HOUR,
  }));
  const intervals: UsageInterval[] = [];
  const entries: IncomeEntry[] = [];
  let n = 0;
  for (let day = 365; day >= 0; day--) {
    const dayStart = NOW - day * 24 * HOUR - 6 * HOUR;
    for (const s of stations) {
      for (let k = 0; k < 8; k++) {
        const start = dayStart + k * 1.5 * HOUR;
        const end = start + HOUR;
        if (end > NOW) continue;
        n++;
        intervals.push({ stationId: s.id, branchId: s.branchId, start, end });
        entries.push({
          kind: n % 50 === 0 ? 'refund' : 'payment',
          method: ['cash', 'visa', 'instapay'][n % 3],
          amount: 3000 + (n % 7) * 500,
          paidAt: end,
          branchId: s.branchId,
          stationTypeId: s.stationTypeId,
          receivedBy: `u${n % 5}`,
          billVoided: n % 200 === 0,
          billId: `b${n}`,
          customerId: n % 3 === 0 ? `c${n % 500}` : null,
        });
      }
    }
  }
  return { stations, intervals, entries };
}

describe('performance (synthetic big center)', () => {
  it('floor tick: price 300 running sessions with a player change each', () => {
    const sessions = Array.from({ length: 300 }, (_, i) => {
      const start = NOW - (1 + (i % 5)) * HOUR - 17 * 60_000;
      const change = start + 40 * 60_000;
      return [
        { start, end: change, players: 2, stationTypeId: TYPES[i % 3]! },
        { start: change, end: NOW, players: 4, stationTypeId: TYPES[i % 3]! },
      ];
    });
    const ms = time('floor tick, 300 sessions', 100, () => {
      for (const segments of sessions) priceSession({ segments, rules, timeZone: TZ });
    });
    expect(ms).toBeLessThan(100);
  });

  it('a year of reports for 40 stations', () => {
    const { stations, intervals, entries } = yearOfData();
    console.log(
      `  ${intervals.length.toLocaleString('en')} sessions, ${entries.length.toLocaleString('en')} payments`,
    );
    const year = { start: NOW - 365 * 24 * HOUR, end: NOW };
    const month = periodRange('month', NOW, TZ, DEFAULT_WEEK_START);

    const budgets: [string, number, () => unknown][] = [
      ['income, a year', 800, () => summarizeIncome(entries, year, TZ)],
      ['income, this month', 200, () => summarizeIncome(entries, month, TZ)],
      ['usage, a year', 400, () => summarizeUtilization(intervals, stations, year, NOW)],
      ['busiest hours, a year', 800, () => occupancyHeatmap(intervals, year, NOW, TZ)],
      ['top customers, a year', 200, () => topCustomers(entries, year)],
    ];
    for (const [label, budget, fn] of budgets) {
      expect(time(label, budget, fn)).toBeLessThan(budget);
    }
  });
});
