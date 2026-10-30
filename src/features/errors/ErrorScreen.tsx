import type { ErrorBoundaryProps } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { isMonitoringEnabled, reportError } from '@/lib/monitoring';
import { Button, Text } from '@/ui';

/**
 * Shown instead of a screen that crashed (Expo Router error boundary). Nothing saved is
 * lost: data lives in the local database, so "Try again" usually just works.
 */
export function ErrorScreen({ error, retry }: ErrorBoundaryProps) {
  const { t } = useTranslation();
  useEffect(() => {
    reportError(error, { area: 'render' });
  }, [error]);

  return (
    <View
      className="flex-1 items-center justify-center gap-4 bg-background p-6"
      testID="error-screen"
    >
      <Text variant="title" className="text-center text-2xl" accessibilityRole="header">
        {t('crash.title')}
      </Text>
      <Text className="text-center">{t('crash.body')}</Text>
      {isMonitoringEnabled ? <Text variant="muted">{t('crash.reported')}</Text> : null}
      <Text variant="muted" className="text-center" selectable>
        {error.message}
      </Text>
      <Button label={t('crash.retry')} onPress={() => void retry()} testID="crash-retry" />
    </View>
  );
}
