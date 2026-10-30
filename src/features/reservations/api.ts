import type { Transaction } from '@powersync/common';

import {
  bookingFromRow,
  canCheckIn,
  canMarkNoShow,
  findConflict,
  MAX_RESERVATION_MINUTES,
  type Booking,
} from '@/domain/reservations';
import { parseTimestamp } from '@/domain/sessions';
import { MINUTE_MS } from '@/domain/zoned-time';
import { availableStation, fail, insertSegment, iso } from '@/features/sessions/api';
import { powersync } from '@/lib/powersync/database';

/**
 * Reservation writes go to the local database first and sync when online. The server runs the
 * same checks (supabase/migrations, phase 6) and is the final judge of double booking: if two
 * devices book the same slot offline, the second upload is refused and shows up in the
 * "not saved" list (upload_rejections) on that device.
 */

type StationRow = {
  id: string;
  branch_id: string;
  station_type_id: string;
  status: string;
  is_active: number;
  max_players: number;
};

/** The station must be in the branch, in service and not removed (it may be busy now). */
async function bookableStation(tx: Transaction, stationId: string, branchId: string) {
  const station = await tx.getOptional<StationRow>(
    `SELECT s.id, s.branch_id, s.station_type_id, s.status, s.is_active, t.max_players
       FROM stations s JOIN station_types t ON t.id = s.station_type_id
      WHERE s.id = ?`,
    [stationId],
  );
  if (!station || station.branch_id !== branchId) return fail('invalid_station');
  if (station.status !== 'active' || !station.is_active) return fail('station_unavailable');
  return station;
}

/** Reserved and running sessions of a station, as calendar bookings. */
async function stationBookings(tx: Transaction, stationId: string): Promise<Booking[]> {
  const rows = await tx.getAll<Parameters<typeof bookingFromRow>[0]>(
    `SELECT id, station_id, kind, status, scheduled_start, scheduled_end, actual_start, actual_end
       FROM sessions WHERE station_id = ? AND status IN ('reserved', 'active')`,
    [stationId],
  );
  return rows.map(bookingFromRow).filter((b): b is Booking => b !== null);
}

async function checkSlot(
  tx: Transaction,
  slot: { id?: string; stationId: string; start: number; end: number },
) {
  if (!(slot.end > slot.start) || slot.end - slot.start > MAX_RESERVATION_MINUTES * MINUTE_MS) {
    fail('invalid_session');
  }
  if (findConflict(await stationBookings(tx, slot.stationId), slot)) fail('booking_conflict');
}

export type ReservationInput = {
  orgId: string;
  branchId: string;
  stationId: string;
  /** UTC epoch ms. */
  start: number;
  end: number;
  players: number;
  customerName: string;
  customerPhone?: string | null;
  note?: string | null;
  /** Customers module: the customer this booking is for. */
  customerId?: string | null;
};

