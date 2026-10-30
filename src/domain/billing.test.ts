import {
  amountDue,
  billFromDetails,
  billStatus,
  billTotal,
  changeDue,
  computeFinalBill,
  discountError,
  netPaid,
  overpaid,
  parseBillDetails,
  paymentError,
  percentDiscount,
  rateRuleFromRow,
  refundError,
  segmentFromRow,
} from './billing';
import type { RateRule } from './pricing';

const TZ = 'Africa/Cairo';
// Monday 5 Jan 2026, 14:00 in Cairo (UTC+2).
const T0 = Date.UTC(2026, 0, 5, 12, 0);
const min = (m: number) => T0 + m * 60_000;

const rules: RateRule[] = [
  rateRuleFromRow({ id: 'base', station_type_id: 'ps5', price_per_hour: 6000, days_of_week: 127 }),
  rateRuleFromRow({
    id: 'four',
    station_type_id: 'ps5',
    name: '4 players',
    price_per_hour: 9000,
    days_of_week: 127,
    players_min: 3,
    priority: 10,
  }),
];

describe('computeFinalBill', () => {
  it('prices every segment of a completed session (player change mid-session)', () => {
    const bill = computeFinalBill({
      segments: [
        { stationTypeId: 'ps5', players: 2, startedAt: min(0), endedAt: min(60) },
        { stationTypeId: 'ps5', players: 4, startedAt: min(60), endedAt: min(90) },
      ],
      sessionStart: min(0),
      sessionEnd: min(90),
      rules,
      timeZone: TZ,
    });
    // 60 min at 60 EGP + 30 min at 90 EGP
    expect(bill.timeAmount).toBe(6000 + 4500);
    expect(bill.details.totalMinutes).toBe(90);
    expect(bill.details.lines.map((l) => l.ruleId)).toEqual(['base', 'four']);
    expect(bill.details.gapMinutes).toBe(0);
    expect(bill.details.uncoveredMinutes).toBe(0);
  });

  it('charges a segment still marked running up to the session end, never after it', () => {
    const bill = computeFinalBill({
      segments: [{ stationTypeId: 'ps5', players: 1, startedAt: min(0), endedAt: null }],
      sessionStart: min(0),
      sessionEnd: min(30),
      rules,
      timeZone: TZ,
    });
    expect(bill.timeAmount).toBe(3000);
    const late = computeFinalBill({
      segments: [{ stationTypeId: 'ps5', players: 1, startedAt: min(0), endedAt: min(45) }],
      sessionStart: min(0),
      sessionEnd: min(30),
      rules,
      timeZone: TZ,
    });
    expect(late.timeAmount).toBe(3000);
  });

  it('reports gaps (time with no segment) and time no rule priced', () => {
    const bill = computeFinalBill({
      segments: [
        { stationTypeId: 'ps5', players: 1, startedAt: min(0), endedAt: min(30) },
        { stationTypeId: 'pc', players: 1, startedAt: min(40), endedAt: min(60) },
      ],
      sessionStart: min(0),
      sessionEnd: min(60),
      rules,
      timeZone: TZ,
    });
    expect(bill.timeAmount).toBe(3000);
    expect(bill.details.gapMinutes).toBe(10);
    expect(bill.details.uncoveredMinutes).toBe(20);
  });

  it('a package covers its minutes; overtime is charged at the rate', () => {
    const bill = computeFinalBill({
      segments: [{ stationTypeId: 'ps5', players: 1, startedAt: min(0), endedAt: min(150) }],
      sessionStart: min(0),
      sessionEnd: min(150),
      rules,
      package: { id: 'p2', name: '2 hours', minutes: 120, price: 10000 },
      timeZone: TZ,
    });
    expect(bill.timeAmount).toBe(10000 + 3000);
    expect(bill.details.package?.id).toBe('p2');
  });

  it('details survive a JSON round trip and rebuild the breakdown', () => {
    const { details, timeAmount } = computeFinalBill({
      segments: [{ stationTypeId: 'ps5', players: 1, startedAt: min(0), endedAt: min(60) }],
      sessionStart: min(0),
      sessionEnd: min(60),
      rules,
      timeZone: TZ,
    });
    const parsed = parseBillDetails(JSON.stringify(details));
    expect(parsed).toEqual(details);
    const bill = billFromDetails(parsed!, {
      timeAmount,
      itemsAmount: 0,
      discountAmount: 1000,
    });
    expect(bill.total).toBe(5000);
    expect(bill.lines).toHaveLength(1);
    expect(parseBillDetails('not json')).toBeNull();
    expect(parseBillDetails(null)).toBeNull();
    expect(parseBillDetails({ lines: 'x' })).toBeNull();
  });
});

