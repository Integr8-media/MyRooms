import { useStatus } from '@powersync/react';
import { useTranslation } from 'react-i18next';

import { signOut } from '@/lib/auth/actions';
import { useAuth } from '@/lib/auth/AuthProvider';
import { Button, LoadingView } from '@/ui';

/** Shown while the session or the first sync is loading. */
export function BootScreen() {
  const { t } = useTranslation();
  const { status } = useAuth();
  const sync = useStatus();

  if (status === 'loading') return <LoadingView />;

  // Signed in, first sync not done. Offline on first sign-in, this waits for a connection.
  return (
    <LoadingView message={sync.connected ? t('boot.syncing') : t('boot.waitingForConnection')}>
      <Button label={t('auth.signOut')} variant="secondary" onPress={() => void signOut()} />
    </LoadingView>
  );
}
