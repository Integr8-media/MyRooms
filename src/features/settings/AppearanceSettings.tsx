import { useTranslation } from 'react-i18next';

import { getDeviceLanguage, type Language } from '@/lib/i18n';
import { useSettingsStore, type ThemePreference } from '@/lib/settings/settings-store';
import { Card, SegmentedControl, Text } from '@/ui';

export function AppearanceSettings() {
  const { t } = useTranslation();
  const language = useSettingsStore((s) => s.language) ?? getDeviceLanguage();
  const theme = useSettingsStore((s) => s.theme);
  const setLanguage = useSettingsStore((s) => s.setLanguage);
  const setTheme = useSettingsStore((s) => s.setTheme);

  return (
    <Card>
      <Text variant="heading">{t('settings.language')}</Text>
      {/* Language names are shown in their own language on purpose. */}
      <SegmentedControl<Language>
        value={language}
        onChange={setLanguage}
        options={[
          { value: 'en', label: 'English' },
          { value: 'ar', label: 'العربية' },
        ]}
      />
      <Text variant="heading">{t('settings.theme')}</Text>
      <SegmentedControl<ThemePreference>
        value={theme}
        onChange={setTheme}
        options={[
          { value: 'system', label: t('settings.themeSystem') },
          { value: 'light', label: t('settings.themeLight') },
          { value: 'dark', label: t('settings.themeDark') },
        ]}
      />
    </Card>
  );
}
