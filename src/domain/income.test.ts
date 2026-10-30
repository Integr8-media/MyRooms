import {
  countedEntries,
  customRange,
  datesInRange,
  periodRange,
  rangeDays,
  ranked,
  share,
  summarizeIncome,
  utcDateWindow,
  type IncomeEntry,
} from './income';

const TZ = 'Africa/Cairo';
// Cairo is UTC+2 in winter, UTC+3 in summer (DST from the last Friday of April).
const cairo = (y: number, m: number, d: number, h = 0, min = 0, offset = 2) =>
  Date.UTC(y, m - 1, d, h - offset, min);

const entry = (over: Partial<IncomeEntry> = {}): IncomeEntry => ({
  kind: 'payment',
  method: 'cash',
  amount: 10000,
  paidAt: cairo(2026, 1, 5, 14),
  branchId: 'A',
  stationTypeId: 'ps5',
  receivedBy: 'u1',
  billVoided: false,
  ...over,
});

describe('periodRange', () => {
  // Monday 5 Jan 2026, 14:00 in Cairo.
  const NOW = cairo(2026, 1, 5, 14);

  it('today runs from local midnight to the next midnight', () => {
    const r = periodRange('today', NOW, TZ);
    expect(r.start).toBe(cairo(2026, 1, 5));
    expect(r.end).toBe(cairo(2026, 1, 6));
    expect([r.fromDate, r.toDate]).toEqual(['2026-01-05', '2026-01-05']);
  });

  it('uses the org time zone, not UTC: 23:30 UTC on the 4th is already the 5th in Cairo', () => {
    const r = periodRange('today', Date.UTC(2026, 0, 4, 23, 30), TZ);
    expect(r.fromDate).toBe('2026-01-05');
  });

  it('a week starts on Saturday by default', () => {
    const r = periodRange('week', NOW, TZ);
    expect([r.fromDate, r.toDate]).toEqual(['2026-01-03', '2026-01-09']);
    expect(r.start).toBe(cairo(2026, 1, 3));
    expect(r.end).toBe(cairo(2026, 1, 10));
    expect(rangeDays(r)).toBe(7);
  });

  it('a week can start on another day, and on that day it starts today', () => {
    expect(periodRange('week', NOW, TZ, 0).fromDate).toBe('2026-01-04');
    expect(periodRange('week', NOW, TZ, 1).fromDate).toBe('2026-01-05');
    // Saturday 3 Jan is its own week's first day.
    expect(periodRange('week', cairo(2026, 1, 3, 9), TZ).fromDate).toBe('2026-01-03');
  });

  it('a week can cross into the next year', () => {
    const r = periodRange('week', cairo(2025, 12, 31, 12), TZ);
    expect([r.fromDate, r.toDate]).toEqual(['2025-12-27', '2026-01-02']);
  });

  it('this month covers the 1st to the last day, February included', () => {
    const r = periodRange('month', cairo(2028, 2, 10), TZ);
    expect([r.fromDate, r.toDate]).toEqual(['2028-02-01', '2028-02-29']);
    expect(r.end).toBe(cairo(2028, 3, 1));
  });

  it('handles the day Cairo moves its clocks forward (a 23-hour day)', () => {
    // 2026: DST starts Friday 24 April at 00:00 (clocks jump to 01:00).
    const r = periodRange('today', cairo(2026, 4, 24, 12, 0, 3), TZ);
    expect(r.fromDate).toBe('2026-04-24');
    expect(r.end - r.start).toBe(23 * 3_600_000);
  });
});

describe('customRange', () => {
  it('includes both days', () => {
    const { range } = customRange('2026-01-01', '2026-01-31', TZ);
    expect(range?.start).toBe(cairo(2026, 1, 1));
    expect(range?.end).toBe(cairo(2026, 2, 1));
    expect(rangeDays(range!)).toBe(31);
  });

  it('accepts a single day and Arabic-Indic digits', () => {
    const { range } = customRange('٢٠٢٦-٠١-٠٥', '2026-01-05', TZ);
    expect(range?.fromDate).toBe('2026-01-05');
  });

  it('rejects bad dates, reversed ranges and ranges over a year', () => {
    expect(customRange('2026-02-30', '2026-03-01', TZ).error).toBe('invalid_date');
    expect(customRange('', '2026-03-01', TZ).error).toBe('invalid_date');
    expect(customRange('2026-03-02', '2026-03-01', TZ).error).toBe('end_before_start');
    expect(customRange('2026-01-01', '2027-01-02', TZ).error).toBe('range_too_long');
    expect(customRange('2026-01-01', '2026-12-31', TZ).error).toBeNull();
  });
});

describe('utcDateWindow', () => {
  it('covers the range with a day to spare on each side', () => {
    const r = periodRange('today', cairo(2026, 1, 5, 14), TZ);
    // Cairo's 5 Jan = 4 Jan 22:00 UTC to 5 Jan 22:00 UTC.
    expect(utcDateWindow(r)).toEqual(['2026-01-03', '2026-01-06']);
  });
});

