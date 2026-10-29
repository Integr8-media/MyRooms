import type { TFunction } from 'i18next';

import { formatMoney } from '@/domain/money';
import { ALL_DAYS, maskToDays, type RateRule } from '@/domain/pricing';
import { formatClock } from '@/domain/zoned-time';

/** Sunday-first day numbers (0-6), as used in rate rule masks. */
export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

/** Localized day name; 4 Jan 2026 was a Sunday. */
export function weekdayName(day: number, locale: string, width: 'short' | 'long' = 'short') {
  return new Intl.DateTimeFormat(locale, { weekday: width, timeZone: 'UTC' }).format(
    Date.UTC(2026, 0, 4 + day),
  );
}

export function formatDays(mask: number, locale: string, t: TFunction): string {
  if (mask === ALL_DAYS) return t('pricing.everyDay');
  return maskToDays(mask)
    .map((d) => weekdayName(d, locale))
    .join(locale.startsWith('ar') ? '، ' : ', ');
}

export function formatWindow(rule: Pick<RateRule, 'fromMinute' | 'toMinute'>, t: TFunction) {
  if (rule.fromMinute == null || rule.toMinute == null) return t('pricing.allDay');
  const range = `${formatClock(rule.fromMinute)}–${formatClock(rule.toMinute)}`;
  return rule.toMinute <= rule.fromMinute ? t('pricing.overnight', { range }) : range;
}

export function formatPlayers(rule: Pick<RateRule, 'playersMin' | 'playersMax'>, t: TFunction) {
  const { playersMin: min, playersMax: max } = rule;
  if (min == null && max == null) return null;
  if (min != null && max != null) {
    return min === max
      ? t('pricing.playersExact', { count: min })
      : t('pricing.playersRange', { min, max });
  }
  return min != null
    ? t('pricing.playersAtLeast', { count: min })
    : t('pricing.playersAtMost', { count: max! });
}

export function formatDuration(minutes: number, t: TFunction): string {
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h && m) return t('pricing.hoursMinutes', { h, m });
  if (h) return t('pricing.hours', { count: h });
  return t('pricing.minutes', { count: m });
}

export function formatPerHour(price: number, locale: string, t: TFunction) {
  return t('pricing.perHour', { price: formatMoney(price, locale) });
}

/** One line describing when a rule applies, e.g. "Fri, Sat · 18:00–24:00 · 3–4 players". */
export function ruleConditions(rule: RateRule, locale: string, t: TFunction): string {
  const parts = [formatDays(rule.daysOfWeek, locale, t), formatWindow(rule, t)];
  const players = formatPlayers(rule, t);
  if (players) parts.push(players);
  if (rule.validFrom || rule.validTo) {
    parts.push(t('pricing.validRange', { from: rule.validFrom ?? '…', to: rule.validTo ?? '…' }));
  }
  return parts.join(' · ');
}
