import { assertPiasters, chargeForMinutes, formatMoney, parsePounds } from './money';

describe('parsePounds', () => {
  it.each([
    ['12', 1200],
    ['12.5', 1250],
    ['12.05', 1205],
    ['12,50', 1250],
    ['١٢٫٥٠', 1250], // Arabic decimal separator
    ['0.01', 1],
    ['-3.5', -350],
    [' 7 ', 700],
    ['١٢.٥', 1250], // Arabic-Indic digits
  ])('parses %p as %p piasters', (input, expected) => {
    expect(parsePounds(input)).toBe(expected);
  });

  it.each(['', 'abc', '1.234', '1.2.3', '.5'])('rejects %p', (input) => {
    expect(() => parsePounds(input)).toThrow(RangeError);
  });
});

describe('chargeForMinutes', () => {
  it('charges a full hour at the hourly rate', () => {
    expect(chargeForMinutes(60, 5000)).toBe(5000);
  });

  it('charges proportionally per minute', () => {
    expect(chargeForMinutes(90, 5000)).toBe(7500);
    expect(chargeForMinutes(1, 5000)).toBe(83); // 83.33 → 83
    expect(chargeForMinutes(2, 5000)).toBe(167); // 166.67 → 167
  });

  it('is zero for zero minutes', () => {
    expect(chargeForMinutes(0, 5000)).toBe(0);
  });

  it('rejects fractional rates and negative minutes', () => {
    expect(() => chargeForMinutes(10, 50.5)).toThrow(RangeError);
    expect(() => chargeForMinutes(-1, 5000)).toThrow(RangeError);
  });
});

describe('assertPiasters', () => {
  it('accepts integers and rejects floats', () => {
    expect(() => assertPiasters(100)).not.toThrow();
    expect(() => assertPiasters(0.1 + 0.2)).toThrow(RangeError);
  });
});

describe('formatMoney', () => {
  it('formats piasters as EGP', () => {
    expect(formatMoney(1250, 'en')).toContain('12.50');
  });
});
