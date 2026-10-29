import {
  ALL_DAYS,
  daysToMask,
  maskToDays,
  priceSession,
  type RateRule,
  type Segment,
} from './pricing';
import { fromLocal } from './zoned-time';

const TZ = 'Africa/Cairo';
const PS = 'ps-room';
const PC = 'pc-desk';

/** Cairo wall time -> instant. January 2026 is winter time (UTC+2). 2026-01-01 is a Thursday. */
const at = (day: number, hour: number, minute = 0, month = 1) =>
  fromLocal(TZ, 2026, month, day, hour, minute);

const egp = (pounds: number) => Math.round(pounds * 100);

let nextId = 0;
const rule = (r: Partial<RateRule> & { pricePerHour: number }): RateRule => ({
  id: `r${String(++nextId).padStart(2, '0')}`,
  stationTypeId: PS,
  daysOfWeek: ALL_DAYS,
  priority: 0,
  ...r,
});

const segment = (start: number, end: number, players = 2, stationTypeId = PS): Segment => ({
  start,
  end,
  players,
  stationTypeId,
});

const price = (segments: Segment[], rules: RateRule[], extra = {}) =>
  priceSession({ segments, rules, timeZone: TZ, ...extra });

const base = rule({ name: 'Base', pricePerHour: egp(50) });

