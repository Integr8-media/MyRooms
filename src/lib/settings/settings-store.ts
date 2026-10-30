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
  setLanguage: (language: Language) => void;
  setTheme: (theme: ThemePreference) => void;
  setSessionAlerts: (on: boolean) => void;
};

/** Per-device UI preferences (not synced). */
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      language: null,
      theme: 'system',
      sessionAlerts: true,
      setLanguage: (language) => set({ language }),
      setTheme: (theme) => set({ theme }),
      setSessionAlerts: (sessionAlerts) => set({ sessionAlerts }),
    }),
    {
      name: 'myrooms-settings',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ language, theme, sessionAlerts }) => ({ language, theme, sessionAlerts }),
    },
  ),
);