describe('summarizeIncome', () => {
  const today = periodRange('today', cairo(2026, 1, 5, 14), TZ);

  it('adds payments and takes away refunds, per method, branch, type and day', () => {
    const s = summarizeIncome(
      [
        entry({ amount: 9000 }),
        entry({ method: 'visa', amount: 5000, branchId: 'B', stationTypeId: 'pc' }),
        entry({ method: 'instapay', amount: 2500 }),
        entry({ kind: 'refund', amount: 1000 }),
      ],
      today,
      TZ,
    );
    expect(s).toMatchObject({
      net: 15500,
      received: 16500,
      refunded: 1000,
      payments: 3,
      refunds: 1,
      byMethod: { cash: 8000, visa: 5000, instapay: 2500 },
      byBranch: { A: 10500, B: 5000 },
      byStationType: { ps5: 10500, pc: 5000 },
      byDay: { '2026-01-05': 15500 },
    });
  });

  it('ignores void bills and anything outside the range (end excluded)', () => {
    const s = summarizeIncome(
      [
        entry({ billVoided: true }),
        entry({ paidAt: cairo(2026, 1, 4, 23, 59) }),
        entry({ paidAt: cairo(2026, 1, 6) }),
        entry({ paidAt: cairo(2026, 1, 5) }),
        entry({ paidAt: null }),
      ],
      today,
      TZ,
    );
    expect(s.net).toBe(10000);
    expect(s.payments).toBe(1);
  });

  it('skips rows it cannot read instead of counting them wrong', () => {
    const s = summarizeIncome(
      [
        entry({ method: 'cheque' }),
        entry({ kind: 'other' }),
        entry({ amount: 12.5 }),
        entry({ amount: -100 }),
        entry({ amount: null }),
      ],
      today,
      TZ,
    );
    expect(s.net).toBe(0);
    expect(s.byMethod).toEqual({ cash: 0, visa: 0, instapay: 0 });
  });

  it('filters by branch and by the person who took the money', () => {
    const entries = [
      entry({ receivedBy: 'u1', branchId: 'A' }),
      entry({ receivedBy: 'u2', branchId: 'A', amount: 3000 }),
      entry({ receivedBy: 'u1', branchId: 'B', amount: 2000 }),
    ];
    expect(summarizeIncome(entries, today, TZ, { receivedBy: 'u1' }).net).toBe(12000);
    expect(summarizeIncome(entries, today, TZ, { branchId: 'A' }).net).toBe(13000);
    expect(countedEntries(entries, today, { branchId: 'A', receivedBy: 'u2' })).toHaveLength(1);
  });

  it('counts a refund on the day it was given, not the day of the payment', () => {
    const week = periodRange('week', cairo(2026, 1, 5, 14), TZ);
    const s = summarizeIncome(
      [entry({ paidAt: cairo(2026, 1, 3, 20) }), entry({ kind: 'refund', amount: 4000 })],
      week,
      TZ,
    );
    expect(s.byDay).toEqual({ '2026-01-03': 10000, '2026-01-05': -4000 });
    expect(s.net).toBe(6000);
  });

  it('puts a payment late in the evening on the local day, not the UTC day', () => {
    const week = periodRange('week', cairo(2026, 1, 5, 14), TZ);
    // 23:30 Cairo on the 5th is 21:30 UTC; 01:00 Cairo on the 6th is still the 5th in UTC.
    const s = summarizeIncome(
      [entry({ paidAt: cairo(2026, 1, 5, 23, 30) }), entry({ paidAt: cairo(2026, 1, 6, 1) })],
      week,
      TZ,
    );
    expect(s.byDay).toEqual({ '2026-01-05': 10000, '2026-01-06': 10000 });
  });

  it('a missing station type or branch is grouped under ""', () => {
    const s = summarizeIncome([entry({ stationTypeId: null, branchId: null })], today, TZ);
    expect(s.byStationType).toEqual({ '': 10000 });
    expect(s.byBranch).toEqual({ '': 10000 });
  });
});

describe('datesInRange', () => {
  it('lists every day, across a month end', () => {
    expect(datesInRange({ fromDate: '2026-01-30', toDate: '2026-02-02' })).toEqual([
      '2026-01-30',
      '2026-01-31',
      '2026-02-01',
      '2026-02-02',
    ]);
  });
});

describe('ranked and share', () => {
  it('sorts largest first with a stable tie order', () => {
    expect(ranked({ b: 5, a: 5, c: 9 })).toEqual([
      ['c', 9],
      ['a', 5],
      ['b', 5],
    ]);
  });

  it('gives whole percents and never divides by zero', () => {
    expect(share(1, 3)).toBe(33);
    expect(share(5, 0)).toBe(0);
    expect(share(-5, 10)).toBe(0);
  });
});
