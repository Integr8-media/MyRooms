import { useState } from 'react';

import { errorKey, type ErrorKey } from '@/lib/errors';

/** Busy flag + translated error key around an async action (form submits, RPC calls). */
export function useAsyncAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorKey | null>(null);

  const run = async (action: () => Promise<void>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      await action();
      return true;
    } catch (e) {
      console.warn(e);
      setError(errorKey(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  return { busy, error, setError, run };
}
