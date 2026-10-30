import type { Transaction } from '@powersync/common';

import { extendEnd, parseTimestamp, plannedEnd, type SessionKind } from '@/domain/sessions';
import { insertBill } from '@/features/checkout/api';
import { powersync } from '@/lib/powersync/database';

/**
 * Session writes go to the local database first and sync when online, so the floor keeps
 * working offline. The same checks run on the server (supabase/migrations, phase 3); these
 * local ones give an immediate, translated error (`errors.<key>`).
 */

class SessionError extends Error {}
const fail = (key: string): never => {
  throw new SessionError(key);
};

const iso = (ms: number) => new Date(ms).toISOString();

type StationInfo = {
  id: string;
  branch_id: string;
  station_type_id: string;
  status: string;
  is_active: number;
  max_players: number;
};

async function availableStation(tx: Transaction, stationId: string, branchId: string) {
  const station = await tx.getOptional<StationInfo>(
    `SELECT s.id, s.branch_id, s.station_type_id, s.status, s.is_active, t.max_players
       FROM stations s JOIN station_types t ON t.id = s.station_type_id
      WHERE s.id = ?`,
    [stationId],
  );
  if (!station || station.branch_id !== branchId) return fail('invalid_station');
  if (station.status !== 'active' || !station.is_active) return fail('station_unavailable');
  const busy = await tx.getOptional(
    "SELECT id FROM sessions WHERE station_id = ? AND status = 'active'",
    [stationId],
  );
  if (busy) fail('station_busy');
  return station;
}

type ActiveSession = {
  id: string;
  org_id: string;
  branch_id: string;
  station_id: string;
  kind: string;
  package_id: string | null;
  scheduled_end: string | null;
};

async function activeSession(tx: Transaction, sessionId: string) {
  const session = await tx.getOptional<ActiveSession>(
    "SELECT id, org_id, branch_id, station_id, kind, package_id, scheduled_end FROM sessions WHERE id = ? AND status = 'active'",
    [sessionId],
  );
  return session ?? fail('session_closed');
}

type OpenSegment = { id: string; players: number; station_type_id: string };

async function openSegment(tx: Transaction, sessionId: string) {
  return tx.getOptional<OpenSegment>(
    'SELECT id, players, station_type_id FROM session_segments WHERE session_id = ? AND ended_at IS NULL',
    [sessionId],
  );
}

