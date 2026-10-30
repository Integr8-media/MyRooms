/**
 * Reservations and the calendar timeline (Phase 6). Pure TypeScript, no React.
 *
 * A reservation is a session with kind 'reservation' and status 'reserved' that books a
 * station from scheduled_start to scheduled_end. Check-in turns it into an active session.
 * The database is the final judge of double booking (an exclusion constraint on reserved
 * rows, plus a check against walk-ins planned to still be playing); the same rule runs here
 * so the device can refuse a conflicting booking at once, even offline.
 */
import { parseTimestamp } from './sessions';
import { dateKey, fromLocal, MINUTE_MS, parseDateKey, toLocal } from './zoned-time';

/** The calendar snaps to this step (and it is the shortest reservation). */
export const SLOT_MINUTES = 15;
/** Length of a reservation made by tapping an empty slot. */
export const DEFAULT_RESERVATION_MINUTES = 60;
/** Longest reservation (as in the database check). */
export const MAX_RESERVATION_MINUTES = 1440;
/** A reservation can be marked no-show this long after its start (same as the database). */
export const NO_SHOW_GRACE_MS = 15 * MINUTE_MS;
/** The floor shows "reserved soon" on a free station this long before a reservation. */
export const RESERVED_SOON_MS = 30 * MINUTE_MS;
/** The floor lists arrivals starting within this window (and late ones not yet checked in). */
export const ARRIVALS_WINDOW_MS = 120 * MINUTE_MS;

export type BookingStatus = 'reserved' | 'active' | 'completed' | 'no_show';

/** Something that takes a station's time on the calendar. */
export type Booking = {
  id: string;
  stationId: string;
  /** True for reservations (also after check-in), false for walk-ins. */
  reservation: boolean;
  status: BookingStatus;
  /** UTC epoch ms. */
  start: number;
  /** null: an open walk-in still running (no planned end). */
  end: number | null;
};

type BookingRow = {
  id: string;
  station_id: string | null;
  kind: string | null;
  status: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
};

/**
 * The time a session row takes on the calendar: the booked slot for reservations not yet
 * started (or missed), the played time for walk-ins and checked-in reservations. Returns
 * null for cancelled or unreadable rows.
 */
export function bookingFromRow(row: BookingRow): Booking | null {
  if (!row.station_id) return null;
  const base = { id: row.id, stationId: row.station_id, reservation: row.kind === 'reservation' };
  switch (row.status) {
    case 'reserved':
    case 'no_show': {
      const start = parseTimestamp(row.scheduled_start);
      const end = parseTimestamp(row.scheduled_end);
      if (start == null || end == null) return null;
      return { ...base, status: row.status, start, end };
    }
    case 'active': {
      const start = parseTimestamp(row.actual_start);
      if (start == null) return null;
      return { ...base, status: 'active', start, end: parseTimestamp(row.scheduled_end) };
    }
    case 'completed': {
      const start = parseTimestamp(row.actual_start);
      const end = parseTimestamp(row.actual_end);
      if (start == null || end == null) return null;
      return { ...base, status: 'completed', start, end: Math.max(start, end) };
    }
    default:
      return null;
  }
}

export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** Where a booking ends on the calendar: an open session is drawn up to now. */
export function shownEnd(b: Booking, now: number): number {
  return b.end ?? Math.max(now, b.start + SLOT_MINUTES * MINUTE_MS);
}

export type Candidate = { id?: string | null; stationId: string; start: number; end: number };

/**
 * The booking that stops this reservation, if any (same rule as the database): another
 * reservation on the station that overlaps, or a session planned to still be playing.
 * Open walk-ins (no planned end) don't block; see `openSessionOn`.
 */
export function findConflict(bookings: readonly Booking[], c: Candidate): Booking | null {
  for (const b of bookings) {
    if (b.id === c.id || b.stationId !== c.stationId) continue;
    if (b.status === 'reserved' && b.end != null && overlaps(b.start, b.end, c.start, c.end)) {
      return b;
    }
    if (b.status === 'active' && b.end != null && b.end > c.start && b.start < c.end) return b;
  }
  return null;
}

/** An open walk-in running on the station now (it has no end, so it may run into a booking). */
export function openSessionOn(bookings: readonly Booking[], stationId: string): Booking | null {
  return (
    bookings.find((b) => b.stationId === stationId && b.status === 'active' && b.end == null) ??
    null
  );
}

/**
 * Bookings that overlap another one on the same station. Normally none: this happens when two
 * devices booked offline and the server hasn't settled it yet. The calendar flags them.
 */
