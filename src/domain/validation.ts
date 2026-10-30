import { z } from 'zod';

import { parsePounds, type Piasters } from './money';
import { parseClock, parseDateKey } from './zoned-time';

/**
 * Form rules. Error messages are translation keys under `validation.*`.
 * Limits match the database checks in supabase/migrations.
 */
export const PASSWORD_MIN_LENGTH = 8;

const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'required')
  .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, 'invalidEmail');

const name = z.string().trim().min(1, 'required').max(100, 'tooLong');
const newPassword = z.string().min(PASSWORD_MIN_LENGTH, 'passwordTooShort');

export const signInSchema = z.object({ email, password: z.string().min(1, 'required') });

export const signUpSchema = z.object({ fullName: name, email, password: newPassword });

export const forgotPasswordSchema = z.object({ email });

export const setPasswordSchema = z
  .object({ password: newPassword, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: 'passwordsDontMatch', path: ['confirm'] });

export const organizationSchema = z.object({
  name,
  timezone: z.string().trim().min(1, 'required').refine(isTimeZone, 'invalidTimezone'),
});

export const createOrganizationSchema = z.object({ name, branchName: name });

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, 'tooLong')
    .transform((v) => (v === '' ? null : v));

export const branchSchema = z.object({
  name,
  address: optionalText(300),
  phone: optionalText(30),
});

export const inviteSchema = z.object({ email });

export const profileSchema = z.object({ fullName: name });

// ---------------------------------------------------------------------------
// Stations and pricing (Phase 2). Form fields are strings; schemas turn them into
// database values (piasters, minutes after midnight, "YYYY-MM-DD").
// ---------------------------------------------------------------------------

/** Most a price can be (100,000 EGP), as in the database check. */
export const MAX_PRICE: Piasters = 10_000_000;
export const MAX_PLAYERS = 16;

const toNumber = (s: string) =>
  Number(s.trim().replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)));

/** A whole number in [min, max] typed as text. */
const intField = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(1, 'required')
    .transform((s, ctx) => {
      const n = toNumber(s);
      if (!Number.isInteger(n) || n < min || n > max) {
        ctx.addIssue({ code: 'custom', message: 'outOfRange' });
        return z.NEVER;
      }
      return n;
    });

const optionalIntField = (min: number, max: number) =>
  z.string().transform((s, ctx) => {
    if (s.trim() === '') return null;
    const n = toNumber(s);
    if (!Number.isInteger(n) || n < min || n > max) {
      ctx.addIssue({ code: 'custom', message: 'outOfRange' });
      return z.NEVER;
    }
    return n;
  });

/** An amount in pounds typed as text ("60", "62.50") -> piasters. */
const priceField = z
  .string()
  .trim()
  .min(1, 'required')
  .transform((s, ctx) => {
    let piasters: number;
    try {
      piasters = parsePounds(s);
    } catch {
      ctx.addIssue({ code: 'custom', message: 'invalidAmount' });
      return z.NEVER;
    }
    if (piasters < 0 || piasters > MAX_PRICE) {
      ctx.addIssue({ code: 'custom', message: 'outOfRange' });
      return z.NEVER;
    }
    return piasters;
  });

/** "HH:MM" -> minutes after midnight (0-1440). */
const clockField = z
  .string()
  .trim()
  .min(1, 'required')
  .transform((s, ctx) => {
    const minutes = parseClock(s);
    if (minutes === null) {
      ctx.addIssue({ code: 'custom', message: 'invalidTime' });
      return z.NEVER;
    }
    return minutes;
  });

function toDateKey(s: string): string | null {
  const date = parseDateKey(s);
  if (!date) return null;
  return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
}

/** "YYYY-MM-DD" (Arabic-Indic digits allowed), normalised. */
const dateField = z
  .string()
  .trim()
  .min(1, 'required')
  .transform((s, ctx) => {
    const key = toDateKey(s);
    if (!key) {
      ctx.addIssue({ code: 'custom', message: 'invalidDate' });
      return z.NEVER;
    }
    return key;
  });

/** Empty = no date. */
const optionalDateField = z.string().transform((s, ctx) => {
  if (s.trim() === '') return null;
  const key = toDateKey(s);
  if (!key) {
    ctx.addIssue({ code: 'custom', message: 'invalidDate' });
    return z.NEVER;
  }
  return key;
});

export const STATION_KINDS = ['pc_desk', 'ps_room'] as const;
export type StationKind = (typeof STATION_KINDS)[number];

