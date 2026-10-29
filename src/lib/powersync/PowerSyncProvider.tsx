import { PowerSyncContext } from '@powersync/react';
import { useEffect, type ReactNode } from 'react';

import { useAuth } from '@/lib/auth/AuthProvider';
import { isBackendConfigured } from '@/lib/config';

import { SupabaseConnector } from './connector';
import { powersync } from './database';

/**
 * Opens the local database and syncs it while someone is signed in.
 * Signing out disconnects and wipes the local copy (see lib/auth/actions.ts).
 */
export function PowerSyncProvider({ children }: { children: ReactNode }) {
  const { status, session } = useAuth();
  const userId = session?.user.id;

  useEffect(() => {
    if (!isBackendConfigured) {
      void powersync.init();
      return;
    }
    if (status === 'signedOut') {
      // Session ended (e.g. refresh token revoked): stop syncing. Data is wiped by signOut().
      void powersync.disconnect();
      return;
    }
    if (status !== 'signedIn' || !userId) return;
    void powersync.connect(new SupabaseConnector()).catch((error: unknown) => {
      console.error('PowerSync: failed to connect', error);
    });
  }, [status, userId]);

  return <PowerSyncContext.Provider value={powersync}>{children}</PowerSyncContext.Provider>;
}
