import { DEFAULT_WEEK_START } from '@/domain/income';

/** Weekdays in display order, starting on the first day of the week (0 = Sunday). */
export const WEEK_ORDER = Array.from({ length: 7 }, (_, i) => (DEFAULT_WEEK_START + i) % 7);

/** "Mon" / "الاثنين" for a weekday (0 = Sunday). 4 Jan 2026 was a Sunday. */
export function weekdayName(weekday: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(
    Date.UTC(2026, 0, 4 + weekday),
  );
}

/** A whole percent: 25 -> "25%" / "٢٥٪". */
export function formatPercent(pct: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(
    pct / 100,
  );
}

/** A change in percent with its sign: "+25%", "-10%", "0%". */
export function formatChange(pct: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    maximumFractionDigits: 0,
    signDisplay: 'exceptZero',
  }).format(pct / 100);
}

/** A number with at most one decimal: 1.75 -> "1.8". */
export function formatDecimal(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
}

/** Milliseconds as hours with at most one decimal. */
export function formatHours(ms: number, locale: string): string {
  return formatDecimal(ms / 3_600_000, locale);
}
