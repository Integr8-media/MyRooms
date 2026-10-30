import en from '@/lib/i18n/locales/en.json';

import {
  branchSchema,
  isTimeZone,
  organizationSchema,
  packageSchema,
  rateRuleSchema,
  setPasswordSchema,
  signUpSchema,
  stationSchema,
  stationTypeSchema,
  validate,
  type ValidationKey,
} from './validation';

describe('validation', () => {
  it('normalises email and accepts a valid sign-up', () => {
    const result = validate(signUpSchema, {
      fullName: '  Mina  ',
      email: ' Owner@Example.COM ',
      password: 'secret123',
    });
    expect(result).toEqual({
      ok: true,
      data: { fullName: 'Mina', email: 'owner@example.com', password: 'secret123' },
      errors: {},
    });
  });

  it('reports one error key per field', () => {
    const result = validate(signUpSchema, { fullName: ' ', email: 'nope', password: 'short' });
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual({
      fullName: 'required',
      email: 'invalidEmail',
      password: 'passwordTooShort',
    });
  });

  it('checks that passwords match', () => {
    expect(
      validate(setPasswordSchema, { password: 'secret123', confirm: 'secret124' }).errors,
    ).toEqual({ confirm: 'passwordsDontMatch' });
  });

  it('turns empty optional branch fields into null', () => {
    const result = validate(branchSchema, { name: 'Nasr City', address: ' ', phone: '0100' });
    expect(result.data).toEqual({ name: 'Nasr City', address: null, phone: '0100' });
    expect(
      validate(branchSchema, { name: 'x', address: 'a'.repeat(301), phone: '' }).errors,
    ).toEqual({ address: 'tooLong' });
  });

  it('validates time zones', () => {
    expect(isTimeZone('Africa/Cairo')).toBe(true);
    expect(isTimeZone('Mars/Olympus')).toBe(false);
    expect(validate(organizationSchema, { name: 'Arena', timezone: 'Nowhere' }).errors).toEqual({
      timezone: 'invalidTimezone',
    });
  });

  it('every validation key has a translation', () => {
    const keys: ValidationKey[] = [
      'required',
      'tooLong',
      'invalidEmail',
      'passwordTooShort',
      'passwordsDontMatch',
      'invalidTimezone',
      'invalidAmount',
      'invalidTime',
      'invalidDate',
      'outOfRange',
      'minAboveMax',
      'endBeforeStart',
      'sameTimes',
      'chooseDays',
    ];
    for (const key of keys) expect(en.validation).toHaveProperty(key);
  });

  describe('rate rules', () => {
    const valid = {
      name: ' Peak ',
      price: '62.50',
      playersMin: '',
      playersMax: '',
      days: [5, 6],
      allDay: false,
      from: '18:00',
      to: '02:00',
      priority: '10',
      validFrom: '',
      validTo: '',
    };

    it('turns form text into database values', () => {
      expect(validate(rateRuleSchema, valid).data).toEqual({
        name: 'Peak',
        pricePerHour: 6250,
        playersMin: null,
        playersMax: null,
        daysOfWeek: 0b1100000,
        fromMinute: 1080,
        toMinute: 120,
        priority: 10,
        validFrom: null,
        validTo: null,
      });
    });

    it('drops the time window for all-day rules', () => {
      const data = validate(rateRuleSchema, { ...valid, allDay: true, from: 'x' }).data!;
      expect([data.fromMinute, data.toMinute]).toEqual([null, null]);
    });

    it('treats an end of 00:00 as midnight', () => {
      expect(validate(rateRuleSchema, { ...valid, to: '00:00' }).data!.toMinute).toBe(1440);
    });

    it('reports every bad field', () => {
      expect(
        validate(rateRuleSchema, {
          ...valid,
          price: 'abc',
          playersMin: '4',
          playersMax: '2',
          days: [],
          from: '25:00',
          priority: '5000',
          validFrom: '2026-02-01',
          validTo: '2026-01-01',
        }).errors,
      ).toEqual({
        price: 'invalidAmount',
        playersMax: 'minAboveMax',
        days: 'chooseDays',
        from: 'invalidTime',
        priority: 'outOfRange',
        validTo: 'endBeforeStart',
      });
    });

    it('rejects a window that starts and ends at the same time', () => {
      expect(validate(rateRuleSchema, { ...valid, from: '00:00', to: '24:00' }).errors).toEqual({
        to: 'sameTimes',
      });
    });

    it('rejects negative prices and impossible dates', () => {
      expect(validate(rateRuleSchema, { ...valid, price: '-5' }).errors).toEqual({
        price: 'outOfRange',
      });
      expect(validate(rateRuleSchema, { ...valid, validFrom: '2026-02-30' }).errors).toEqual({
        validFrom: 'invalidDate',
      });
    });
  });

  it('validates station types, stations and packages', () => {
    expect(
      validate(stationTypeSchema, { name: 'PS5', kind: 'ps_room', maxPlayers: '٤', color: null })
        .data,
    ).toEqual({ name: 'PS5', kind: 'ps_room', maxPlayers: 4, color: null });
    expect(
      validate(stationTypeSchema, { name: 'PS5', kind: 'ps_room', maxPlayers: '20', color: null })
        .errors,
    ).toEqual({ maxPlayers: 'outOfRange' });
    expect(
      validate(stationSchema, { name: 'PC', stationTypeId: '', notes: ' ', count: '100' }).errors,
    ).toEqual({ stationTypeId: 'required', count: 'outOfRange' });
    expect(
      validate(packageSchema, { name: '3 hours', duration: '3:00', price: '150' }).data,
    ).toEqual({ name: '3 hours', duration: 180, price: 15000 });
    expect(validate(packageSchema, { name: 'x', duration: '0:00', price: '1' }).errors).toEqual({
      duration: 'outOfRange',
    });
  });
});