describe('priceSession', () => {
  it('charges the hourly rate for whole hours', () => {
    const bill = price([segment(at(5, 14), at(5, 16))], [base]);
    expect(bill.total).toBe(egp(100));
    expect(bill.totalMinutes).toBe(120);
    expect(bill.lines).toHaveLength(1);
  });

  it('bills per minute, rounded to the piaster', () => {
    // 37 min at 50 EGP/h = 30.8333 EGP
    expect(price([segment(at(5, 14), at(5, 14, 37))], [base]).total).toBe(3083);
    // 1h15 at 50 EGP/h = 62.50 EGP
    expect(price([segment(at(5, 14), at(5, 15, 15))], [base]).total).toBe(egp(62.5));
  });

  it('splits a session at a peak boundary', () => {
    const peak = rule({
      name: 'Peak',
      pricePerHour: egp(80),
      fromMinute: 18 * 60,
      toMinute: 1440,
      priority: 10,
    });
    // 17:00-18:00 at 50 + 18:00-19:30 at 80 = 50 + 120
    const bill = price([segment(at(5, 17), at(5, 19, 30))], [base, peak]);
    expect(bill.lines.map((l) => [l.ruleName, l.minutes, l.amount])).toEqual([
      ['Base', 60, egp(50)],
      ['Peak', 90, egp(120)],
    ]);
    expect(bill.total).toBe(egp(170));
  });

  it('handles a late-night window that crosses midnight', () => {
    const late = rule({
      name: 'Late',
      pricePerHour: egp(30),
      fromMinute: 22 * 60,
      toMinute: 2 * 60,
      priority: 10,
    });
    // 21-22 base 50, 22-02 late 4h × 30 = 120 (one line across midnight), 02-03 base 50
    const bill = price([segment(at(5, 21), at(6, 3))], [base, late]);
    expect(bill.lines.map((l) => [l.ruleName, l.minutes, l.amount])).toEqual([
      ['Base', 60, egp(50)],
      ['Late', 240, egp(120)],
      ['Base', 60, egp(50)],
    ]);
    expect(bill.total).toBe(egp(220));
  });

  it('switches to the weekend rate at midnight', () => {
    const weekend = rule({
      name: 'Weekend',
      pricePerHour: egp(70),
      daysOfWeek: daysToMask([5, 6]),
      priority: 5,
    });
    // Thursday 23:00 -> Friday 01:00: 1h at 50 + 1h at 70
    const bill = price([segment(at(1, 23), at(2, 1))], [base, weekend]);
    expect(bill.lines.map((l) => l.ruleName)).toEqual(['Base', 'Weekend']);
    expect(bill.total).toBe(egp(120));
  });

  it('gives a window that crosses midnight to the day it starts on', () => {
    const fridayNight = rule({
      name: 'Friday night',
      pricePerHour: egp(100),
      daysOfWeek: daysToMask([5]),
      fromMinute: 22 * 60,
      toMinute: 2 * 60,
      priority: 10,
    });
    // Saturday 00:30-01:30 is still "Friday night".
    expect(price([segment(at(3, 0, 30), at(3, 1, 30))], [base, fridayNight]).total).toBe(egp(100));
    // Sunday 00:30-01:30 is Saturday night: base rate.
    expect(price([segment(at(4, 0, 30), at(4, 1, 30))], [base, fridayNight]).total).toBe(egp(50));
  });

  it('prices by player count and starts a new line when it changes', () => {
    const duo = rule({ name: '1-2 players', pricePerHour: egp(60), playersMin: 1, playersMax: 2 });
    const squad = rule({
      name: '3-4 players',
      pricePerHour: egp(90),
      playersMin: 3,
      playersMax: 4,
    });
    // 1h with 2 players (60) then 30 min with 4 players (45)
    const bill = price(
      [segment(at(5, 15), at(5, 16), 2), segment(at(5, 16), at(5, 16, 30), 4)],
      [duo, squad],
    );
    expect(bill.lines.map((l) => [l.segmentIndex, l.players, l.amount])).toEqual([
      [0, 2, egp(60)],
      [1, 4, egp(45)],
    ]);
    expect(bill.total).toBe(egp(105));
  });

  it('charges a package and bills the overtime', () => {
    const pkg = { id: 'p1', name: '3 hours', minutes: 180, price: egp(150) };
    // 3h40: package 150 + 40 min at 50 = 33.33
    const bill = price([segment(at(5, 12), at(5, 15, 40))], [base], { package: pkg });
    expect(bill.lines.map((l) => [l.coveredByPackage, l.minutes, l.amount])).toEqual([
      [true, 180, 0],
      [false, 40, 3333],
    ]);
    expect(bill.timeAmount).toBe(egp(150) + 3333);
  });

  it('charges the full package price even if the session is shorter', () => {
    const pkg = { id: 'p1', name: '3 hours', minutes: 180, price: egp(150) };
    expect(price([segment(at(5, 12), at(5, 13))], [base], { package: pkg }).total).toBe(egp(150));
  });

  it('bills package overtime at the rate in force when the package runs out', () => {
    const peak = rule({
      name: 'Peak',
      pricePerHour: egp(80),
      fromMinute: 18 * 60,
      toMinute: 1440,
      priority: 10,
    });
    const pkg = { id: 'p2', name: '2 hours', minutes: 120, price: egp(90) };
    // 17:00-19:00 covered (across the peak boundary), 19:00-20:00 peak 80
    const bill = price([segment(at(5, 17), at(5, 20))], [base, peak], { package: pkg });
    expect(bill.lines.map((l) => [l.coveredByPackage, l.minutes, l.amount])).toEqual([
      [true, 120, 0],
      [false, 60, egp(80)],
    ]);
    expect(bill.total).toBe(egp(170));
  });

  it('lets a package run across a player change', () => {
    const duo = rule({ pricePerHour: egp(60), playersMax: 2 });
    const squad = rule({ pricePerHour: egp(90), playersMin: 3 });
    const pkg = { id: 'p3', name: '1 hour', minutes: 60, price: egp(50) };
    // 40 min with 2 + 50 min with 4: the package covers 40 + 20, then 30 min at 90 = 45
    const bill = price(
      [segment(at(5, 15), at(5, 15, 40), 2), segment(at(5, 15, 40), at(5, 16, 30), 4)],
      [duo, squad],
      { package: pkg },
    );
    expect(bill.total).toBe(egp(50 + 45));
  });

  it('breaks priority ties in favour of the more specific rule', () => {
    const duo = rule({ name: 'Duo', pricePerHour: egp(40), playersMax: 2 });
    const bill = price([segment(at(5, 14), at(5, 15), 2)], [base, duo]);
    expect(bill.lines[0]!.ruleName).toBe('Duo');
  });

  it('lets a higher priority beat a more specific rule', () => {
    const duo = rule({ name: 'Duo', pricePerHour: egp(40), playersMax: 2 });
    const promo = rule({ name: 'Promo', pricePerHour: egp(20), priority: 50 });
    expect(price([segment(at(5, 14), at(5, 15), 2)], [base, duo, promo]).total).toBe(egp(20));
  });

  it('gives the same result whatever order the rules come in', () => {
    const a = rule({ name: 'A', pricePerHour: egp(40) });
    const b = rule({ name: 'B', pricePerHour: egp(45) });
    const s = [segment(at(5, 14), at(5, 15))];
    expect(price(s, [a, b]).lines[0]!.ruleName).toBe(price(s, [b, a]).lines[0]!.ruleName);
  });

  it('applies date-limited rules only on those dates', () => {
    const holiday = rule({
      name: 'Holiday',
      pricePerHour: egp(100),
      validFrom: '2026-01-07',
      validTo: '2026-01-07',
      priority: 20,
    });
    // 6 Jan 23:00 -> 7 Jan 01:00: 1h base + 1h holiday
    expect(price([segment(at(6, 23), at(7, 1))], [base, holiday]).total).toBe(egp(150));
    expect(price([segment(at(8, 10), at(8, 11))], [base, holiday]).total).toBe(egp(50));
  });

  it('reports time no rule covers instead of guessing a price', () => {
    const daytime = rule({
      name: 'Day',
      pricePerHour: egp(50),
      fromMinute: 10 * 60,
      toMinute: 22 * 60,
    });
    const bill = price([segment(at(5, 21), at(5, 23))], [daytime]);
    expect(bill.total).toBe(egp(50));
    expect(bill.uncovered).toHaveLength(1);
    expect(bill.uncovered[0]!.minutes).toBe(60);
  });

  it('ignores rules of other station types', () => {
    const pcRate = rule({ stationTypeId: PC, pricePerHour: egp(20) });
    expect(price([segment(at(5, 14), at(5, 15), 1, PC)], [base, pcRate]).total).toBe(egp(20));
  });

  it('bills real elapsed time across the spring DST jump', () => {
    // Cairo skips 00:00-01:00 on Friday 24 April 2026. 23:00 -> 02:00 on the wall is 2 real hours.
    const bill = price([segment(at(23, 23, 0, 4), at(24, 2, 0, 4))], [base]);
    expect(bill.totalMinutes).toBe(120);
    expect(bill.total).toBe(egp(100));
  });

  it('bills real elapsed time across the autumn DST change', () => {
    // On Thursday 29 Oct 2026 the clock goes from 24:00 back to 23:00: 22:00 -> 00:30 is 3.5 real hours.
    const start = at(29, 22, 0, 10);
    const end = at(30, 0, 30, 10);
    expect((end - start) / 60_000).toBe(210);
    expect(price([segment(start, end)], [base]).total).toBe(egp(175));
  });

  it('applies a rule twice when its time repeats as clocks go back', () => {
    const lastHalfHour = rule({
      name: 'Last',
      pricePerHour: egp(100),
      fromMinute: 23 * 60 + 30,
      toMinute: 1440,
      priority: 10,
    });
    // Thursday 29 Oct 2026, 23:00 (summer) -> Friday 00:00: 2 real hours, 23:00-24:00 happens twice.
    const bill = price([segment(at(29, 23, 0, 10), at(30, 0, 0, 10))], [base, lastHalfHour]);
    expect(bill.lines.map((l) => [l.ruleName, l.minutes])).toEqual([
      ['Base', 30],
      ['Last', 30],
      ['Base', 30],
      ['Last', 30],
    ]);
    expect(bill.total).toBe(egp(25 + 50 + 25 + 50));
  });

  it('adds items and subtracts a discount', () => {
    const bill = price([segment(at(5, 14), at(5, 16))], [base], {
      items: [
        { quantity: 2, unitPrice: egp(15) },
        { quantity: 1, unitPrice: egp(7.5) },
      ],
      discount: { type: 'percent', percent: 10 },
    });
    // 100 + 37.50 = 137.50, 10% = 13.75
    expect(bill.itemsAmount).toBe(egp(37.5));
    expect(bill.discountAmount).toBe(egp(13.75));
    expect(bill.total).toBe(egp(123.75));
  });

  it('never discounts below zero', () => {
    const bill = price([segment(at(5, 14), at(5, 15))], [base], {
      discount: { type: 'amount', amount: egp(500) },
    });
    expect(bill.total).toBe(0);
  });

  it('prices an empty session at zero and rejects invalid segments', () => {
    expect(price([segment(at(5, 14), at(5, 14))], [base]).total).toBe(0);
    expect(() => price([segment(at(5, 15), at(5, 14))], [base])).toThrow(RangeError);
    expect(() => price([segment(at(5, 14), at(5, 15), 0)], [base])).toThrow(RangeError);
  });
});

describe('day masks', () => {
  it('converts between day lists and masks', () => {
    expect(daysToMask([0, 6])).toBe(0b1000001);
    expect(maskToDays(ALL_DAYS)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(maskToDays(daysToMask([5, 6]))).toEqual([5, 6]);
  });
});
