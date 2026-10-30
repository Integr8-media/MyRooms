import { create } from 'zustand';

type SyncDeviceState = {
  /** Server time minus device time (ms) from the last clock check; null = not checked. */
  clockSkewMs: number | null;
  clockCheckedAt: number | null;
  /** Web: whether the browser promised to keep the local database. Native: always true. */
  persistentStorage: boolean | null;
  /** While "Sync now" reconnects. */
  retrying: boolean;
  set: (patch: Partial<Omit<SyncDeviceState, 'set'>>) => void;
};

/** Per-device sync facts kept in memory (rechecked every start, never synced). */
export const useSyncStore = create<SyncDeviceState>()((set) => ({
  clockSkewMs: null,
  clockCheckedAt: null,
  persistentStorage: null,
  retrying: false,
  set: (patch) => set(patch),
}));
