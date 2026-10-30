/**
 * Wall-clock time in an IANA time zone (e.g. Africa/Cairo), using only Intl.
 * All instants are UTC epoch milliseconds. Pure: no React, safe for the server.
 */

export type LocalDateTime = {
  year: number;
  /** 1-12 */
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
  /** 0 = Sunday ... 6 = Saturday */
  weekday: number;
};

export const MINUTE_MS = 60_000;
export const MINUTES_PER_DAY = 1440;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** The wall clock straight from Intl (exact, but slow: about 10-30 µs a call). */
function intlLocal(instant: number, timeZone: string): LocalDateTime {
  const parts: Record<string, number> = {};
  for (const p of formatter(timeZone).formatToParts(new Date(instant))) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value);
  }
  const { year, month, day, minute, second } = parts as Record<string, number>;
  const hour = parts.hour === 24 ? 0 : parts.hour!; // some engines print midnight as 24
  return {
    year: year!,
    month: month!,
    day: day!,
    hour,
    minute: minute!,
    second: second!,
    millisecond: ((instant % 1000) + 1000) % 1000,
    weekday: new Date(Date.UTC(year!, month! - 1, day!)).getUTCDay(),
  };
}

function intlOffset(instant: number, timeZone: string): number {
  const l = intlLocal(instant, timeZone);
  const wall = Date.UTC(l.year, l.month - 1, l.day, l.hour, l.minute, l.second, l.millisecond);
  return wall - instant;
}

/**
 * Reports and the live floor convert many thousands of instants, so the offset is cached
 * per hour of UTC time. An hour is only cached when the offset is the same at its first and
 * last millisecond (offsets change at most once in months, so then it is the same all
 * through); the hour of a DST change returns null and is worked out exactly each time.
 */
const HOUR_MS = 3_600_000;
const MAX_CACHED_HOURS = 100_000;
const hourOffsets = new Map<string, number | null>();

// Instants usually come in time order, so the previous hour is the most likely hit.
let lastZone = '';
let lastHour = NaN;
let lastOffset: number | null = null;

function cachedOffset(instant: number, timeZone: string): number | null {
  const hour = Math.floor(instant / HOUR_MS);
  if (hour === lastHour && timeZone === lastZone) return lastOffset;
  const key = `${timeZone}|${hour}`;
  let offset = hourOffsets.get(key);
  if (offset === undefined) {
    const first = intlOffset(hour * HOUR_MS, timeZone);
    const last = intlOffset(hour * HOUR_MS + HOUR_MS - 1, timeZone);
    offset = first === last ? first : null;
    if (hourOffsets.size >= MAX_CACHED_HOURS) hourOffsets.clear();
    hourOffsets.set(key, offset);
  }
  lastZone = timeZone;
  lastHour = hour;
  lastOffset = offset;
  return offset;
}

/** The wall-clock date and time at `instant` in `timeZone`. */
export function toLocal(instant: number, timeZone: string): LocalDateTime {
  const offset = cachedOffset(instant, timeZone);
  if (offset == null) return intlLocal(instant, timeZone);
  const wall = new Date(instant + offset);
  return {
    year: wall.getUTCFullYear(),
    month: wall.getUTCMonth() + 1,
    day: wall.getUTCDate(),
    hour: wall.getUTCHours(),
    minute: wall.getUTCMinutes(),
    second: wall.getUTCSeconds(),
    millisecond: wall.getUTCMilliseconds(),
    weekday: wall.getUTCDay(),
  };
}

/** Offset of `timeZone` from UTC at `instant`, in milliseconds (Cairo: +2h or +3h). */
export function offsetAt(instant: number, timeZone: string): number {
  return cachedOffset(instant, timeZone) ?? intlOffset(instant, timeZone);
}

const DAY_MS = 86_400_000;

/**
 * Every instant when the wall clock in `timeZone` shows this date and time, earliest first:
 * usually one, two when clocks go back (the hour repeats), none when they jump forward.
 * Hours/minutes may overflow (hour 24 = next day's midnight).
 */
export function localInstants(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
): number[] {
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  // Offsets change at most once in two days, so the offsets a day either side cover every case.
  const offsets = new Set([offsetAt(wall - DAY_MS, timeZone), offsetAt(wall + DAY_MS, timeZone)]);
  return [...offsets]
    .map((offset) => wall - offset)
    .filter((instant) => offsetAt(instant, timeZone) === wall - instant)
    .sort((a, b) => a - b);
}

/**
 * The instant when the wall clock shows this date and time (the first one if the hour repeats).
 * A time skipped by a DST jump is moved forward by the jump, e.g. 00:30 -> 01:30 in Cairo.
 */
export function fromLocal(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
): number {
  const instants = localInstants(timeZone, year, month, day, hour, minute);
  if (instants.length) return instants[0]!;
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  return wall - offsetAt(wall - DAY_MS, timeZone);
}

/** "YYYY-MM-DD" of the local date at `instant` (faster than dateKey(toLocal(…)) in loops). */
export function localDateKey(instant: number, timeZone: string): string {
  const offset = cachedOffset(instant, timeZone);
  if (offset == null) return dateKey(intlLocal(instant, timeZone));
  // Same local day as the last call: reuse the key.
  const wall = instant + offset;
  const day = Math.floor(wall / DAY_MS);
  if (day === lastKeyDay) return lastKey;
  const d = new Date(day * DAY_MS);
  lastKeyDay = day;
  lastKey = dateKey({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() });
  return lastKey;
}
let lastKeyDay = NaN;
let lastKey = '';

/** "YYYY-MM-DD" for a local date (sorts and compares as text). */
export function dateKey(l: Pick<LocalDateTime, 'year' | 'month' | 'day'>): string {
  return `${l.year}-${String(l.month).padStart(2, '0')}-${String(l.day).padStart(2, '0')}`;
}

/** The calendar day before a "YYYY-MM-DD" key. */
export function previousDateKey(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const prev = new Date(Date.UTC(y!, m! - 1, d! - 1));
  return dateKey({
    year: prev.getUTCFullYear(),
    month: prev.getUTCMonth() + 1,
    day: prev.getUTCDate(),
  });
}

/** Minutes after local midnight, including the fraction (seconds). */
export function minuteOfDay(l: LocalDateTime): number {
  return l.hour * 60 + l.minute + l.second / 60 + l.millisecond / MINUTE_MS;
}

/** Parse "HH:MM" (24h, Arabic-Indic digits allowed) into minutes after midnight. "24:00" = 1440. */
export function parseClock(input: string): number | null {
  const s = input.trim().replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
  const match = /^(\d{1,2})[:.٫](\d{2})$/.exec(s) ?? /^(\d{1,2})$/.exec(s);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2] ?? 0);
  if (m > 59 || h > 24 || (h === 24 && m > 0)) return null;
  return h * 60 + m;
}

/** 90 -> "01:30", 1440 -> "24:00". */
export function formatClock(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Parse "YYYY-MM-DD" into parts, or null if it isn't a real date. */
export function parseDateKey(input: string): { year: number; month: number; day: number } | null {
  const s = input.trim().replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return { year, month, day };
}
