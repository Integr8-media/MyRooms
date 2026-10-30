import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import {
  canCheckIn,
  canMarkNoShow,
  NO_SHOW_GRACE_MS,
  rangeToForm,
  reservationState,
  type ReservationState,
} from '@/domain/reservations';
import { parseTimestamp } from '@/domain/sessions';
import { ErrorNotice } from '@/features/common/ErrorNotice';
import { ColorDot } from '@/features/pricing/pickers';
import { useFloor, useNow } from '@/features/sessions/data';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import { useAsyncAction } from '@/lib/useAsyncAction';
import {
  Badge,
  Button,
  Card,
  ListRow,
  LoadingView,
  Notice,
  Screen,
  ScreenHeader,
  Text,
} from '@/ui';

import { cancelReservation, checkIn, markNoShow } from './api';
import { clockAt, formatDay, timeRange, useReservation } from './data';

const STATE_TONE: Record<ReservationState, 'reserved' | 'warning' | 'danger' | 'neutral'> = {
  upcoming: 'reserved',
  soon: 'reserved',
  due: 'warning',
  late: 'danger',
  over: 'neutral',
};

const STATUSES = ['reserved', 'active', 'completed', 'cancelled', 'no_show'] as const;
const sessionStatus = (value: string | null) => STATUSES.find((s) => s === value) ?? 'reserved';

