import { useStatus } from '@powersync/react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Card, Text } from '@/ui';

import { usePendingUploads } from './usePendingUploads';

/** Online/offline, uploads waiting, and last sync time. */
export function SyncStatusCard() {
  const { t, i18n } = useTranslation();
  const status = useStatus();
  const pending = usePendingUploads();

  const syncing = status.dataFlowStatus.uploading || status.dataFlowStatus.downloading;
  const lastSynced = status.lastSyncedAt
    ? new Date(status.lastSyncedAt).toLocaleString(i18n.language)
    : t('sync.never');

  return (
    <Card>
      <Text variant="heading">{t('sync.title')}</Text>
      <View className="flex-row flex-wrap gap-x-4 gap-y-1">
        <Text className={status.connected ? 'text-success' : 'text-danger'} testID="sync-state">
          {syncing ? t('sync.syncing') : status.connected ? t('sync.online') : t('sync.offline')}
        </Text>
        <Text variant="muted">{t('sync.pending', { count: pending })}</Text>
        <Text variant="muted">{t('sync.lastSynced', { time: lastSynced })}</Text>
      </View>
    </Card>
  );
}
