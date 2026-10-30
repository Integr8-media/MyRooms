/**
 * Turns errors from Supabase Auth, our database functions and the network into
 * translation keys under `errors.*` in the locale files.
 */
export const ERROR_KEYS = [
  // Raised by our database functions (supabase/migrations), by name.
  'not_authenticated',
  'not_allowed',
  'already_member',
  'already_invited',
  'branches_required',
  'invalid_branch',
  'invitation_not_found',
  'invitation_used',
  'invitation_expired',
  'email_not_confirmed',
  'last_owner',
  'invalid_timezone',
  'invalid_station_type',
  'invalid_station',
  'station_unavailable',
  'station_busy',
  'invalid_session',
  'session_closed',
  'invalid_package',
  'too_many_players',
  'booking_conflict',
  'too_early',
  'session_not_ended',
  'invalid_bill',
  'bill_void',
  'bill_has_payments',
  'invalid_discount',
  'invalid_amount',
  'reason_required',
  'invalid_customer',
  'invalid_product',
  'invalid_quantity',
  // Supabase Auth error codes.
  'invalid_credentials',
  'email_exists',
  'weak_password',
  'same_password',
  'otp_expired',
  // Grouped.
  'rate_limited',
  'network',
  'not_configured',
  'unknown',
] as const;

export type ErrorKey = (typeof ERROR_KEYS)[number];

const ALIASES: Record<string, ErrorKey> = {
  user_already_exists: 'email_exists',
  over_email_send_rate_limit: 'rate_limited',
  over_request_rate_limit: 'rate_limited',
  access_denied: 'otp_expired',
  // Postgres exclusion violation: the no-double-booking constraint on reservations.
  '23P01': 'booking_conflict',
};

function isErrorKey(value: unknown): value is ErrorKey {
  return ERROR_KEYS.includes(value as ErrorKey);
}

export function errorKey(error: unknown): ErrorKey {
  if (!error || typeof error !== 'object') return 'unknown';
  const { code, message, name } = error as { code?: unknown; message?: unknown; name?: unknown };

  // Database functions raise `exception '<key>'`; the key arrives as the message.
  if (isErrorKey(message)) return message;
  if (typeof code === 'string') {
    if (isErrorKey(code)) return code;
    if (code in ALIASES) return ALIASES[code]!;
  }
  if (
    name === 'AuthRetryableFetchError' ||
    (typeof message === 'string' &&
      /network request failed|failed to fetch|load failed/i.test(message))
  ) {
    return 'network';
  }
  if (typeof message === 'string' && /not configured/i.test(message)) return 'not_configured';
  return 'unknown';
}