/** One reservation: when, who, and check-in / no-show / edit / cancel. */
export function ReservationScreen() {
  const { t, i18n } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { org, branch, can } = useWorkspace();
  const timeZone = org?.timezone ?? 'Africa/Cairo';
  const now = useNow(15_000);
  const { busy, error, run } = useAsyncAction();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [choosing, setChoosing] = useState(false);

  const { reservation: r, isLoading } = useReservation(id);
  const floor = useFloor(branch?.id);

  if (!r) {
    return isLoading ? (
      <LoadingView />
    ) : (
      <Screen>
        <ScreenHeader title={t('reservations.title')} />
        <Notice tone="warning" message={t('reservations.notFound')} />
      </Screen>
    );
  }

  const start = parseTimestamp(r.scheduled_start);
  const end = parseTimestamp(r.scheduled_end);
  const reserved = r.status === 'reserved';
  const state = reserved && start != null && end != null ? reservationState(start, end, now) : null;
  const manage = can('reservations.manage') && reserved;
  const ownStation = floor.find((row) => row.id === r.station_id);
  const stationBusy = !!ownStation?.session_id;
  const stationDown = r.station_status !== 'active';
  const players = r.players ?? 1;
  const freeStations = floor.filter(
    (row) =>
      !row.session_id &&
      row.status === 'active' &&
      row.id !== r.station_id &&
      players <= (row.max_players ?? 1),
  );

  const doCheckIn = (stationId?: string) =>
    run(async () => {
      await checkIn(r.id, stationId);
      router.replace({ pathname: '/sessions/[id]', params: { id: r.id } });
    });

  return (
    <Screen>
      <ScreenHeader title={r.customer_name || t('reservations.title')} />

      <Card className="gap-2">
        <View className="flex-row flex-wrap items-center gap-2">
          <Badge label={t('sessions.kind.reservation')} tone="reserved" />
          <Badge
            label={
              state
                ? t(`reservations.state.${state}`)
                : t(`sessions.status.${sessionStatus(r.status)}`)
            }
            tone={state ? STATE_TONE[state] : r.status === 'no_show' ? 'danger' : 'neutral'}
          />
        </View>
        {start != null && end != null ? (
          <Text variant="heading" testID="reservation-when">
            {formatDay(rangeToForm(start, end, timeZone).date, i18n.language, true)} ·{' '}
            {timeRange(start, end, timeZone)}
          </Text>
        ) : null}
        <Text>
          {r.station_name}
          {r.type_name ? ` · ${r.type_name}` : ''}
        </Text>
        <Text>{t('floor.players', { count: players })}</Text>
        {r.customer_phone ? <Text>{r.customer_phone}</Text> : null}
        {r.note ? <Text variant="muted">{r.note}</Text> : null}
      </Card>

      <ErrorNotice error={error} />

      {r.status === 'active' || r.status === 'completed' ? (
        <Button
          label={t('sessions.openSession')}
          onPress={() => router.replace({ pathname: '/sessions/[id]', params: { id: r.id } })}
          testID="open-session"
        />
      ) : null}
      {r.status === 'no_show' ? (
        <Notice tone="warning" message={t('reservations.noShowNotice')} />
      ) : null}
      {r.status === 'cancelled' ? (
        <Notice tone="warning" message={t('reservations.cancelledNotice')} />
      ) : null}

      {manage && start != null && end != null ? (
        <>
          <Card className="gap-2">
            <Text variant="heading">{t('reservations.checkIn')}</Text>
            {!canCheckIn(end, now) ? (
              <Text variant="muted">{t('reservations.timeOver')}</Text>
            ) : stationBusy || stationDown ? (
              <>
                <Notice
                  tone="warning"
                  message={
                    stationDown ? t('errors.station_unavailable') : t('reservations.stationBusy')
                  }
                />
                <Button
                  label={choosing ? t('common.cancel') : t('reservations.checkInElsewhere')}
                  variant="secondary"
                  className="self-start"
                  onPress={() => setChoosing((c) => !c)}
                  testID="check-in-elsewhere"
                />
                {choosing ? (
                  freeStations.length ? (
                    freeStations.map((row) => (
                      <ListRow
                        key={row.id}
                        title={row.name ?? ''}
                        subtitle={row.type_name}
                        trailing={<ColorDot color={row.type_color} />}
                        onPress={busy ? undefined : () => doCheckIn(row.id)}
                        testID={`check-in-at-${row.id}`}
                      />
                    ))
                  ) : (
                    <Text variant="muted">{t('sessions.noFreeStations')}</Text>
                  )
                ) : null}
              </>
            ) : (
              <>
                <Text variant="muted">{t('reservations.checkInHint')}</Text>
                <Button
                  label={t('reservations.checkInNow')}
                  disabled={busy}
                  onPress={() => doCheckIn()}
                  testID="check-in"
                />
              </>
            )}
          </Card>

          <Card className="gap-2">
            {canMarkNoShow(start, now) ? (
              <Button
                label={t('reservations.markNoShow')}
                variant="secondary"
                className="self-start"
                disabled={busy}
                onPress={() => run(() => markNoShow(r.id))}
                testID="no-show"
              />
            ) : (
              <Text variant="muted" testID="no-show-hint">
                {t('reservations.noShowFrom', {
                  time: clockAt(start + NO_SHOW_GRACE_MS, timeZone),
                })}
              </Text>
            )}
            <View className="flex-row flex-wrap gap-2">
              <Button
                label={t('reservations.edit')}
                variant="secondary"
                onPress={() => router.push({ pathname: '/reservations/new', params: { id: r.id } })}
                testID="edit-reservation"
              />
              {!confirmCancel ? (
                <Button
                  label={t('reservations.cancel')}
                  variant="secondary"
                  onPress={() => setConfirmCancel(true)}
                  testID="cancel-reservation"
                />
              ) : null}
            </View>
            {confirmCancel ? (
              <>
                <Text variant="heading">{t('reservations.confirmCancel')}</Text>
                <View className="flex-row flex-wrap gap-2">
                  <Button
                    label={t('reservations.cancelNow')}
                    variant="danger"
                    disabled={busy}
                    onPress={() =>
                      run(async () => {
                        await cancelReservation(r.id);
                        setConfirmCancel(false);
                      })
                    }
                    testID="confirm-cancel-reservation"
                  />
                  <Button
                    label={t('reservations.keep')}
                    variant="secondary"
                    onPress={() => setConfirmCancel(false)}
                  />
                </View>
              </>
            ) : null}
          </Card>
        </>
      ) : null}

      <Button
        label={t('calendar.title')}
        variant="secondary"
        onPress={() =>
          router.push({
            pathname: '/calendar',
            params: start != null ? { date: rangeToForm(start, start, timeZone).date } : {},
          })
        }
      />
    </Screen>
  );
}
