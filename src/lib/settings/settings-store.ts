import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { Language } from '@/lib/i18n';

export type ThemePreference = 'system' | 'light' | 'dark';

type SettingsState = {
  /** null = follow the device language. */
  language: Language | null;
  theme: ThemePreference;
  setLanguage: (language: Language) => void;
  setTheme: (theme: ThemePreference) => void;
};

/** Per-device UI preferences (not synced). */
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      language: null,
      theme: 'system',
      setLanguage: (language) => set({ language }),
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'myrooms-settings',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ language, theme }) => ({ language, theme }),
    },
  ),
);
