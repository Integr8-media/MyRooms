import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { SyncStatusCard } from '@/features/sync/SyncStatusCard';
import { BranchSwitcher } from '@/features/workspace/BranchSwitcher';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import { Badge, Button, Card, Notice, Screen, Text } from '@/ui';

export function HomeScreen() {
  const { t } = useTranslation();
  const { org, role, branch, membership } = useWorkspace();

  return (
    <Screen>
      <View className="flex-row flex-wrap items-center gap-3">
        <View className="flex-1 gap-1">
          <Text variant="muted">{t('app.name')}</Text>
          <Text variant="title" className="text-2xl" accessibilityRole="header">
            {org?.name}
          </Text>
        </View>
        <Button
          label={t('settings.title')}
          variant="secondary"
          onPress={() => router.push('/settings')}
          testID="open-settings"
        />
      </View>

      <Card>
        <Text>
          {t('home.signedInAs', { name: membership?.display_name || membership?.email || '' })}
        </Text>
        {role ? <Badge label={t(`roles.${role}`)} tone="primary" /> : null}
        {branch ? (
          <Text variant="heading" testID="current-branch">
            {t('home.currentBranch', { name: branch.name })}
          </Text>
        ) : (
          <Notice tone="warning" message={t('home.noBranch')} />
        )}
      </Card>

      <BranchSwitcher />

      <Card>
        <Text variant="heading">{t('home.floorTitle')}</Text>
        <Text variant="muted">{t('home.floorComingSoon')}</Text>
      </Card>

      <SyncStatusCard />
    </Screen>
  );
}
