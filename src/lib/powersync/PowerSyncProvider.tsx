import { PowerSyncContext } from '@powersync/react';
import { useEffect, type ReactNode } from 'react';

import { isBackendConfigured } from '@/lib/config';

import { SupabaseConnector } from './connector';
import { powersync } from './database';

/**
 * Opens the local database and, when a backend is configured, starts syncing.
 * Without a backend the app still works fully offline (writes queue locally).
 */
export function PowerSyncProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (!isBackendConfigured) {
      void powersync.init();
      return;
    }
    void powersync.connect(new SupabaseConnector()).catch((error: unknown) => {
      console.error('PowerSync: failed to connect', error);
    });
  }, []);

  return <PowerSyncContext.Provider value={powersync}>{children}</PowerSyncContext.Provider>;
}
