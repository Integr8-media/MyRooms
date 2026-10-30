import { useQuery } from '@powersync/react';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import {
  elapsedMs,
  EXTEND_CHOICES,
  floorStatus,
  formatTimer,
  parseTimestamp,
  remainingMs,
} from '@/domain/sessions';
import { formatClock, toLocal } from '@/domain/zoned-time';
import { ErrorNotice } from '@/features/common/ErrorNotice';
import { BillBreakdown } from '@/features/pricing/BillBreakdown';
import { ColorDot } from '@/features/pricing/pickers';
import { formatDuration } from '@/features/pricing/format';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import { useAsyncAction } from '@/lib/useAsyncAction';
import {
  Badge,
  Button,
  Card,
  cn,
  ListRow,
  LoadingView,
  Notice,
  Screen,
  ScreenHeader,
  Stepper,
  Text,
} from '@/ui';

import { cancelSession, changePlayers, endSession, extendSession, moveSession } from './api';
import {
  estimateSession,
  sessionTiming,
  useFloor,
  useNow,
  useOrgPricing,
  useSession,
  useSessionSegments,
} from './data';

type StationInfo = {
  name: string | null;
  station_type_id: string | null;
  type_name: string | null;
  max_players: number | null;
  status: string | null;
};

type Confirm = 'end' | 'cancel' | null;

const STATUSES = ['reserved', 'active', 'completed', 'cancelled', 'no_show'] as const;
const sessionStatus = (value: string | null) => STATUSES.find((s) => s === value) ?? 'completed';

