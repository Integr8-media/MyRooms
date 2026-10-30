import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { Language } from '@/lib/i18n';

export type ThemePreference = 'system' | 'light' | 'dark';

type SettingsState = {
  /** null = follow the device language. */
  language: Language | null;
  theme: ThemePreference;
  /** Notify on this device when fixed sessions are ending, end, and run over time. */
  sessionAlerts: boolean;
  /** Organizations whose setup checklist was hidden on this device. */
  setupHidden: string[];
  setLanguage: (language: Language) => void;
  setTheme: (theme: ThemePreference) => void;
  setSessionAlerts: (on: boolean) => void;
  hideSetup: (orgId: string) => void;
};

/** Per-device UI preferences (not synced). */
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      language: null,
      theme: 'system',
      sessionAlerts: true,
      setupHidden: [],
      setLanguage: (language) => set({ language }),
      setTheme: (theme) => set({ theme }),
      setSessionAlerts: (sessionAlerts) => set({ sessionAlerts }),
      hideSetup: (orgId) =>
        set((s) => ({ setupHidden: [...s.setupHidden.filter((id) => id !== orgId), orgId] })),
    }),
    {
      name: 'myrooms-settings',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ language, theme, sessionAlerts, setupHidden }) => ({
        language,
        theme,
        sessionAlerts,
        setupHidden,
      }),
    },
  ),
);
