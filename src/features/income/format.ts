import type { DateRange } from '@/domain/income';
import { parseTimestamp } from '@/domain/sessions';
import { dateKey, formatClock, parseDateKey, toLocal } from '@/domain/zoned-time';

/** "Mon, 5 Jan" for a local date key. Formatted in UTC so the device's own zone never shifts it. */
export function formatDateKey(key: string, locale: string, withYear = false): string {
  const d = parseDateKey(key);
  if (!d) return key;
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  }).format(Date.UTC(d.year, d.month - 1, d.day));
}

/** "Mon, 5 Jan 2026" or "Sat, 3 Jan – Fri, 9 Jan 2026". */
export function formatRange(range: Pick<DateRange, 'fromDate' | 'toDate'>, locale: string) {
  if (range.fromDate === range.toDate) return formatDateKey(range.fromDate, locale, true);
  const sameYear = range.fromDate.slice(0, 4) === range.toDate.slice(0, 4);
  return `${formatDateKey(range.fromDate, locale, !sameYear)} – ${formatDateKey(range.toDate, locale, true)}`;
}

/** "14:05" in the org's time zone, or "—". */
export function localClock(value: string | null | undefined, timeZone: string): string {
  const instant = parseTimestamp(value);
  if (instant == null) return '—';
  const l = toLocal(instant, timeZone);
  return formatClock(l.hour * 60 + l.minute);
}

/** "Mon, 5 Jan 2026 14:05" in the org's time zone, or "—". */
export function localDateTime(
  value: string | null | undefined,
  timeZone: string,
  locale: string,
): string {
  const instant = parseTimestamp(value);
  if (instant == null) return '—';
  const l = toLocal(instant, timeZone);
  return `${formatDateKey(dateKey(l), locale, true)} ${formatClock(l.hour * 60 + l.minute)}`;
}
