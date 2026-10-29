import en from '@/lib/i18n/locales/en.json';

import { ERROR_KEYS, errorKey } from './errors';

describe('errorKey', () => {
  it('maps database function errors by message', () => {
    expect(errorKey({ code: '42501', message: 'not_allowed' })).toBe('not_allowed');
    expect(errorKey({ code: '23514', message: 'last_owner' })).toBe('last_owner');
  });

  it('maps Supabase Auth codes and aliases', () => {
    expect(errorKey({ code: 'invalid_credentials', message: 'Invalid login credentials' })).toBe(
      'invalid_credentials',
    );
    expect(errorKey({ code: 'user_already_exists' })).toBe('email_exists');
    expect(errorKey({ code: 'over_email_send_rate_limit' })).toBe('rate_limited');
  });

  it('recognises network failures', () => {
    expect(errorKey(new TypeError('Network request failed'))).toBe('network');
    expect(errorKey({ name: 'AuthRetryableFetchError', message: '' })).toBe('network');
  });

  it('falls back to unknown', () => {
    expect(errorKey(null)).toBe('unknown');
    expect(errorKey({ code: '42P01', message: 'relation does not exist' })).toBe('unknown');
  });

  it('every key has a translation', () => {
    for (const key of ERROR_KEYS) expect(en.errors).toHaveProperty(key);
  });
});