export function overlappingIds(bookings: readonly Booking[], now: number): Set<string> {
  const live = bookings.filter((b) => b.status === 'reserved' || b.status === 'active');
  const out = new Set<string>();
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i]!;
      const b = live[j]!;
      if (a.stationId !== b.stationId) continue;
      if (overlaps(a.start, shownEnd(a, now), b.start, shownEnd(b, now))) {
        out.add(a.id);
        out.add(b.id);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// A reservation's life: upcoming → soon → due (grace period) → late (may be marked no-show)
// ---------------------------------------------------------------------------

export type ReservationState = 'upcoming' | 'soon' | 'due' | 'late' | 'over';

export function reservationState(start: number, end: number, now: number): ReservationState {
  if (now >= end) return 'over';
  if (now < start - RESERVED_SOON_MS) return 'upcoming';
  if (now < start) return 'soon';
  if (now < start + NO_SHOW_GRACE_MS) return 'due';
  return 'late';
}

export function canMarkNoShow(start: number, now: number): boolean {
  return now >= start + NO_SHOW_GRACE_MS;
}

/** Check-in is possible until the booked time is over. */
export function canCheckIn(end: number, now: number): boolean {
  return now < end;
}

/** The next reservation of a station that isn't over yet (late ones included), or null. */
export function nextReservation<
  T extends Pick<Booking, 'stationId' | 'status' | 'start'> & {
    end: number | null;
  },
>(bookings: readonly T[], stationId: string, now: number): T | null {
  let best: T | null = null;
  for (const b of bookings) {
    if (b.stationId !== stationId || b.status !== 'reserved' || b.end == null || b.end <= now) {
      continue;
    }
    if (!best || b.start < best.start) best = b;
  }
  return best;
}

/** A free station shows "reserved soon" from 30 minutes before a reservation until check-in. */
export function isReservedSoon(next: { start: number } | null, now: number): boolean {
  return !!next && next.start - now <= RESERVED_SOON_MS;
}

/**
 * Would a walk-in planned to end at `plannedEnd` (null: open) run into the next reservation?
 * Open sessions warn only when the reservation is close.
 */
export function runsIntoReservation(
  plannedEnd: number | null,
  next: { start: number } | null,
  now: number,
): boolean {
  if (!next) return false;
  if (plannedEnd == null) return isReservedSoon(next, now);
  return plannedEnd > next.start;
}

// ---------------------------------------------------------------------------
// Calendar days (org time zone, DST-safe) and dragging
// ---------------------------------------------------------------------------

/** A local day as an instant range. `minutes` is 1440, or 1380/1500 on DST change days. */
export type DayWindow = { date: string; start: number; end: number; minutes: number };

export function addDays(date: string, days: number): string {
  const p = parseDateKey(date);
  if (!p) throw new Error(`Invalid date ${date}`);
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day + days));
  return dateKey({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() });
}

export function todayKey(now: number, timeZone: string): string {
  return dateKey(toLocal(now, timeZone));
}

export function dayWindow(date: string, timeZone: string): DayWindow {
  const p = parseDateKey(date);
  if (!p) throw new Error(`Invalid date ${date}`);
  const start = fromLocal(timeZone, p.year, p.month, p.day);
  const end = fromLocal(timeZone, p.year, p.month, p.day + 1);
  return { date, start, end, minutes: Math.round((end - start) / MINUTE_MS) };
}

/** The 7 dates of the week containing `date` (0 = Sunday ... 6 = Saturday). */
export function weekDates(date: string, weekStart: number): string[] {
  const p = parseDateKey(date);
  if (!p) throw new Error(`Invalid date ${date}`);
  const weekday = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  const first = addDays(date, -((weekday - weekStart + 7) % 7));
  return Array.from({ length: 7 }, (_, i) => addDays(first, i));
}

/** Hour lines of a day: minutes from the day's start and the local hour shown. */
export function hourMarks(window: DayWindow, timeZone: string): { offset: number; hour: number }[] {
  const marks = [];
  for (let t = window.start; t < window.end; t += 60 * MINUTE_MS) {
    const l = toLocal(t, timeZone);
    marks.push({ offset: Math.round((t - window.start) / MINUTE_MS), hour: l.hour });
  }
  return marks;
}

/** Minutes from the day's start, clamped to the day. */
export function offsetInDay(instant: number, window: DayWindow): number {
  return Math.min(window.minutes, Math.max(0, (instant - window.start) / MINUTE_MS));
}

export function snapMinutes(minutes: number, step = SLOT_MINUTES): number {
  return Math.round(minutes / step) * step;
}

/** The slot under a tap: minutes from the day's start rounded down to the step. */
export function slotAt(window: DayWindow, offsetMinutes: number, step = SLOT_MINUTES): number {
  const slot = Math.floor(Math.max(0, offsetMinutes) / step) * step;
  return window.start + Math.min(slot, window.minutes - step) * MINUTE_MS;
}

/**
 * A booking moved (both ends) or resized (end only) by a drag of `deltaMinutes`, snapped to
 * the step. A resize keeps at least one step and at most 24 hours.
 */
export function dragRange(
  range: { start: number; end: number },
  deltaMinutes: number,
  mode: 'move' | 'resize',
  step = SLOT_MINUTES,
): { start: number; end: number } {
  const delta = snapMinutes(deltaMinutes, step) * MINUTE_MS;
  if (mode === 'move') return { start: range.start + delta, end: range.end + delta };
  const min = range.start + step * MINUTE_MS;
  const max = range.start + MAX_RESERVATION_MINUTES * MINUTE_MS;
  return { start: range.start, end: Math.min(max, Math.max(min, range.end + delta)) };
}

/** The instant range of a reservation typed as a local date, start time and length. */
export function reservationRange(
  date: string,
  startMinute: number,
  minutes: number,
  timeZone: string,
): { start: number; end: number } {
  const p = parseDateKey(date);
  if (!p) throw new Error(`Invalid date ${date}`);
  const start = fromLocal(timeZone, p.year, p.month, p.day, 0, startMinute);
  return { start, end: start + minutes * MINUTE_MS };
}

/** Form values (local date, "HH:MM" start, length in minutes) for an instant range. */
export function rangeToForm(
  start: number,
  end: number,
  timeZone: string,
): { date: string; time: string; minutes: number } {
  const l = toLocal(start, timeZone);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: dateKey(l),
    time: `${pad(l.hour)}:${pad(l.minute)}`,
    minutes: Math.round((end - start) / MINUTE_MS),
  };
}
