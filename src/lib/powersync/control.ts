import { parseTimestamp } from '@/domain/sessions';
import { reportError } from '@/lib/monitoring';
import { getSupabase } from '@/lib/supabase/client';

import { SupabaseConnector } from './connector';
import { powersync } from './database';
import { clockSkew, MAX_CLOCK_ROUND_TRIP_MS } from './health';
import { useSyncStore } from './sync-store';

const connector = new SupabaseConnector();

/** Starts syncing for the signed-in user (PowerSync retries on its own after errors). */
export function connectSync(): Promise<void> {
  return powersync.connect(connector).catch((error: unknown) => {
    console.error('PowerSync: failed to connect', error);
    reportError(error, { area: 'sync.connect' });
  });
}

/**
 * "Sync now": reconnect at once instead of waiting for the next automatic retry. Connecting
 * again drops the current connection, refreshes the token and retries pending uploads.
 */
export async function syncNow(): Promise<void> {
  const store = useSyncStore.getState();
  if (store.retrying) return;
  store.set({ retrying: true });
  try {
    await connectSync();
  } finally {
    useSyncStore.getState().set({ retrying: false });
  }
}

/**
 * Compares the device clock with the server's (`public.server_time()`). Sessions, payments
 * and bills use the device time, so a wrong clock means wrong bills. Silent when offline.
 */
export async function checkClock(): Promise<number | null> {
  try {
    const sentAt = Date.now();
    const { data, error } = await getSupabase().rpc('server_time');
    const receivedAt = Date.now();
    if (error || typeof data !== 'string') return null;
    const server = parseTimestamp(data);
    if (server == null || receivedAt - sentAt > MAX_CLOCK_ROUND_TRIP_MS) return null;
    const skew = clockSkew(sentAt, receivedAt, server);
    useSyncStore.getState().set({ clockSkewMs: skew, clockCheckedAt: receivedAt });
    return skew;
  } catch {
    return null;
  }
}
