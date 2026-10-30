import { useQuery, useStatus } from '@powersync/react';
import { useTranslation } from 'react-i18next';

import { useNow } from '@/features/sessions/data';
import {
  ageOf,
  isLongOffline,
  parseQueuedChange,
  stuckReason,
  syncState,
  type QueuedChange,
  type SyncState,
} from '@/lib/powersync/health';

import { usePendingUploads } from './usePendingUploads';

export type SyncHealth = {
  state: SyncState;
  pending: number;
  lastSyncedAt: number | null;
  /** "5 min ago" (or "never"). */
  lastSyncedLabel: string;
  longOffline: boolean;
  /** First change waiting in the upload queue (the one that blocks the rest when stuck). */
  head: QueuedChange | null;
  stuckReason: 'bill_function' | 'server' | null;
  uploadError: string | null;
  downloadError: string | null;
};

/** How the device's sync is doing, for the header badge, floor notices and the Sync page. */
export function useSyncHealth(): SyncHealth {
  const { t } = useTranslation();
  const status = useStatus();
  const pending = usePendingUploads();
  const now = useNow(30_000);
  const { data: headRows } = useQuery<{ data: string | null }>(
    'SELECT data FROM ps_crud ORDER BY id LIMIT 1',
  );

  const state = syncState({
    connected: status.connected,
    connecting: status.connecting,
    uploading: status.dataFlowStatus.uploading,
    downloading: status.dataFlowStatus.downloading,
    uploadError: status.dataFlowStatus.uploadError,
    downloadError: status.dataFlowStatus.downloadError,
    pending,
  });
  const lastSyncedAt = status.lastSyncedAt ? status.lastSyncedAt.getTime() : null;
  const head = parseQueuedChange(headRows[0]?.data);
  const age = lastSyncedAt != null ? ageOf(now - lastSyncedAt) : null;

  return {
    state,
    pending,
    lastSyncedAt,
    lastSyncedLabel: age
      ? age.unit === 'now'
        ? t('sync.age.now')
        : t(`sync.age.${age.unit}`, { count: age.count })
      : t('sync.never'),
    longOffline: isLongOffline(state, lastSyncedAt, now),
    head,
    stuckReason: state === 'stuck' ? stuckReason(head) : null,
    uploadError: status.dataFlowStatus.uploadError?.message ?? null,
    downloadError: status.dataFlowStatus.downloadError?.message ?? null,
  };
}
