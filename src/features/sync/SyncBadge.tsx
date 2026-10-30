import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import type { SyncState } from '@/lib/powersync/health';
import { cn, Text } from '@/ui';

import { useSyncHealth } from './useSyncHealth';

const dot: Record<SyncState, string> = {
  ok: 'bg-success',
  syncing: 'bg-primary',
  connecting: 'bg-warning',
  offline: 'bg-danger',
  stuck: 'bg-danger',
  error: 'bg-danger',
};

/** Small always-visible sync indicator (floor header). Opens the Sync page. */
export function SyncBadge() {
  const { t } = useTranslation();
  const health = useSyncHealth();
  const label = t(`sync.state.${health.state}`);
  const pending = health.pending > 0 ? t('sync.badgePending', { count: health.pending }) : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[t('sync.title'), label, pending].filter(Boolean).join(', ')}
      onPress={() => router.push('/sync')}
      className="flex-row items-center gap-2 rounded-full border border-border bg-surface px-3 py-2 active:opacity-80"
      testID="sync-badge"
    >
      <View className={cn('h-2.5 w-2.5 rounded-full', dot[health.state])} />
      <Text className="text-sm font-medium" testID="sync-state">
        {label}
      </Text>
      {pending ? (
        <Text variant="muted" className="text-sm" testID="sync-badge-pending">
          {pending}
        </Text>
      ) : null}
    </Pressable>
  );
}
