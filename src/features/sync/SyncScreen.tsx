import { useQuery } from '@powersync/react';
import Constants from 'expo-constants';
import { useTranslation } from 'react-i18next';
import { Platform, View } from 'react-native';

import { isMonitoringEnabled } from '@/lib/monitoring';
import { syncNow } from '@/lib/powersync/control';
import { isClockWrong } from '@/lib/powersync/health';
import { useSyncStore } from '@/lib/powersync/sync-store';
import { Button, Card, Notice, Screen, ScreenHeader, Text } from '@/ui';

import { formatClock } from './format';
import { RejectedChanges } from './RejectedChanges';
import { clockMessage } from './SyncNotices';
import { useSyncHealth } from './useSyncHealth';

/** Synced tables with the most rows: shown so a slow device can be explained. */
const SIZE_TABLES = ['sessions', 'session_segments', 'payments', 'session_items'] as const;

function Row({ label, value, testID }: { label: string; value: string; testID?: string }) {
  return (
    <View className="flex-row flex-wrap justify-between gap-x-4 gap-y-1">
      <Text variant="muted">{label}</Text>
      <Text className="font-medium" testID={testID}>
        {value}
      </Text>
    </View>
  );
}

/** Everything about this device's sync: state, waiting changes, errors, clock and storage. */
export function SyncScreen() {
  const { t, i18n } = useTranslation();
  const health = useSyncHealth();
  const { clockSkewMs, clockCheckedAt, persistentStorage, retrying } = useSyncStore();

  const { data: byTable } = useQuery<{ table_name: string | null; count: number }>(
    `SELECT json_extract(data, '$.type') AS table_name, count(*) AS count
       FROM ps_crud GROUP BY table_name ORDER BY count DESC`,
  );
  const { data: sizes } = useQuery<Record<(typeof SIZE_TABLES)[number], number>>(
    `SELECT ${SIZE_TABLES.map((name) => `(SELECT count(*) FROM ${name}) AS ${name}`).join(', ')}`,
  );
  const size = sizes[0];

  const tableName = (name: string | null) =>
    name ? t(`sync.tables.${name}`, { defaultValue: name }) : t('sync.tables.other');

  return (
    <Screen>
      <ScreenHeader title={t('sync.title')} />

      <Card>
        <Text variant="heading" testID="sync-screen-state">
          {t(`sync.state.${health.state}`)}
        </Text>
        <Text variant="muted">{t(`sync.stateHint.${health.state}`)}</Text>
        <Row
          label={t('sync.lastSyncedLabel')}
          value={
            health.lastSyncedAt != null
              ? `${health.lastSyncedLabel} (${formatClock(health.lastSyncedAt, i18n.language)})`
              : health.lastSyncedLabel
          }
          testID="sync-last"
        />
        <Row label={t('sync.pendingLabel')} value={String(health.pending)} testID="sync-pending" />
        <Button
          label={retrying ? t('sync.retrying') : t('sync.now')}
          onPress={() => void syncNow()}
          disabled={retrying}
          className="self-start"
          testID="sync-now"
        />
      </Card>

      {health.stuckReason ? (
        <Notice
          tone="danger"
          message={t(`sync.stuck.${health.stuckReason}`, { count: health.pending })}
          testID="sync-stuck"
        />
      ) : null}
      {health.uploadError && health.pending > 0 ? (
        <Notice tone="warning" message={t('sync.uploadError', { message: health.uploadError })} />
      ) : null}
      {health.downloadError ? (
        <Notice
          tone="warning"
          message={t('sync.downloadError', { message: health.downloadError })}
        />
      ) : null}

      <RejectedChanges />

      {byTable.length ? (
        <Card testID="sync-queue">
          <Text variant="heading">{t('sync.queueTitle')}</Text>
          <Text variant="muted">{t('sync.queueHint')}</Text>
          {byTable.map((r) => (
            <Row
              key={r.table_name ?? '-'}
              label={tableName(r.table_name)}
              value={String(r.count)}
            />
          ))}
        </Card>
      ) : null}

      <Card>
        <Text variant="heading">{t('sync.deviceTitle')}</Text>
        {isClockWrong(clockSkewMs) ? (
          <Notice tone="danger" message={clockMessage(t, clockSkewMs!)} testID="sync-clock-wrong" />
        ) : null}
        <Row
          label={t('sync.clock.label')}
          value={
            clockSkewMs == null
              ? t('sync.clock.unknown')
              : isClockWrong(clockSkewMs)
                ? t('sync.clock.wrong')
                : t('sync.clock.ok')
          }
          testID="sync-clock"
        />
        {clockCheckedAt != null ? (
          <Row
            label={t('sync.clock.checkedAt')}
            value={formatClock(clockCheckedAt, i18n.language)}
          />
        ) : null}
        <Row
          label={t('sync.storage.label')}
          value={
            persistentStorage === true
              ? t('sync.storage.kept')
              : persistentStorage === false
                ? t('sync.storage.mayClear')
                : t('sync.storage.unknown')
          }
          testID="sync-storage"
        />
        {persistentStorage === false ? (
          <Notice tone="warning" message={t('sync.storage.hint')} />
        ) : null}
        <Row
          label={t('sync.errorReports')}
          value={isMonitoringEnabled ? t('sync.errorReportsOn') : t('sync.errorReportsOff')}
        />
        <Row
          label={t('sync.appVersion')}
          value={`${Constants.expoConfig?.version ?? '-'} · ${Platform.OS}`}
        />
      </Card>

      {size ? (
        <Card>
          <Text variant="heading">{t('sync.dataTitle')}</Text>
          <Text variant="muted">{t('sync.dataHint')}</Text>
          {SIZE_TABLES.map((name) => (
            <Row
              key={name}
              label={tableName(name)}
              value={Number(size[name] ?? 0).toLocaleString(i18n.language)}
            />
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