export const stationTypeSchema = z.object({
  name,
  kind: z.enum(STATION_KINDS),
  maxPlayers: intField(1, MAX_PLAYERS),
  color: z
    .string()
    .nullable()
    .refine((c) => c === null || /^#[0-9a-fA-F]{6}$/.test(c), 'required'),
});

export const stationSchema = z.object({
  name: z.string().trim().min(1, 'required').max(50, 'tooLong'),
  stationTypeId: z.string().min(1, 'required'),
  notes: optionalText(500),
  /** New stations only: add several at once ("PC 1" ... "PC 10"). */
  count: intField(1, 50),
});

/**
 * Every field is checked in one pass (rather than per field) so the cross-field errors,
 * like min above max, show up together with the others.
 */
export const rateRuleSchema = z
  .object({
    name: z.string(),
    price: z.string(),
    playersMin: z.string(),
    playersMax: z.string(),
    days: z.array(z.number().int().min(0).max(6)),
    allDay: z.boolean(),
    from: z.string(),
    to: z.string(),
    priority: z.string(),
    validFrom: z.string(),
    validTo: z.string(),
  })
  .transform((v, ctx) => {
    const take = <T>(schema: z.ZodType<T>, field: keyof typeof v): T | undefined => {
      const result = schema.safeParse(v[field]);
      if (result.success) return result.data;
      ctx.addIssue({ code: 'custom', message: result.error.issues[0]!.message, path: [field] });
      return undefined;
    };
    const name = take(optionalText(60), 'name');
    const pricePerHour = take(priceField, 'price');
    const playersMin = take(optionalIntField(1, MAX_PLAYERS), 'playersMin');
    const playersMax = take(optionalIntField(1, MAX_PLAYERS), 'playersMax');
    const priority = take(intField(-1000, 1000), 'priority');
    const validFrom = take(optionalDateField, 'validFrom');
    const validTo = take(optionalDateField, 'validTo');

    if (v.days.length === 0)
      ctx.addIssue({ code: 'custom', message: 'chooseDays', path: ['days'] });
    if (playersMin != null && playersMax != null && playersMin > playersMax) {
      ctx.addIssue({ code: 'custom', message: 'minAboveMax', path: ['playersMax'] });
    }
    if (validFrom && validTo && validFrom > validTo) {
      ctx.addIssue({ code: 'custom', message: 'endBeforeStart', path: ['validTo'] });
    }

    let fromMinute: number | null = null;
    let toMinute: number | null = null;
    if (!v.allDay) {
      const from = take(clockField, 'from');
      const to = take(clockField, 'to');
      if (from !== undefined && to !== undefined) {
        // 24:00 is only valid as an end, and an end of 00:00 means midnight.
        fromMinute = from % 1440;
        toMinute = to === 0 ? 1440 : to;
        if (fromMinute === toMinute % 1440) {
          ctx.addIssue({ code: 'custom', message: 'sameTimes', path: ['to'] });
        }
      }
    }
    return {
      name: name ?? null,
      pricePerHour: pricePerHour ?? 0,
      playersMin: playersMin ?? null,
      playersMax: playersMax ?? null,
      daysOfWeek: v.days.reduce((mask, d) => mask | (1 << d), 0),
      fromMinute,
      toMinute,
      priority: priority ?? 0,
      validFrom: validFrom ?? null,
      validTo: validTo ?? null,
    };
  });

export const packageSchema = z.object({
  name: z.string().trim().min(1, 'required').max(60, 'tooLong'),
  /** "H:MM", e.g. "3:00". */
  duration: clockField.refine((m) => m > 0, 'outOfRange'),
  price: priceField,
});

export const pricePreviewSchema = z.object({
  stationTypeId: z.string().min(1, 'required'),
  players: intField(1, MAX_PLAYERS),
  startDate: dateField,
  startTime: clockField,
  endDate: dateField,
  endTime: clockField,
  packageId: z.string().nullable(),
});

export type ValidationKey =
  | 'required'
  | 'tooLong'
  | 'invalidEmail'
  | 'passwordTooShort'
  | 'passwordsDontMatch'
  | 'invalidTimezone'
  | 'invalidAmount'
  | 'invalidTime'
  | 'invalidDate'
  | 'outOfRange'
  | 'minAboveMax'
  | 'endBeforeStart'
  | 'sameTimes'
  | 'chooseDays';

export type FieldErrors<T> = Partial<Record<keyof T, ValidationKey>>;

export type ValidationResult<T> =
  | { ok: true; data: T; errors: FieldErrors<T> }
  | { ok: false; data?: undefined; errors: FieldErrors<T> };

/** Validate form values; returns parsed data or the first error key per field. */
export function validate<S extends z.ZodType>(
  schema: S,
  values: z.input<S>,
): ValidationResult<z.output<S>> {
  const result = schema.safeParse(values);
  if (result.success) return { ok: true, data: result.data, errors: {} };
  const errors: Record<string, ValidationKey> = {};
  for (const issue of result.error.issues) {
    const field = String(issue.path[0] ?? '');
    errors[field] ??= issue.message as ValidationKey;
  }
  return { ok: false, errors: errors as FieldErrors<z.output<S>> };
}

export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
