/**
 * Pure helpers that turn PowerSync's status into what staff need to know: is this device
 * up to date, offline, or stuck on something the server keeps refusing for now.
 */

export type SyncState =
  /** No connection to the sync service. Work goes on locally. */
  | 'offline'
  | 'connecting'
  | 'syncing'
  /** Connected, but uploads keep failing (e.g. the create-bill function is down). */
  | 'stuck'
  /** Connected, but downloading fails (e.g. the token or sync config is wrong). */
  | 'error'
  | 'ok';

export type SyncInput = {
  connected: boolean;
  connecting: boolean;
  uploading: boolean;
  downloading: boolean;
  uploadError?: Error | null;
  downloadError?: Error | null;
  /** Local changes not uploaded yet. */
  pending: number;
};

export function syncState(s: SyncInput): SyncState {
  if (!s.connected) return s.connecting ? 'connecting' : 'offline';
  if (s.uploadError && s.pending > 0) return 'stuck';
  if (s.downloadError) return 'error';
  if (s.uploading || s.downloading) return 'syncing';
  return 'ok';
}

/** Offline for this long (with no sync since) earns a visible warning on the floor. */
export const LONG_OFFLINE_MS = 60 * 60 * 1000;

/** True when the device hasn't synced for a long time and isn't connected now. */
export function isLongOffline(
  state: SyncState,
  lastSyncedAt: number | null | undefined,
  now: number,
): boolean {
  if (state !== 'offline' && state !== 'connecting') return false;
  return lastSyncedAt != null && now - lastSyncedAt >= LONG_OFFLINE_MS;
}

export type Age =
  | { unit: 'now' }
  | { unit: 'minutes'; count: number }
  | { unit: 'hours'; count: number }
  | { unit: 'days'; count: number };

/** How long ago, rounded down, for "Last synced 5 minutes ago". Under a minute is "now". */
export function ageOf(ms: number): Age {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  if (minutes < 1) return { unit: 'now' };
  if (minutes < 60) return { unit: 'minutes', count: minutes };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { unit: 'hours', count: hours };
  return { unit: 'days', count: Math.floor(hours / 24) };
}

/** One entry of PowerSync's upload queue (`ps_crud.data`). */
export type QueuedChange = { op: string; table: string; id: string };

/** Reads `ps_crud.data` ({"op":"PUT","type":"bills","id":"…",…}); null if unreadable. */
export function parseQueuedChange(data: string | null | undefined): QueuedChange | null {
  if (!data) return null;
  try {
    const value = JSON.parse(data) as { op?: unknown; type?: unknown; id?: unknown };
    if (typeof value.type !== 'string' || typeof value.op !== 'string') return null;
    return { op: value.op, table: value.type, id: typeof value.id === 'string' ? value.id : '' };
  } catch {
    return null;
  }
}

/**
 * Why the queue is stuck, from the change at its head. A new bill goes through the
 * create-bill Edge Function, so when it fails the function is most likely not deployed
 * or down; anything else is a server or network problem.
 */
export function stuckReason(head: QueuedChange | null): 'bill_function' | 'server' {
  return head?.table === 'bills' && head.op === 'PUT' ? 'bill_function' : 'server';
}

/** Clock difference above this is shown as a warning (sessions and bills use device time). */
export const CLOCK_SKEW_WARN_MS = 2 * 60 * 1000;

/**
 * How far this device's clock is from the server's, from one round trip: the server's time
 * is compared with the middle of the request. Positive = the device is behind.
 */
export function clockSkew(sentAt: number, receivedAt: number, serverTime: number): number {
  return serverTime - (sentAt + receivedAt) / 2;
}

/** A round trip slower than this can't measure the clock well enough; ignore it. */
export const MAX_CLOCK_ROUND_TRIP_MS = 10_000;

export function isClockWrong(skewMs: number | null | undefined): boolean {
  return skewMs != null && Math.abs(skewMs) >= CLOCK_SKEW_WARN_MS;
}
