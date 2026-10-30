import { priceSession, type RateRule } from './pricing';
import {
  alertsForSession,
  dueAlerts,
  elapsedMs,
  ENDING_SOON_MS,
  extendEnd,
  floorStatus,
  formatTimer,
  parseTimestamp,
  plannedEnd,
  remainingMs,
  toPricingSegments,
  upcomingAlerts,
} from './sessions';
import { fromLocal } from './zoned-time';

const MIN = 60_000;
const T0 = Date.UTC(2026, 0, 5, 12, 0); // 14:00 in Cairo (UTC+2)

describe('floorStatus', () => {
  const active = { status: 'active' };

  it('free, maintenance and running stations', () => {
    expect(floorStatus(active, null, T0)).toBe('free');
    expect(floorStatus({ status: 'maintenance' }, null, T0)).toBe('maintenance');
    expect(floorStatus(active, { start: T0, scheduledEnd: null }, T0 + 600 * MIN)).toBe('active');
  });

  it('fixed sessions turn "ending soon" 5 minutes before the end, then "overtime"', () => {
    const s = { start: T0, scheduledEnd: T0 + 60 * MIN };
    expect(floorStatus(active, s, T0 + 54 * MIN)).toBe('active');
    expect(floorStatus(active, s, T0 + 60 * MIN - ENDING_SOON_MS)).toBe('ending_soon');
    expect(floorStatus(active, s, T0 + 60 * MIN - 1)).toBe('ending_soon');
    expect(floorStatus(active, s, T0 + 60 * MIN)).toBe('overtime');
  });

  it('a running session shows even if the station was put in maintenance meanwhile', () => {
    expect(floorStatus({ status: 'maintenance' }, { start: T0, scheduledEnd: null }, T0)).toBe(
      'active',
    );
  });
});

describe('timers', () => {
  it('elapsed and remaining time', () => {
    const s = { start: T0, scheduledEnd: plannedEnd(T0, 90) };
    expect(elapsedMs(s, T0 + 30 * MIN)).toBe(30 * MIN);
    expect(elapsedMs(s, T0 - MIN)).toBe(0); // device clock behind
    expect(remainingMs(s, T0 + 30 * MIN)).toBe(60 * MIN);
    expect(remainingMs(s, T0 + 100 * MIN)).toBe(-10 * MIN);
    expect(remainingMs({ start: T0, scheduledEnd: null }, T0)).toBeNull();
  });

  it('formats h:mm:ss, m:ss and negative values', () => {
    expect(formatTimer(0)).toBe('0:00');
    expect(formatTimer(65_000)).toBe('1:05');
    expect(formatTimer(3_909_000)).toBe('1:05:09');
    expect(formatTimer(-125_000)).toBe('-2:05');
    expect(formatTimer(59_999)).toBe('0:59');
  });

  it('extending adds to the planned end, even when over time', () => {
    const end = plannedEnd(T0, 60);
    expect(extendEnd(end, 30)).toBe(T0 + 90 * MIN);
  });
});