/** Book a station for a future time. Returns the new reservation (session) id. */
export async function createReservation(input: ReservationInput, now = Date.now()) {
  return powersync.writeTransaction(async (tx) => {
    const station = await bookableStation(tx, input.stationId, input.branchId);
    if (input.players < 1 || input.players > station.max_players) fail('too_many_players');
    if (input.end <= now) fail('invalid_session');
    await checkSlot(tx, input);
    if (input.customerId) await checkCustomer(tx, input.customerId, input.orgId);

    const { id } = await tx.get<{ id: string }>('SELECT uuid() AS id');
    await tx.execute(
      `INSERT INTO sessions (id, org_id, branch_id, station_id, kind, status, package_id,
         scheduled_start, scheduled_end, actual_start, actual_end, note, players, customer_name,
         customer_phone, customer_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'reservation', 'reserved', NULL, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.orgId,
        input.branchId,
        input.stationId,
        iso(input.start),
        iso(input.end),
        input.note?.trim() || null,
        input.players,
        input.customerName.trim(),
        input.customerPhone?.trim() || null,
        input.customerId ?? null,
        iso(now),
        iso(now),
      ],
    );
    return id;
  });
}

async function checkCustomer(tx: Transaction, customerId: string, orgId: string) {
  const ok = await tx.getOptional('SELECT id FROM customers WHERE id = ? AND org_id = ?', [
    customerId,
    orgId,
  ]);
  if (!ok) fail('invalid_customer');
}

type ReservedRow = {
  id: string;
  customer_id: string | null;
  branch_id: string;
  station_id: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  players: number | null;
  org_id: string;
};

async function reservedSession(tx: Transaction, id: string) {
  const row = await tx.getOptional<ReservedRow>(
    `SELECT id, org_id, branch_id, station_id, scheduled_start, scheduled_end, players, customer_id
       FROM sessions WHERE id = ? AND status = 'reserved'`,
    [id],
  );
  if (!row) return fail('session_closed');
  const start = parseTimestamp(row.scheduled_start);
  const end = parseTimestamp(row.scheduled_end);
  if (start == null || end == null) return fail('invalid_session');
  return { ...row, start, end };
}

export type ReservationChanges = {
  stationId?: string;
  start?: number;
  end?: number;
  players?: number;
  customerName?: string;
  customerPhone?: string | null;
  note?: string | null;
  /** Customers module: null unlinks the customer. */
  customerId?: string | null;
};

/** Move, resize or edit a reservation that hasn't started. Only changed columns are written. */
export async function updateReservation(id: string, changes: ReservationChanges) {
  await powersync.writeTransaction(async (tx) => {
    const current = await reservedSession(tx, id);
    const stationId = changes.stationId ?? current.station_id;
    const start = changes.start ?? current.start;
    const end = changes.end ?? current.end;
    const players = changes.players ?? current.players ?? 1;

    const station = await bookableStation(tx, stationId, current.branch_id);
    if (players < 1 || players > station.max_players) fail('too_many_players');
    const moved =
      stationId !== current.station_id || start !== current.start || end !== current.end;
    if (moved) await checkSlot(tx, { id, stationId, start, end });

    const set: Record<string, string | number | null> = {};
    if (stationId !== current.station_id) set.station_id = stationId;
    if (start !== current.start) set.scheduled_start = iso(start);
    if (end !== current.end) set.scheduled_end = iso(end);
    if (players !== current.players) set.players = players;
    if (changes.customerName !== undefined) set.customer_name = changes.customerName.trim();
    if (changes.customerPhone !== undefined) {
      set.customer_phone = changes.customerPhone?.trim() || null;
    }
    if (changes.note !== undefined) set.note = changes.note?.trim() || null;
    if (changes.customerId !== undefined && changes.customerId !== current.customer_id) {
      if (changes.customerId) await checkCustomer(tx, changes.customerId, current.org_id);
      set.customer_id = changes.customerId;
    }
    const columns = Object.keys(set);
    if (!columns.length) return;
    await tx.execute(
      `UPDATE sessions SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
      [...columns.map((c) => set[c]!), id],
    );
  });
}

/** Any branch staff can cancel a reservation (nothing was played, so nothing to bill). */
export async function cancelReservation(id: string) {
  await powersync.writeTransaction(async (tx) => {
    await reservedSession(tx, id);
    await tx.execute("UPDATE sessions SET status = 'cancelled' WHERE id = ?", [id]);
  });
}

/** The customer didn't come: possible once the grace period after the start has passed. */
export async function markNoShow(id: string, now = Date.now()) {
  await powersync.writeTransaction(async (tx) => {
    const r = await reservedSession(tx, id);
    if (!canMarkNoShow(r.start, now)) fail('too_early');
    await tx.execute("UPDATE sessions SET status = 'no_show' WHERE id = ?", [id]);
  });
}

/**
 * The customer arrived: the reservation becomes an active session from now until the booked
 * end (staff can extend it like a fixed session). `stationId` checks them in on another free
 * station when theirs is still busy.
 */
export async function checkIn(id: string, stationId?: string | null, now = Date.now()) {
  await powersync.writeTransaction(async (tx) => {
    const r = await reservedSession(tx, id);
    if (!canCheckIn(r.end, now)) fail('invalid_session');
    const target = await availableStation(tx, stationId ?? r.station_id, r.branch_id);
    const players = r.players ?? 1;
    if (players > target.max_players) fail('too_many_players');

    const moved = target.id !== r.station_id;
    await tx.execute(
      `UPDATE sessions SET status = 'active', actual_start = ?${moved ? ', station_id = ?' : ''}
        WHERE id = ?`,
      moved ? [iso(now), target.id, id] : [iso(now), id],
    );
    await insertSegment(
      tx,
      { id, orgId: r.org_id, branchId: r.branch_id },
      { id: target.id, typeId: target.station_type_id },
      players,
      now,
    );
  });
}
