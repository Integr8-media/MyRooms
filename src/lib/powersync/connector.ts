import {
  UpdateType,
  type AbstractPowerSyncDatabase,
  type CrudEntry,
  type PowerSyncBackendConnector,
} from '@powersync/common';

import { config } from '@/lib/config';
import { errorKey, type ErrorKey } from '@/lib/errors';
import { reportError, reportWarning } from '@/lib/monitoring';
import { getSupabase } from '@/lib/supabase/client';

/**
 * Postgres error classes that will never succeed on retry
 * (data exceptions, integrity violations, insufficient privilege).
 * Retrying them would block the upload queue forever, so we drop them.
 */
const FATAL_RESPONSE_CODES = [/^22...$/, /^23...$/, /^42501$/];
// 23... includes 23P01: the no-double-booking exclusion constraint on reservations.

/** An upload the server refused for good (same shape as a Postgres error). */
class RejectedUpload extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

/**
 * A new bill is not inserted directly: the create-bill Edge Function prices the session on
 * the server and saves the bill (clients can't write amounts). 400/403/409 are final; network
 * errors, 401 (expired token), 404 (function not deployed yet) and 5xx are retried later.
 */
async function uploadBill(sessionId: string) {
  const { error } = await getSupabase().functions.invoke('create-bill', {
    body: { session_id: sessionId },
  });
  if (!error) return;
  const response = (error as { context?: unknown }).context;
  if (response instanceof Response && [400, 403, 409].includes(response.status)) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    const key = body?.error ?? 'invalid_session';
    throw new RejectedUpload(key, response.status === 403 ? '42501' : '23514');
  }
  throw error;
}

/**
 * The error key shown for a refused change. Database functions raise named keys; a few
 * constraint errors only have a code (two devices started the same station: 23505).
 */
export function rejectionError(table: string, error: unknown): ErrorKey {
  const key = errorKey(error);
  if (key !== 'unknown') return key;
  const code = (error as { code?: string })?.code;
  if (code === '23505' && table === 'sessions') return 'station_busy';
  if (code === '42501') return 'not_allowed';
  return 'unknown';
}

/**
 * Keep a refused change on this device (upload_rejections, never synced) so staff can see
 * what wasn't saved: the server's copy replaces the local row on the next sync. For an
 * update, the whole local row is kept (the change alone wouldn't say which booking it was).
 */
async function recordRejection(database: AbstractPowerSyncDatabase, op: CrudEntry, error: unknown) {
  try {
    let data: Record<string, unknown> = { ...op.opData };
    if (op.op !== UpdateType.PUT && /^[a-z_]+$/.test(op.table)) {
      const row = await database.getOptional<Record<string, unknown>>(
        `SELECT * FROM ${op.table} WHERE id = ?`,
        [op.id],
      );
      data = { ...row, ...op.opData };
    }
    await database.execute(
      `INSERT INTO upload_rejections (id, table_name, op, row_id, data, error, created_at)
       VALUES (uuid(), ?, ?, ?, ?, ?, ?)`,
      [
        op.table,
        op.op,
        op.id,
        JSON.stringify(data),
        rejectionError(op.table, error),
        new Date().toISOString(),
      ],
    );
  } catch (e) {
    console.warn('Could not record a rejected upload', e);
  }
}

/** True for a server answer (an HTTP status), false for "no connection" (fetch failed). */
function isServerError(error: unknown): boolean {
  const e = error as { status?: unknown; context?: unknown; code?: unknown };
  if (typeof e?.status === 'number' && e.status >= 500) return true;
  if (e?.context instanceof Response && e.context.status >= 500) return true;
  // PostgREST errors carry a Postgres code (e.g. 57014 statement timeout, PGRST…).
  return typeof e?.code === 'string' && e.code.length > 0;
}

const REPORT_EVERY_MS = 10 * 60 * 1000;
const lastReported = new Map<string, number>();

/** Uploads are retried every few seconds; report the same problem at most every 10 minutes. */
function reportUploadFailure(table: string, op: string, error: unknown) {
  const key = `${table}:${op}`;
  const now = Date.now();
  if (now - (lastReported.get(key) ?? 0) < REPORT_EVERY_MS) return;
  lastReported.set(key, now);
  reportError(error, { area: 'sync.upload', table, op });
}

export class SupabaseConnector implements PowerSyncBackendConnector {
  async fetchCredentials() {
    const { data, error } = await getSupabase().auth.getSession();
    if (error) throw error;
    const session = data.session;
    // Signed out: PowerSync stays disconnected until the next sign-in.
    if (!session) return null;
    return { endpoint: config.powersyncUrl, token: session.access_token };
  }

  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction();
    if (!transaction) return;

    const supabase = getSupabase();
    let current: CrudEntry | undefined;
    try {
      for (const op of transaction.crud) {
        current = op;
        const table = supabase.from(op.table);
        let result;
        switch (op.op) {
          case UpdateType.PUT:
            if (op.table === 'bills') {
              await uploadBill(String(op.opData?.session_id ?? op.id));
              continue;
            }
            // A local INSERT. Plain insert (ON CONFLICT DO NOTHING) so a retried upload
            // is harmless and no UPDATE privilege is needed on server-owned columns.
            result = await table.upsert({ ...op.opData, id: op.id }, { ignoreDuplicates: true });
            break;
          case UpdateType.PATCH:
            // Only the changed columns are sent.
            result = await table.update(op.opData ?? {}).eq('id', op.id);
            break;
          case UpdateType.DELETE:
            result = await table.delete().eq('id', op.id);
            break;
        }
        if (result?.error) throw result.error;
      }
      await transaction.complete();
    } catch (error: unknown) {
      const code = (error as { code?: string })?.code;
      if (typeof code === 'string' && FATAL_RESPONSE_CODES.some((re) => re.test(code))) {
        // Dropped so the queue keeps moving, but recorded for the "not saved" list.
        console.error('PowerSync: discarding rejected write', code, error);
        if (current) {
          await recordRejection(database, current, error);
          reportWarning('Upload refused by the server', {
            area: 'sync.rejected',
            table: current.table,
            op: current.op,
            code,
            key: rejectionError(current.table, error),
          });
        }
        await transaction.complete();
      } else {
        // Network or temporary error: PowerSync retries later. Server errors (not just
        // "offline") are reported: they keep the whole queue waiting.
        if (current && isServerError(error)) reportUploadFailure(current.table, current.op, error);
        throw error;
      }
    }
  }
}
