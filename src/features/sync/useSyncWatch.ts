import { useStatus } from '@powersync/react';
import { useEffect } from 'react';

import { checkClock } from '@/lib/powersync/control';

const CLOCK_CHECK_EVERY_MS = 30 * 60 * 1000;

/**
 * While signed in: check the device clock against the server's each time the device comes
 * online and every 30 minutes after that (results in useSyncStore).
 */
export function useSyncWatch() {
  const { connected } = useStatus();
  useEffect(() => {
    if (!connected) return;
    void checkClock();
    const timer = setInterval(() => void checkClock(), CLOCK_CHECK_EVERY_MS);
    return () => clearInterval(timer);
  }, [connected]);
}
