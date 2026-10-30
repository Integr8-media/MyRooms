import { useQuery } from '@powersync/react';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { formatMoney } from '@/domain/money';
import { findRule, priceSession } from '@/domain/pricing';
import { DURATION_CHOICES, plannedEnd, type SessionKind } from '@/domain/sessions';
import { sessionMinutesField, sessionNoteSchema, validate } from '@/domain/validation';
import { dateKey, formatClock, minuteOfDay, toLocal } from '@/domain/zoned-time';
import { ErrorNotice } from '@/features/common/ErrorNotice';
import { formatDuration, formatPerHour } from '@/features/pricing/format';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import type { PackageRow } from '@/lib/powersync/schema';
import { useAsyncAction } from '@/lib/useAsyncAction';
import {
  Button,
  Card,
  LoadingView,
  Notice,
  Screen,
  ScreenHeader,
  SegmentedControl,
  Stepper,
  Text,
  TextField,
} from '@/ui';

import { startSession } from './api';
import { useNow, useOrgPricing } from './data';

type StationInfo = {
  id: string;
  name: string | null;
  status: string | null;
  is_active: number | null;
  branch_id: string | null;
  station_type_id: string;
  type_name: string | null;
  max_players: number | null;
  busy_session_id: string | null;
};

/** Time choice for a fixed session: a quick duration, a package, or a custom number of minutes. */
type TimeChoice =
  { type: 'minutes'; minutes: number } | { type: 'package'; id: string } | { type: 'custom' };

