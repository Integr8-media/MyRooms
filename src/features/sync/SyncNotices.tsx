import { router } from 'expo-router';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { isClockWrong } from '@/lib/powersync/health';
import { useSyncStore } from '@/lib/powersync/sync-store';
import { Button, Notice } from '@/ui';

import { formatClock } from './format';
import { useSyncHealth } from './useSyncHealth';

/**
 * Warnings that need staff attention, shown on the floor only when they apply: offline for a
 * long time, uploads stuck on the server, or a wrong device clock.
 */
export function SyncNotices() {
  const { t, i18n } = useTranslation();
  const health = useSyncHealth();
  const skew = useSyncStore((s) => s.clockSkewMs);

  const notices: { key: string; tone: 'warning' | 'danger'; message: string }[] = [];
  if (health.longOffline && health.lastSyncedAt != null) {
    notices.push({
      key: 'offline',
      tone: 'warning',
      message: t('sync.longOffline', {
        time: formatClock(health.lastSyncedAt, i18n.language),
        count: health.pending,
      }),
    });
  }
  if (health.stuckReason) {
    notices.push({
      key: 'stuck',
      tone: 'danger',
      message: t(`sync.stuck.${health.stuckReason}`, { count: health.pending }),
    });
  }
  if (isClockWrong(skew)) {
    notices.push({ key: 'clock', tone: 'danger', message: clockMessage(t, skew!) });
  }
  if (!notices.length) return null;

  return (
    <View className="gap-2" testID="sync-notices">
      {notices.map((n) => (
        <Notice key={n.key} tone={n.tone} message={n.message} testID={`sync-notice-${n.key}`} />
      ))}
      <Button
        label={t('sync.details')}
        variant="secondary"
        className="self-start"
        onPress={() => router.push('/sync')}
      />
    </View>
  );
}

/** "This device's clock is 7 min behind the server…" */
export function clockMessage(t: TFunction, skew: number): string {
  const count = Math.round(Math.abs(skew) / 60_000);
  return t(skew > 0 ? 'sync.clock.behind' : 'sync.clock.ahead', { count });
}
