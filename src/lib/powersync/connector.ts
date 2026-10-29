import {
  UpdateType,
  type AbstractPowerSyncDatabase,
  type PowerSyncBackendConnector,
} from '@powersync/common';

import { config } from '@/lib/config';
import { ensureSession, getSupabase } from '@/lib/supabase/client';

/**
 * Postgres error classes that will never succeed on retry
 * (data exceptions, integrity violations, insufficient privilege).
 * Retrying them would block the upload queue forever, so we drop them.
 */
const FATAL_RESPONSE_CODES = [/^22...$/, /^23...$/, /^42501$/];

export class SupabaseConnector implements PowerSyncBackendConnector {
  async fetchCredentials() {
    const session = await ensureSession();
    if (!session) throw new Error('No Supabase session');
    return { endpoint: config.powersyncUrl, token: session.access_token };
  }

  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction();
    if (!transaction) return;

    const supabase = getSupabase();
    try {
      for (const op of transaction.crud) {
        const table = supabase.from(op.table);
        let result;
        switch (op.op) {
          case UpdateType.PUT:
            result = await table.upsert({ ...op.opData, id: op.id });
            break;
          case UpdateType.PATCH:
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
        // TODO(Phase 6/9): surface rejected writes (e.g. booking conflicts) in a conflict UI.
        console.error('PowerSync: discarding rejected write', code, error);
        await transaction.complete();
      } else {
        // Network or temporary error: PowerSync retries later.
        throw error;
      }
    }
  }
}