export function StartSessionScreen() {
  const { t, i18n } = useTranslation();
  const { stationId } = useLocalSearchParams<{ stationId: string }>();
  const { org, branch } = useWorkspace();
  const timeZone = org?.timezone ?? 'Africa/Cairo';
  const { busy, error, run } = useAsyncAction();
  // Estimates and the end time follow the clock.
  const now = useNow(15_000);

  const { data: stations, isLoading } = useQuery<StationInfo>(
    `SELECT s.id, s.name, s.status, s.is_active, s.branch_id, s.station_type_id,
            t.name AS type_name, t.max_players,
            (SELECT x.id FROM sessions x WHERE x.station_id = s.id AND x.status = 'active' LIMIT 1)
              AS busy_session_id
       FROM stations s JOIN station_types t ON t.id = s.station_type_id
      WHERE s.id = ?`,
    [stationId ?? null],
  );
  const station = stations[0];
  const { data: packageRows } = useQuery<PackageRow>(
    'SELECT * FROM packages WHERE station_type_id = ? AND is_active = 1 ORDER BY minutes',
    [station?.station_type_id ?? null],
  );
  const { rules } = useOrgPricing(org?.id);

  const [kind, setKind] = useState<SessionKind>('open');
  const [players, setPlayers] = useState(1);
  const [time, setTime] = useState<TimeChoice>({ type: 'minutes', minutes: 60 });
  const [customMinutes, setCustomMinutes] = useState('');
  const [note, setNote] = useState('');

  if (isLoading) return <LoadingView />;
  if (!station) {
    return (
      <Screen>
        <ScreenHeader title={t('sessions.startTitle')} />
        <Notice tone="warning" message={t('sessions.stationNotFound')} />
      </Screen>
    );
  }

  const maxPlayers = station.max_players ?? 1;
  const money = (amount: number) => formatMoney(amount, i18n.language);
  const pkg = time.type === 'package' ? packageRows.find((p) => p.id === time.id) : undefined;
  const custom = validate(sessionMinutesField, customMinutes);
  const noteResult = validate(sessionNoteSchema, note);
  const minutes =
    kind !== 'fixed'
      ? null
      : time.type === 'minutes'
        ? time.minutes
        : time.type === 'package'
          ? (pkg?.minutes ?? null)
          : custom.ok
            ? custom.data
            : null;

  const local = toLocal(now, timeZone);
  const rateNow = findRule(rules, station.station_type_id, players, {
    weekday: local.weekday,
    minute: minuteOfDay(local),
    date: dateKey(local),
  });
  const estimate =
    minutes != null
      ? priceSession({
          segments: [
            {
              start: now,
              end: plannedEnd(now, minutes),
              players,
              stationTypeId: station.station_type_id,
            },
          ],
          rules,
          timeZone,
          package: pkg
            ? { id: pkg.id, name: pkg.name ?? '', minutes: pkg.minutes ?? 0, price: pkg.price ?? 0 }
            : null,
        })
      : null;
  const endsAt = minutes != null ? toLocal(plannedEnd(now, minutes), timeZone) : null;

  const unavailable = station.status !== 'active' || !station.is_active;
  const wrongBranch = station.branch_id !== branch?.id;
  const canStart =
    !busy &&
    !unavailable &&
    !wrongBranch &&
    !station.busy_session_id &&
    noteResult.ok &&
    (kind === 'open' || minutes != null);

  const submit = () =>
    run(async () => {
      if (!org || !branch) return;
      await startSession({
        orgId: org.id,
        branchId: branch.id,
        stationId: station.id,
        kind,
        players,
        minutes: time.type === 'package' ? null : minutes,
        packageId: kind === 'fixed' && pkg ? pkg.id : null,
        note: noteResult.ok ? noteResult.data : null,
      });
      if (router.canGoBack()) router.back();
      else router.replace('/');
    });

  return (
    <Screen>
      <ScreenHeader title={t('sessions.startOn', { station: station.name ?? '' })} />
      {station.type_name ? <Text variant="muted">{station.type_name}</Text> : null}

      {station.busy_session_id ? (
        <Card>
          <Notice tone="warning" message={t('errors.station_busy')} />
          <Button
            label={t('sessions.openSession')}
            variant="secondary"
            className="self-start"
            onPress={() =>
              router.replace({
                pathname: '/sessions/[id]',
                params: { id: station.busy_session_id! },
              })
            }
          />
        </Card>
      ) : null}
      {unavailable ? <Notice tone="warning" message={t('errors.station_unavailable')} /> : null}
      {wrongBranch ? <Notice tone="warning" message={t('errors.invalid_station')} /> : null}

      <Card className="gap-4">
        <SegmentedControl<SessionKind>
          value={kind}
          onChange={setKind}
          options={[
            { value: 'open', label: t('sessions.kind.open') },
            { value: 'fixed', label: t('sessions.kind.fixed') },
          ]}
        />
        <Text variant="muted">{t(`sessions.kindHint.${kind}`)}</Text>

        {maxPlayers > 1 ? (
          <Stepper
            label={t('pricing.players')}
            value={players}
            onChange={setPlayers}
            min={1}
            max={maxPlayers}
            decreaseLabel={t('sessions.fewerPlayers')}
            increaseLabel={t('sessions.morePlayers')}
            testID="players"
          />
        ) : null}

        {kind === 'fixed' ? (
          <View className="gap-2">
            <Text className="text-sm font-medium">{t('sessions.duration')}</Text>
            <View className="flex-row flex-wrap gap-2">
              {DURATION_CHOICES.map((m) => (
                <Button
                  key={m}
                  label={formatDuration(m, t)}
                  variant="secondary"
                  selected={time.type === 'minutes' && time.minutes === m}
                  onPress={() => setTime({ type: 'minutes', minutes: m })}
                  testID={`duration-${m}`}
                />
              ))}
              <Button
                label={t('sessions.customDuration')}
                variant="secondary"
                selected={time.type === 'custom'}
                onPress={() => setTime({ type: 'custom' })}
                testID="duration-custom"
              />
            </View>
            {time.type === 'custom' ? (
              <TextField
                label={t('sessions.minutes')}
                value={customMinutes}
                onChangeText={setCustomMinutes}
                keyboardType="number-pad"
                inputMode="numeric"
                error={customMinutes && !custom.ok ? t('validation.outOfRange') : null}
                testID="custom-minutes"
              />
            ) : null}
            {packageRows.length ? (
              <>
                <Text className="text-sm font-medium">{t('packages.title')}</Text>
                <View className="flex-row flex-wrap gap-2">
                  {packageRows.map((p) => (
                    <Button
                      key={p.id}
                      label={`${p.name} · ${money(p.price ?? 0)}`}
                      variant="secondary"
                      selected={time.type === 'package' && time.id === p.id}
                      onPress={() => setTime({ type: 'package', id: p.id })}
                      testID={`package-${p.id}`}
                    />
                  ))}
                </View>
              </>
            ) : null}
          </View>
        ) : null}

        <TextField
          label={t('sessions.note')}
          value={note}
          onChangeText={setNote}
          placeholder={t('sessions.notePlaceholder')}
          error={noteResult.ok ? null : t('validation.tooLong')}
          testID="session-note"
        />
      </Card>

      <Card className="gap-1" testID="start-estimate">
        {estimate && endsAt && minutes != null ? (
          <>
            <Text>
              {t('sessions.endsAt', {
                time: formatClock(endsAt.hour * 60 + endsAt.minute),
                duration: formatDuration(minutes, t),
              })}
            </Text>
            <Text variant="heading" testID="start-estimate-total">
              {t('sessions.estimatedPrice', { price: money(estimate.total) })}
            </Text>
            {estimate.uncovered.length ? (
              <Notice tone="warning" message={t('pricing.uncoveredWarning')} />
            ) : null}
          </>
        ) : rateNow ? (
          <Text variant="heading" testID="start-rate">
            {t('sessions.rateNow', { rate: formatPerHour(rateNow.pricePerHour, i18n.language, t) })}
          </Text>
        ) : (
          <Notice tone="warning" message={t('sessions.noRateNow')} />
        )}
      </Card>

      <ErrorNotice error={error} />
      <Button
        label={t('sessions.start')}
        onPress={submit}
        disabled={!canStart}
        testID="start-session"
      />
    </Screen>
  );
}