describe('rows', () => {
  it('reads segments from device ISO and Postgres text timestamps', () => {
    expect(
      segmentFromRow({
        station_type_id: 'ps5',
        players: 3,
        started_at: '2026-01-05 12:00:00.123456+00',
        ended_at: null,
      }),
    ).toEqual({ stationTypeId: 'ps5', players: 3, startedAt: T0 + 123, endedAt: null });
    expect(
      segmentFromRow({ station_type_id: null, started_at: '2026-01-05T12:00:00Z' }),
    ).toBeNull();
    expect(segmentFromRow({ station_type_id: 'ps5', started_at: 'garbage' })).toBeNull();
  });

  it('keeps only the date part of rule dates', () => {
    const rule = rateRuleFromRow({ id: 'r', valid_from: '2026-01-01T00:00:00', valid_to: null });
    expect(rule.validFrom).toBe('2026-01-01');
    expect(rule.validTo).toBeNull();
  });
});

describe('money on a bill', () => {
  it('nets refunds against payments', () => {
    expect(
      netPaid([
        { kind: 'payment', amount: 5000 },
        { kind: 'payment', amount: 3000 },
        { kind: 'refund', amount: 1000 },
      ]),
    ).toBe(7000);
    expect(netPaid([])).toBe(0);
  });

  it('status follows the server rule', () => {
    expect(billStatus(10000, 0, false)).toBe('open');
    expect(billStatus(10000, 4000, false)).toBe('partially_paid');
    expect(billStatus(10000, 10000, false)).toBe('paid');
    expect(billStatus(10000, 12000, false)).toBe('paid');
    expect(billStatus(0, 0, false)).toBe('paid');
    expect(billStatus(10000, 10000, true)).toBe('void');
  });

  it('due, overpaid and change', () => {
    expect(amountDue(10000, 4000)).toBe(6000);
    expect(amountDue(10000, 12000)).toBe(0);
    expect(overpaid(10000, 12000)).toBe(2000);
    expect(overpaid(10000, 4000)).toBe(0);
    expect(changeDue(20000, 13500)).toBe(6500);
    expect(changeDue(10000, 13500)).toBe(0);
    expect(billTotal({ timeAmount: 10000, itemsAmount: 2500, discountAmount: 500 })).toBe(12000);
  });

  it('percent discounts round to the piaster and never exceed the subtotal', () => {
    expect(percentDiscount(10050, 10)).toBe(1005);
    expect(percentDiscount(999, 15)).toBe(150);
    expect(percentDiscount(10000, 150)).toBe(10000);
    expect(percentDiscount(10000, -5)).toBe(0);
  });

  it('validates payments, refunds and discounts', () => {
    expect(paymentError(5000, 6000)).toBeNull();
    expect(paymentError(6000, 6000)).toBeNull();
    expect(paymentError(6001, 6000)).toBe('invalid_amount');
    expect(paymentError(0, 6000)).toBe('invalid_amount');
    expect(paymentError(10.5, 6000)).toBe('invalid_amount');
    expect(refundError(1000, 5000, 'Overcharged')).toBeNull();
    expect(refundError(1000, 5000, '  ')).toBe('reason_required');
    expect(refundError(6000, 5000, 'x')).toBe('invalid_amount');
    expect(discountError(0, 5000)).toBeNull();
    expect(discountError(5000, 5000)).toBeNull();
    expect(discountError(5001, 5000)).toBe('invalid_discount');
    expect(discountError(-1, 5000)).toBe('invalid_discount');
  });
});
