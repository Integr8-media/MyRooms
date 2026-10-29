import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button } from './Button';
import { Text } from './Text';

/** Title row for a page, with a back button when there is somewhere to go back to. */
export function ScreenHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <View className="flex-row flex-wrap items-center gap-3">
      {router.canGoBack() ? (
        <Button label={t('common.back')} variant="secondary" onPress={() => router.back()} />
      ) : null}
      <Text variant="title" className="flex-1 text-2xl" accessibilityRole="header">
        {title}
      </Text>
      {actions}
    </View>
  );
}
