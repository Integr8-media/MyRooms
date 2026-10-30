import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ARRIVALS_WINDOW_MS, reservationState } from '@/domain/reservations';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import { Badge, Card, ListRow, Text } from '@/ui';

import { timeRange, type Reserved } from './data';

/**
 * Reservations starting in the next 2 hours, and late ones not checked in yet, so staff can
 * check customers in (or mark no-shows) from the floor.
 */
export function ArrivalsList({ reserved, now }: { reserved: Reserved[]; now: number }) {
  const { t } = useTranslation();
  const { org } = useWorkspace();
  const timeZone = org?.timezone ?? 'Africa/Cairo';
  const arrivals = reserved.filter((r) => r.end > now && r.start - now <= ARRIVALS_WINDOW_MS);
  if (!arrivals.length) return null;

  return (
    <Card className="gap-1" testID="arrivals">
      <Text variant="heading">{t('reservations.arrivals')}</Text>
      {arrivals.map((r) => {
        const state = reservationState(r.start, r.end, now);
        return (
          <ListRow
            key={r.id}
            title={`${timeRange(r.start, r.end, timeZone)} · ${r.station_name ?? ''}`}
            subtitle={[r.customer_name, t('floor.players', { count: r.players ?? 1 })]
              .filter(Boolean)
              .join(' · ')}
            trailing={
              <Badge
                label={t(`reservations.state.${state}`)}
                tone={state === 'late' ? 'danger' : state === 'due' ? 'warning' : 'reserved'}
              />
            }
            onPress={() => router.push({ pathname: '/reservations/[id]', params: { id: r.id } })}
            testID={`arrival-${r.id}`}
          />
        );
      })}
    </Card>
  );
}
