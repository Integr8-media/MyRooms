import { useTranslation } from 'react-i18next';

import { AppearanceSettings } from '@/features/settings/AppearanceSettings';
import { SyncCheckPanel } from '@/features/sync-check/SyncCheckPanel';
import { Card, Screen, Text } from '@/ui';

export default function HomeScreen() {
  const { t } = useTranslation();
  return (
    <Screen>
      <Card>
        <Text variant="muted">{t('app.tagline')}</Text>
        <Text variant="title">{t('home.hello')}</Text>
        <Text>{t('home.intro')}</Text>
      </Card>
      <AppearanceSettings />
      <SyncCheckPanel />
    </Screen>
  );
}
