import { LocaleProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { I18nManager, Platform, View } from 'react-native';

import { getDeviceLanguage, isRTL } from '@/lib/i18n';

import { useSettingsStore } from './settings-store';

/**
 * Applies language, reading direction (RTL/LTR) and light/dark theme.
 *
 * Direction is set on the root View so switching language takes effect
 * immediately on every platform without restarting the app. On native we
 * also update I18nManager so system UI matches on the next launch.
 */
export function AppearanceProvider({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();
  const storedLanguage = useSettingsStore((s) => s.language);
  const theme = useSettingsStore((s) => s.theme);
  const { colorScheme, setColorScheme } = useColorScheme();

  const language = storedLanguage ?? getDeviceLanguage();
  const rtl = isRTL(language);
  const direction = rtl ? 'rtl' : 'ltr';

  useEffect(() => {
    if (i18n.language !== language) void i18n.changeLanguage(language);

    if (Platform.OS === 'web') {
      document.documentElement.lang = language;
      document.documentElement.dir = direction;
    } else if (I18nManager.isRTL !== rtl) {
      I18nManager.allowRTL(true);
      I18nManager.forceRTL(rtl);
    }
  }, [i18n, language, rtl, direction]);

  useEffect(() => {
    setColorScheme(theme);
  }, [theme, setColorScheme]);

  return (
    <LocaleProvider direction={direction}>
      <View className="flex-1 bg-background" style={{ direction }}>
        {children}
      </View>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
    </LocaleProvider>
  );
}
