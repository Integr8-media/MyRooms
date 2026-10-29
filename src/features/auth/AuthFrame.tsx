import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { getDeviceLanguage, type Language } from '@/lib/i18n';
import { isBackendConfigured } from '@/lib/config';
import { useSettingsStore } from '@/lib/settings/settings-store';
import { Card, Notice, Screen, SegmentedControl, Text } from '@/ui';

/** Shared layout for the signed-out screens: app name, language switch, one card. */
export function AuthFrame({ title, children }: { title: string; children: ReactNode }) {
  const { t } = useTranslation();
  const language = useSettingsStore((s) => s.language) ?? getDeviceLanguage();
  const setLanguage = useSettingsStore((s) => s.setLanguage);

  return (
    <Screen>
      <View className="w-full max-w-md gap-4 self-center pt-6">
        <View className="flex-row flex-wrap items-center justify-between gap-3">
          <View>
            <Text variant="title">{t('app.name')}</Text>
            <Text variant="muted">{t('app.tagline')}</Text>
          </View>
          {/* Language names are shown in their own language on purpose. */}
          <SegmentedControl<Language>
            value={language}
            onChange={setLanguage}
            options={[
              { value: 'en', label: 'English' },
              { value: 'ar', label: 'العربية' },
            ]}
          />
        </View>
        {!isBackendConfigured && <Notice tone="warning" message={t('auth.notConfigured')} />}
        <Card className="gap-4">
          <Text variant="heading" accessibilityRole="header">
            {title}
          </Text>
          {children}
        </Card>
      </View>
    </Screen>
  );
}
