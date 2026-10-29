import {
  UpdateType,
  type AbstractPowerSyncDatabase,
  type PowerSyncBackendConnector,
} from '@powersync/common';

import { config } from '@/lib/config';
import { getSupabase } from '@/lib/supabase/client';

/**
 * Postgres error classes that will never succeed on retry
 * (data exceptions, integrity violations, insufficient privilege).
 * Retrying them would block the upload queue forever, so we drop them.
 */
const FATAL_RESPONSE_CODES = [/^22...$/, /^23...$/, /^42501$/];

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
    try {
      for (const op of transaction.crud) {
        const table = supabase.from(op.table);
        let result;
        switch (op.op) {
          case UpdateType.PUT:
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