describe('toPricingSegments', () => {
  const rules: RateRule[] = [
    { id: 'pc', stationTypeId: 'pc', pricePerHour: 3000, daysOfWeek: 127, priority: 0 },
    { id: 'ps2', stationTypeId: 'ps', pricePerHour: 6000, daysOfWeek: 127, priority: 0 },
    {
      id: 'ps4',
      stationTypeId: 'ps',
      pricePerHour: 9000,
      playersMin: 3,
      daysOfWeek: 127,
      priority: 0,
    },
  ];

  it('prices a running segment up to now, in order', () => {
    const segments = toPricingSegments(
      [
        { stationTypeId: 'ps', players: 4, startedAt: T0 + 60 * MIN, endedAt: null },
        { stationTypeId: 'ps', players: 2, startedAt: T0, endedAt: T0 + 60 * MIN },
      ],
      T0 + 90 * MIN,
    );
    expect(segments.map((s) => s.players)).toEqual([2, 4]);
    const bill = priceSession({ segments, rules, timeZone: 'Africa/Cairo' });
    // 1h × 60 (2 players) + 0.5h × 90 (4 players) = 105 EGP
    expect(bill.total).toBe(10500);
  });

  it('a move to a station of another type is priced at that type', () => {
    const start = fromLocal('Africa/Cairo', 2026, 1, 5, 0, 14 * 60);
    const segments = toPricingSegments(
      [
        { stationTypeId: 'pc', players: 1, startedAt: start, endedAt: start + 30 * MIN },
        { stationTypeId: 'ps', players: 1, startedAt: start + 30 * MIN, endedAt: null },
      ],
      start + 90 * MIN,
    );
    const bill = priceSession({ segments, rules, timeZone: 'Africa/Cairo' });
    // 0.5h × 30 + 1h × 60 = 75 EGP
    expect(bill.total).toBe(7500);
  });

  it('never makes a negative segment when the device clock is behind', () => {
    const [s] = toPricingSegments(
      [{ stationTypeId: 'pc', players: 1, startedAt: T0, endedAt: null }],
      T0 - MIN,
    );
    expect(s!.end).toBe(T0);
  });
});

describe('alerts', () => {
  const end = T0 + 60 * MIN;

  it('three alerts per fixed session, keyed by the planned end', () => {
    const alerts = alertsForSession('s1', end);
    expect(alerts.map((a) => [a.kind, a.at])).toEqual([
      ['ending_soon', end - 5 * MIN],
      ['ended', end],
      ['overtime', end + 15 * MIN],
    ]);
    expect(alertsForSession('s1', end + 30 * MIN)[0]!.key).not.toBe(alerts[0]!.key);
  });

  it('upcoming alerts skip open sessions and the past', () => {
    const upcoming = upcomingAlerts(
      [
        { id: 'open', scheduledEnd: null },
        { id: 'fixed', scheduledEnd: end },
      ],
      end - MIN,
    );
    expect(upcoming.map((a) => a.kind)).toEqual(['ended', 'overtime']);
  });

  it('due alerts fire once, only the latest, and not long after the fact', () => {
    const sessions = [{ id: 's1', scheduledEnd: end }];
    expect(dueAlerts(sessions, end - 6 * MIN, new Set())).toEqual([]);

    const soon = dueAlerts(sessions, end - 4 * MIN, new Set());
    expect(soon.map((a) => a.kind)).toEqual(['ending_soon']);
    expect(dueAlerts(sessions, end - 4 * MIN, new Set([soon[0]!.key]))).toEqual([]);

    // Opened 30 s after the end: only "ended", not the missed "ending soon".
    expect(dueAlerts(sessions, end + 30_000, new Set()).map((a) => a.kind)).toEqual(['ended']);
    // Opened 10 minutes after the end: nothing to replay.
    expect(dueAlerts(sessions, end + 10 * MIN, new Set())).toEqual([]);
  });
});

describe('parseTimestamp', () => {
  it('reads device ISO strings and Postgres text', () => {
    const t = Date.UTC(2026, 0, 5, 12, 0, 30, 123);
    expect(parseTimestamp('2026-01-05T12:00:30.123Z')).toBe(t);
    expect(parseTimestamp('2026-01-05 12:00:30.123456+00')).toBe(t);
    expect(parseTimestamp('2026-01-05 14:00:30.123+02:00')).toBe(t);
    expect(parseTimestamp('2026-01-05 12:00:30.123456Z')).toBe(t);
    expect(parseTimestamp('2026-01-05 12:00')).toBe(Date.UTC(2026, 0, 5, 12, 0));
  });

  it('returns null for empty or unreadable values', () => {
    expect(parseTimestamp(null)).toBeNull();
    expect(parseTimestamp('')).toBeNull();
    expect(parseTimestamp('yesterday')).toBeNull();
  });
});
