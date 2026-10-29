import en from '@/lib/i18n/locales/en.json';

import {
  branchSchema,
  isTimeZone,
  organizationSchema,
  setPasswordSchema,
  signUpSchema,
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
    ];
    for (const key of keys) expect(en.validation).toHaveProperty(key);
  });
});
