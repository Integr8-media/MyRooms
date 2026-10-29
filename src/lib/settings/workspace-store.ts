import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type WorkspaceState = {
  /** Organization and branch this device is working in (null = pick the first). */
  orgId: string | null;
  branchId: string | null;
  setOrg: (orgId: string) => void;
  setBranch: (branchId: string) => void;
  reset: () => void;
};

/** Per-device choice of organization and branch (not synced). */
export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      orgId: null,
      branchId: null,
      setOrg: (orgId) => set({ orgId, branchId: null }),
      setBranch: (branchId) => set({ branchId }),
      reset: () => set({ orgId: null, branchId: null }),
    }),
    {
      name: 'myrooms-workspace',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ orgId, branchId }) => ({ orgId, branchId }),
    },
  ),
);
