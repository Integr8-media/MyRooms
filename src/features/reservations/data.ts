import { useQuery } from '@powersync/react';

import { utcDateWindow } from '@/domain/income';
import { bookingFromRow, overlaps, shownEnd, type Booking } from '@/domain/reservations';
import { parseTimestamp } from '@/domain/sessions';
import { formatClock, toLocal } from '@/domain/zoned-time';
import { formatDateKey } from '@/features/income/format';
import type { SessionRow } from '@/lib/powersync/schema';

/** A station row on the calendar (maintenance stations are shown, but can't be booked). */
export type CalendarStation = {
  id: string;
  name: string | null;
  status: string | null;
  type_id: string;
  type_name: string | null;
  type_kind: string | null;
  type_color: string | null;
  max_players: number | null;
};

export function useBranchStations(branchId: string | null | undefined): CalendarStation[] {
  return useQuery<CalendarStation>(
    `SELECT s.id, s.name, s.status, t.id AS type_id, t.name AS type_name, t.kind AS type_kind,
            t.color AS type_color, t.max_players
       FROM stations s JOIN station_types t ON t.id = s.station_type_id
      WHERE s.branch_id = ? AND s.is_active = 1
      ORDER BY t.sort_order, t.name, s.sort_order, s.name`,
    [branchId ?? null],
  ).data;
}

type BookingRow = {
  id: string;
  station_id: string | null;
  kind: string | null;
  status: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  customer_name: string | null;
  players: number | null;
  note: string | null;
};

/** A booking plus what the calendar writes on it. */
export type CalendarBooking = Booking & {
  customerName: string | null;
  players: number | null;
  note: string | null;
};

/**
 * Everything that takes station time between `from` and `to` (UTC ms) in the branch:
 * reservations, running sessions, and finished sessions and no-shows of those days.
 * Timestamps are text in two formats on the device, so SQL only filters past rows loosely
 * by UTC date (see utcDateWindow) and the exact overlap check is done here.
 */
export function useBranchBookings(
  branchId: string | null | undefined,
  from: number,
  to: number,
  now: number,
): CalendarBooking[] {
  const [fromDate, toDate] = utcDateWindow({ start: from, end: to });
  const { data } = useQuery<BookingRow>(
    `SELECT id, station_id, kind, status, scheduled_start, scheduled_end, actual_start,
            actual_end, customer_name, players, note
       FROM sessions
      WHERE branch_id = ?
        AND (status IN ('reserved', 'active')
             OR (status IN ('completed', 'no_show')
                 AND substr(coalesce(scheduled_start, actual_start), 1, 10) BETWEEN ? AND ?))`,
    [branchId ?? null, fromDate, toDate],
  );
  const out: CalendarBooking[] = [];
  for (const row of data) {
    const b = bookingFromRow(row);
    if (!b || !overlaps(b.start, shownEnd(b, now), from, to)) continue;
    out.push({ ...b, customerName: row.customer_name, players: row.players, note: row.note });
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Reservations of the branch not checked in yet (for the floor and the start screen). */
export type ReservedRow = {
  id: string;
  station_id: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  customer_name: string | null;
  players: number | null;
  station_name: string | null;
};

export type Reserved = ReservedRow & {
  stationId: string;
  status: 'reserved';
  start: number;
  end: number;
};

export function useReserved(branchId: string | null | undefined): Reserved[] {
  const { data } = useQuery<ReservedRow>(
    `SELECT x.id, x.station_id, x.scheduled_start, x.scheduled_end, x.customer_name, x.players,
            s.name AS station_name
       FROM sessions x LEFT JOIN stations s ON s.id = x.station_id
      WHERE x.branch_id = ? AND x.status = 'reserved'`,
    [branchId ?? null],
  );
  const out: Reserved[] = [];
  for (const row of data) {
    const start = parseTimestamp(row.scheduled_start);
    const end = parseTimestamp(row.scheduled_end);
    if (start == null || end == null) continue;
    out.push({ ...row, stationId: row.station_id, status: 'reserved', start, end });
  }
  return out.sort((a, b) => a.start - b.start);
}

export type ReservationDetail = SessionRow & {
  station_name: string | null;
  station_status: string | null;
  station_type_id: string | null;
  type_name: string | null;
  max_players: number | null;
};

export function useReservation(id: string | null | undefined) {
  const { data, isLoading } = useQuery<ReservationDetail>(
    `SELECT x.*, s.name AS station_name, s.status AS station_status, s.station_type_id,
            t.name AS type_name, t.max_players
       FROM sessions x
       LEFT JOIN stations s ON s.id = x.station_id
       LEFT JOIN station_types t ON t.id = s.station_type_id
      WHERE x.id = ?`,
    [id ?? null],
  );
  return { reservation: data[0] as ReservationDetail | undefined, isLoading };
}

/** "18:00" in the org's time zone. */
export function clockAt(instant: number, timeZone: string): string {
  const l = toLocal(instant, timeZone);
  return formatClock(l.hour * 60 + l.minute);
}

/** "18:00–19:30". */
export function timeRange(start: number, end: number | null, timeZone: string): string {
  return `${clockAt(start, timeZone)}–${end == null ? '…' : clockAt(end, timeZone)}`;
}

/** "Mon, 5 Jan" (with the year if asked) in the user's language, for a local date key. */
export function formatDay(date: string, language: string, withYear = false): string {
  return formatDateKey(date, language, withYear);
}