/** One running (or finished) session: timer, live bill and the actions staff take on it. */
export function SessionScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { org, branch, can } = useWorkspace();
  const timeZone = org?.timezone ?? 'Africa/Cairo';
  const now = useNow(1000);
  const { busy, error, run } = useAsyncAction();
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [moving, setMoving] = useState(false);
  const [pendingPlayers, setPendingPlayers] = useState<number | null>(null);

  const { session, isLoading } = useSession(id);
  const segments = useSessionSegments(id);
  const { rules, packages } = useOrgPricing(org?.id);
  const { data: stationRows } = useQuery<StationInfo>(
    `SELECT s.name, s.station_type_id, s.status, t.name AS type_name, t.max_players
       FROM stations s LEFT JOIN station_types t ON t.id = s.station_type_id WHERE s.id = ?`,
    [session?.station_id ?? null],
  );
  const station = stationRows[0];
  const floor = useFloor(branch?.id);

  if (!session) {
    return isLoading ? (
      <LoadingView />
    ) : (
      <Screen>
        <ScreenHeader title={t('sessions.title')} />
        <Notice tone="warning" message={t('sessions.notFound')} />
      </Screen>
    );
  }

  const active = session.status === 'active';
  const timing = sessionTiming(session);
  const pkg = session.package_id ? (packages.get(session.package_id) ?? null) : null;
  const endedAt = parseTimestamp(session.actual_end);
  const priceAt = active ? now : (endedAt ?? now);
  const bill = estimateSession(segments, rules, pkg, timeZone, priceAt);
  const running = segments.find((g) => !g.ended_at);
  const players = running?.players ?? segments[segments.length - 1]?.players ?? 1;
  const maxPlayers = station?.max_players ?? 1;
  const status = active && timing ? floorStatus({ status: 'active' }, timing, now) : null;
  const remaining = active && timing ? remainingMs(timing, now) : null;

  const clock = (instant: number | null) => {
    if (instant == null) return '—';
    const l = toLocal(instant, timeZone);
    return formatClock(l.hour * 60 + l.minute);
  };

  const freeStations = floor.filter(
    (row) => !row.session_id && row.status === 'active' && row.id !== session.station_id,
  );
  // A package belongs to one station type, so a session with one can only move within that type.
  const canMoveTo = (typeId: string) => !session.package_id || typeId === station?.station_type_id;

  const act = (action: () => Promise<void>) =>
    run(async () => {
      await action();
      setConfirm(null);
      setMoving(false);
      setPendingPlayers(null);
    });

  return (
    <Screen>
      <ScreenHeader title={station?.name ?? t('sessions.title')} />

      <Card
        className={cn(
          'gap-2',
          status === 'overtime' && 'border-danger',
          status === 'ending_soon' && 'border-warning',
        )}
      >
        <View className="flex-row flex-wrap items-center gap-2">
          {station?.type_name ? <Text variant="muted">{station.type_name}</Text> : null}
          <Badge label={t(`sessions.kind.${session.kind === 'fixed' ? 'fixed' : 'open'}`)} />
          <Badge
            label={
              status
                ? t(`floor.status.${status}`)
                : t(`sessions.status.${sessionStatus(session.status)}`)
            }
            tone={
              status === 'overtime'
                ? 'danger'
                : status === 'ending_soon'
                  ? 'warning'
                  : active
                    ? 'primary'
                    : session.status === 'cancelled'
                      ? 'neutral'
                      : 'success'
            }
          />
        </View>
        {active && timing ? (
          <View className="gap-0.5">
            <Text variant="muted">
              {remaining == null
                ? t('floor.elapsed')
                : remaining < 0
                  ? t('floor.overBy')
                  : t('floor.left')}
            </Text>
            <Text
              className={cn(
                'text-4xl font-bold tabular-nums',
                status === 'overtime' && 'text-danger',
              )}
              testID="session-timer"
            >
              {formatTimer(remaining ?? elapsedMs(timing, now))}
            </Text>
            {remaining != null ? (
              <Text variant="muted">
                {t('sessions.playedFor', { time: formatTimer(elapsedMs(timing, now)) })}
              </Text>
            ) : null}
          </View>
        ) : null}
        <Text>
          {t('sessions.startedAt', { time: clock(timing?.start ?? null) })}
          {timing?.scheduledEnd != null
            ? ` · ${t('sessions.plannedEnd', { time: clock(timing.scheduledEnd) })}`
            : ''}
          {!active && endedAt != null
            ? ` · ${t('sessions.endedAt', { time: clock(endedAt) })}`
            : ''}
        </Text>
        <Text>{t('floor.players', { count: players })}</Text>
        {pkg ? <Text>{t('sessions.withPackage', { name: pkg.name })}</Text> : null}
        {session.note ? <Text variant="muted">{session.note}</Text> : null}
      </Card>

      <ErrorNotice error={error} />

      {active && can('sessions.run') ? (
        <>
          {session.kind === 'fixed' ? (
            <Card>
              <Text variant="heading">{t('sessions.extend')}</Text>
              <View className="flex-row flex-wrap gap-2">
                {EXTEND_CHOICES.map((m) => (
                  <Button
                    key={m}
                    label={`+${formatDuration(m, t)}`}
                    variant="secondary"
                    disabled={busy}
                    onPress={() => act(() => extendSession(session.id, m))}
                    testID={`extend-${m}`}
                  />
                ))}
              </View>
            </Card>
          ) : null}

          {maxPlayers > 1 ? (
            <Card>
              <Stepper
                label={t('pricing.players')}
                value={pendingPlayers ?? players}
                onChange={setPendingPlayers}
                min={1}
                max={maxPlayers}
                decreaseLabel={t('sessions.fewerPlayers')}
                increaseLabel={t('sessions.morePlayers')}
                disabled={busy}
                testID="session-players"
              />
              {pendingPlayers != null && pendingPlayers !== players ? (
                <View className="flex-row flex-wrap gap-2">
                  <Button
                    label={t('sessions.applyPlayers', { count: pendingPlayers })}
                    disabled={busy}
                    onPress={() => act(() => changePlayers(session.id, pendingPlayers))}
                    testID="apply-players"
                  />
                  <Button
                    label={t('common.cancel')}
                    variant="secondary"
                    onPress={() => setPendingPlayers(null)}
                  />
                </View>
              ) : null}
              <Text variant="muted">{t('sessions.playersHint')}</Text>
            </Card>
          ) : null}

          <Card className="gap-1">
            <Button
              label={moving ? t('common.cancel') : t('sessions.move')}
              variant="secondary"
              className="self-start"
              onPress={() => setMoving((m) => !m)}
              testID="move-session"
            />
            {moving ? (
              <>
                {freeStations.length === 0 ? (
                  <Text variant="muted">{t('sessions.noFreeStations')}</Text>
                ) : null}
                {freeStations.map((row) => {
                  const allowed = canMoveTo(row.type_id) && players <= (row.max_players ?? 1);
                  return (
                    <ListRow
                      key={row.id}
                      title={row.name ?? ''}
                      subtitle={
                        allowed
                          ? row.type_name
                          : canMoveTo(row.type_id)
                            ? t('errors.too_many_players')
                            : t('sessions.packageSameType')
                      }
                      trailing={<ColorDot color={row.type_color} />}
                      onPress={
                        allowed && !busy
                          ? () => act(() => moveSession(session.id, row.id))
                          : undefined
                      }
                      testID={`move-to-${row.id}`}
                    />
                  );
                })}
              </>
            ) : null}
          </Card>

          <Card>
            {confirm ? (
              <>
                <Text variant="heading">
                  {confirm === 'end' ? t('sessions.confirmEnd') : t('sessions.confirmCancel')}
                </Text>
                {confirm === 'cancel' ? (
                  <Text variant="muted">{t('sessions.cancelHint')}</Text>
                ) : null}
                <View className="flex-row flex-wrap gap-2">
                  <Button
                    label={confirm === 'end' ? t('sessions.endNow') : t('sessions.cancelNow')}
                    variant="danger"
                    disabled={busy}
                    onPress={() =>
                      act(async () => {
                        if (confirm === 'cancel') return cancelSession(session.id);
                        await endSession(session.id);
                        router.replace({ pathname: '/checkout/[id]', params: { id: session.id } });
                      })
                    }
                    testID="confirm-close"
                  />
                  <Button
                    label={t('sessions.keepPlaying')}
                    variant="secondary"
                    onPress={() => setConfirm(null)}
                  />
                </View>
              </>
            ) : (
              <View className="flex-row flex-wrap gap-2">
                <Button
                  label={t('sessions.end')}
                  variant="danger"
                  onPress={() => setConfirm('end')}
                  testID="end-session"
                />
                {can('sessions.cancel') ? (
                  <Button
                    label={t('sessions.cancel')}
                    variant="secondary"
                    onPress={() => setConfirm('cancel')}
                    testID="cancel-session"
                  />
                ) : null}
              </View>
            )}
          </Card>
        </>
      ) : null}

      {!active && session.status === 'completed' ? (
        <>
          <Notice tone="success" message={t('sessions.endedNotice')} />
          <Button
            label={t('checkout.open')}
            onPress={() => router.push({ pathname: '/checkout/[id]', params: { id: session.id } })}
            testID="open-checkout"
          />
        </>
      ) : null}
      {session.status === 'cancelled' ? (
        <Notice tone="warning" message={t('sessions.cancelledNotice')} />
      ) : null}

      {bill && session.status !== 'cancelled' ? (
        <BillBreakdown
          bill={bill}
          timeZone={timeZone}
          title={active ? t('sessions.billSoFar') : t('sessions.estimatedBill')}
          testID="session"
        />
      ) : null}

      {segments.length > 1 ? (
        <Card className="gap-1">
          <Text variant="heading">{t('sessions.history')}</Text>
          {segments.map((g) => (
            <ListRow
              key={g.id}
              title={`${g.station_name ?? ''} · ${t('floor.players', { count: g.players ?? 1 })}`}
              subtitle={`${clock(parseTimestamp(g.started_at))}–${g.ended_at ? clock(parseTimestamp(g.ended_at)) : t('sessions.now')}`}
            />
          ))}
        </Card>
      ) : null}

      {!active ? (
        <Button
          label={t('sessions.backToFloor')}
          variant="secondary"
          onPress={() => router.replace('/')}
        />
      ) : null}
    </Screen>
  );
}
