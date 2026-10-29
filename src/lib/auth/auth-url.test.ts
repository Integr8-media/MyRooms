import { needsNewPassword, parseAuthUrl } from './auth-url';

describe('parseAuthUrl', () => {
  it('reads tokens and type from the fragment', () => {
    const link = parseAuthUrl(
      'myrooms://set-password#access_token=abc&refresh_token=def&expires_in=3600&type=recovery',
    );
    expect(link).toEqual({ accessToken: 'abc', refreshToken: 'def', type: 'recovery' });
    expect(needsNewPassword(link)).toBe(true);
  });

  it('reads errors from the query string or fragment', () => {
    expect(
      parseAuthUrl('https://app.example.com/?error=access_denied&error_code=otp_expired')
        ?.errorCode,
    ).toBe('otp_expired');
    expect(parseAuthUrl('https://app.example.com/#error=access_denied')?.errorCode).toBe(
      'access_denied',
    );
  });

  it('ignores ordinary URLs', () => {
    expect(parseAuthUrl('https://app.example.com/settings?tab=staff')).toBeNull();
    expect(parseAuthUrl('myrooms://')).toBeNull();
  });

  it('only recovery and invite links ask for a new password', () => {
    expect(needsNewPassword(parseAuthUrl('x://#access_token=a&type=invite'))).toBe(true);
    expect(needsNewPassword(parseAuthUrl('x://#access_token=a&type=signup'))).toBe(false);
    expect(needsNewPassword(null)).toBe(false);
  });
});
