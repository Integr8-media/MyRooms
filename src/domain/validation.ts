import { z } from 'zod';

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

export type ValidationKey =
  | 'required'
  | 'tooLong'
  | 'invalidEmail'
  | 'passwordTooShort'
  | 'passwordsDontMatch'
  | 'invalidTimezone';

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