async function insertSegment(
  tx: Transaction,
  session: { id: string; orgId: string; branchId: string },
  station: { id: string; typeId: string },
  players: number,
  at: number,
) {
  await tx.execute(
    `INSERT INTO session_segments (id, org_id, branch_id, session_id, station_id, station_type_id,
       players, started_at, ended_at, created_at, updated_at)
     VALUES (uuid(), ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    [
      session.orgId,
      session.branchId,
      session.id,
      station.id,
      station.typeId,
      players,
      iso(at),
      iso(at),
    ],
  );
}

export type StartSessionInput = {
  orgId: string;
  branchId: string;
  stationId: string;
  kind: SessionKind;
  players: number;
  /** Fixed sessions without a package. */
  minutes?: number | null;
  packageId?: string | null;
  note?: string | null;
};

/** Start a walk-in session on a free station. Returns the new session id. */
export async function startSession(input: StartSessionInput, now = Date.now()): Promise<string> {
  return powersync.writeTransaction(async (tx) => {
    const station = await availableStation(tx, input.stationId, input.branchId);
    if (input.players < 1 || input.players > station.max_players) fail('too_many_players');

    let minutes = input.kind === 'fixed' ? (input.minutes ?? null) : null;
    if (input.packageId) {
      const pkg = await tx.getOptional<{ minutes: number }>(
        'SELECT minutes FROM packages WHERE id = ? AND station_type_id = ? AND is_active = 1',
        [input.packageId, station.station_type_id],
      );
      if (!pkg) return fail('invalid_package');
      minutes = pkg.minutes;
    }
    if (input.kind === 'fixed' && !minutes) fail('invalid_session');

    const { id } = await tx.get<{ id: string }>('SELECT uuid() AS id');
    await tx.execute(
      `INSERT INTO sessions (id, org_id, branch_id, station_id, kind, status, package_id,
         scheduled_start, scheduled_end, actual_start, actual_end, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, NULL, ?, ?, ?)`,
      [
        id,
        input.orgId,
        input.branchId,
        input.stationId,
        input.kind,
        input.packageId ?? null,
        iso(now),
        minutes ? iso(plannedEnd(now, minutes)) : null,
        iso(now),
        input.note?.trim() || null,
        iso(now),
        iso(now),
      ],
    );
    await insertSegment(
      tx,
      { id, orgId: input.orgId, branchId: input.branchId },
      { id: station.id, typeId: station.station_type_id },
      input.players,
      now,
    );
    return id;
  });
}

/** Add time to a fixed session. */
export async function extendSession(sessionId: string, minutes: number) {
  await powersync.writeTransaction(async (tx) => {
    const session = await activeSession(tx, sessionId);
    const end = parseTimestamp(session.scheduled_end);
    if (end == null) return fail('invalid_session');
    await tx.execute('UPDATE sessions SET scheduled_end = ? WHERE id = ?', [
      iso(extendEnd(end, minutes)),
      sessionId,
    ]);
  });
}

/** A new player count starts a new segment (it may be priced differently). */
export async function changePlayers(sessionId: string, players: number, now = Date.now()) {
  await powersync.writeTransaction(async (tx) => {
    const session = await activeSession(tx, sessionId);
    const segment = await openSegment(tx, sessionId);
    if (segment?.players === players) return;
    const { max_players, station_type_id } = await tx.get<{
      max_players: number;
      station_type_id: string;
    }>(
      `SELECT t.max_players, s.station_type_id
         FROM stations s JOIN station_types t ON t.id = s.station_type_id
        WHERE s.id = ?`,
      [session.station_id],
    );
    if (players < 1 || players > max_players) fail('too_many_players');
    if (segment) {
      await tx.execute('UPDATE session_segments SET ended_at = ? WHERE id = ?', [
        iso(now),
        segment.id,
      ]);
    }
    await insertSegment(
      tx,
      { id: sessionId, orgId: session.org_id, branchId: session.branch_id },
      { id: session.station_id, typeId: station_type_id },
      players,
      now,
    );
  });
}

/** Move the group to another free station in the branch (a new segment, maybe a new price). */
export async function moveSession(sessionId: string, stationId: string, now = Date.now()) {
  await powersync.writeTransaction(async (tx) => {
    const session = await activeSession(tx, sessionId);
    if (session.station_id === stationId) return;
    const target = await availableStation(tx, stationId, session.branch_id);
    const segment = await openSegment(tx, sessionId);
    const players = segment?.players ?? 1;
    if (players > target.max_players) fail('too_many_players');
    if (session.package_id) {
      // A package belongs to one station type.
      const ok = await tx.getOptional(
        'SELECT id FROM packages WHERE id = ? AND station_type_id = ?',
        [session.package_id, target.station_type_id],
      );
      if (!ok) fail('invalid_package');
    }
    if (segment) {
      await tx.execute('UPDATE session_segments SET ended_at = ? WHERE id = ?', [
        iso(now),
        segment.id,
      ]);
    }
    await tx.execute('UPDATE sessions SET station_id = ? WHERE id = ?', [stationId, sessionId]);
    await insertSegment(
      tx,
      { id: sessionId, orgId: session.org_id, branchId: session.branch_id },
      { id: target.id, typeId: target.station_type_id },
      players,
      now,
    );
  });
}

async function close(sessionId: string, status: 'completed' | 'cancelled', now: number) {
  await powersync.writeTransaction(async (tx) => {
    await activeSession(tx, sessionId);
    await tx.execute(
      'UPDATE session_segments SET ended_at = ? WHERE session_id = ? AND ended_at IS NULL',
      [iso(now), sessionId],
    );
    await tx.execute('UPDATE sessions SET status = ?, actual_end = ? WHERE id = ?', [
      status,
      iso(now),
      sessionId,
    ]);
    // Ending makes the bill (an estimate until the server prices it, see checkout/api.ts).
    if (status === 'completed') await insertBill(tx, sessionId, now);
  });
}

/** Stop the timer and make the bill. Payment is taken at checkout. */
export function endSession(sessionId: string, now = Date.now()) {
  return close(sessionId, 'completed', now);
}

/** Owners and managers only (checked by the server too): the session is never billed. */
export function cancelSession(sessionId: string, now = Date.now()) {
  return close(sessionId, 'cancelled', now);
}
