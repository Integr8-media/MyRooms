import {
  dateKey,
  formatClock,
  fromLocal,
  localInstants,
  offsetAt,
  parseClock,
  parseDateKey,
  previousDateKey,
  toLocal,
} from './zoned-time';

const TZ = 'Africa/Cairo';

describe('zoned time', () => {
  it('knows Cairo winter and summer time', () => {
    expect(offsetAt(Date.UTC(2026, 0, 15, 12), TZ)).toBe(2 * 3600_000);
    expect(offsetAt(Date.UTC(2026, 6, 15, 12), TZ)).toBe(3 * 3600_000);
  });

  it('round-trips wall time', () => {
    const instant = fromLocal(TZ, 2026, 1, 5, 18, 30);
    expect(instant).toBe(Date.UTC(2026, 0, 5, 16, 30));
    const local = toLocal(instant, TZ);
    expect([local.hour, local.minute, local.weekday, dateKey(local)]).toEqual([
      18,
      30,
      1,
      '2026-01-05',
    ]);
  });

  it('treats hour 24 as the next midnight', () => {
    expect(fromLocal(TZ, 2026, 1, 31, 24)).toBe(fromLocal(TZ, 2026, 2, 1, 0));
  });

  it('maps a skipped time to the moment the clocks jumped', () => {
    // Midnight of 24 April 2026 does not exist in Cairo (00:00 -> 01:00).
    const jump = fromLocal(TZ, 2026, 4, 24, 0);
    expect(jump).toBe(Date.UTC(2026, 3, 23, 22));
    expect(toLocal(jump, TZ).hour).toBe(1);
  });

  it('finds both instants of a repeated hour', () => {
    // 29 Oct 2026: 24:00 summer time becomes 23:00 winter time, so 23:30 happens twice.
    expect(localInstants(TZ, 2026, 10, 29, 23, 30)).toEqual([
      Date.UTC(2026, 9, 29, 20, 30),
      Date.UTC(2026, 9, 29, 21, 30),
    ]);
    expect(fromLocal(TZ, 2026, 10, 29, 22)).toBe(Date.UTC(2026, 9, 29, 19));
    expect(localInstants(TZ, 2026, 4, 24, 0, 30)).toEqual([]);
  });

  it('parses and formats clock times', () => {
    expect(parseClock('18:30')).toBe(1110);
    expect(parseClock('٠٩:٠٥')).toBe(545);
    expect(parseClock('7')).toBe(420);
    expect(parseClock('24:00')).toBe(1440);
    expect(parseClock('24:30')).toBeNull();
    expect(parseClock('12:60')).toBeNull();
    expect(parseClock('noon')).toBeNull();
    expect(formatClock(90)).toBe('01:30');
    expect(formatClock(1440)).toBe('24:00');
  });

  it('parses dates and steps back a day', () => {
    expect(parseDateKey('2026-02-28')).toEqual({ year: 2026, month: 2, day: 28 });
    expect(parseDateKey('2026-02-30')).toBeNull();
    expect(parseDateKey('30/01/2026')).toBeNull();
    expect(previousDateKey('2026-01-01')).toBe('2025-12-31');
    expect(previousDateKey('2024-03-01')).toBe('2024-02-29');
  });
});

describe('cached offsets (Phase 9 speed-up)', () => {
  // The exact answer, straight from Intl, to compare the cache with.
  const exact = (instant: number, timeZone: string) => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
      })
        .formatToParts(new Date(instant))
        .filter((p) => p.type !== 'literal')
        .map((p) => [p.type, Number(p.value)]),
    );
    return [parts.year, parts.month, parts.day, (parts.hour ?? 0) % 24, parts.minute, parts.second];
  };

  it.each([
    // Cairo: spring forward at local midnight (last Friday of April), back at midnight in October.
    ['Africa/Cairo', Date.UTC(2026, 3, 23, 12), Date.UTC(2026, 3, 25, 0)],
    ['Africa/Cairo', Date.UTC(2026, 9, 29, 12), Date.UTC(2026, 9, 31, 0)],
    // A half-hour DST change and a half-hour offset.
    ['Australia/Lord_Howe', Date.UTC(2026, 3, 4, 0), Date.UTC(2026, 3, 5, 12)],
    ['America/St_Johns', Date.UTC(2026, 2, 7, 12), Date.UTC(2026, 2, 9, 0)],
    ['Asia/Kolkata', Date.UTC(2026, 0, 1), Date.UTC(2026, 0, 2)],
  ])('matches Intl every 7 minutes around changes in %s', (timeZone, from, to) => {
    for (let t = from; t < to; t += 7 * 60_000 + 1234) {
      const l = toLocal(t, timeZone);
      expect([l.year, l.month, l.day, l.hour, l.minute, l.second]).toEqual(exact(t, timeZone));
      expect(l.millisecond).toBe(((t % 1000) + 1000) % 1000);
      expect(l.weekday).toBe(new Date(Date.UTC(l.year, l.month - 1, l.day)).getUTCDay());
    }
  });
});
