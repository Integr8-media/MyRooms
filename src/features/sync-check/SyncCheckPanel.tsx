import { usePowerSync, useQuery, useStatus } from '@powersync/react';
import { useTranslation } from 'react-i18next';
import { Platform, View } from 'react-native';

import { isBackendConfigured } from '@/lib/config';
import type { SyncCheck } from '@/lib/powersync/schema';
import { Button, Card, Text } from '@/ui';

/**
 * Phase 0 proof of offline-first sync: write a record locally (works with no
 * internet), watch it upload when online, and see records from other devices.
 */
export function SyncCheckPanel() {
  const { t, i18n } = useTranslation();
  const db = usePowerSync();
  const status = useStatus();
  const { data: records } = useQuery<SyncCheck & { id: string }>(
    'SELECT * FROM sync_checks ORDER BY created_at DESC LIMIT 20',
  );
  const { data: pending } = useQuery<{ count: number }>('SELECT count(*) AS count FROM ps_crud');

  const addRecord = async () => {
    await db.execute(
      'INSERT INTO sync_checks (id, note, platform, created_at) VALUES (uuid(), ?, ?, ?)',
      [t('sync.recordNote', { platform: Platform.OS }), Platform.OS, new Date().toISOString()],
    );
  };

  const formatTime = (iso: string | Date | undefined | null) =>
    iso ? new Date(iso).toLocaleString(i18n.language) : t('sync.never');

  const syncing = status.dataFlowStatus.uploading || status.dataFlowStatus.downloading;
  const pendingCount = pending[0]?.count ?? 0;

  return (
    <Card>
      <Text variant="heading">{t('sync.title')}</Text>
      <Text variant="muted">{t('sync.description')}</Text>

      {!isBackendConfigured && (
        <Text className="text-warning" testID="sync-not-configured">
          {t('sync.notConfigured')}
        </Text>
      )}

      <View className="flex-row flex-wrap gap-x-4 gap-y-1">
        <Text className={status.connected ? 'text-success' : 'text-danger'}>
          {t('sync.status')}:{' '}
          {syncing ? t('sync.syncing') : status.connected ? t('sync.online') : t('sync.offline')}
        </Text>
        <Text variant="muted">{t('sync.pending', { count: pendingCount })}</Text>
        <Text variant="muted">
          {t('sync.lastSynced', { time: formatTime(status.lastSyncedAt) })}
        </Text>
      </View>

      <Button label={t('sync.add')} onPress={addRecord} className="self-start" testID="sync-add" />

      {records.length === 0 ? (
        <Text variant="muted">{t('sync.empty')}</Text>
      ) : (
        <View className="gap-2">
          {records.map((record) => (
            <View key={record.id} className="border-b border-border pb-2">
              <Text>{record.note}</Text>
              <Text variant="muted">{formatTime(record.created_at)}</Text>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}
