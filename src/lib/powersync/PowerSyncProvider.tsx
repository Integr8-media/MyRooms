import { PowerSyncContext } from '@powersync/react';
import { useEffect, type ReactNode } from 'react';

import { useAuth } from '@/lib/auth/AuthProvider';
import { isBackendConfigured } from '@/lib/config';

import { connectSync } from './control';
import { powersync } from './database';
import { requestPersistentStorage } from './persist';
import { useSyncStore } from './sync-store';

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
    void connectSync();
    // Ask the browser not to clear the local database (changes may still be waiting there).
    void requestPersistentStorage().then((persistentStorage) =>
      useSyncStore.getState().set({ persistentStorage }),
    );
  }, [status, userId]);

  return <PowerSyncContext.Provider value={powersync}>{children}</PowerSyncContext.Provider>;
}
