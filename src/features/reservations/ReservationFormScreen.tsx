import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { formatMoney } from '@/domain/money';
import { priceSession } from '@/domain/pricing';
import {
  DEFAULT_RESERVATION_MINUTES,
  findConflict,
  openSessionOn,
  rangeToForm,
  reservationRange,
  todayKey,
} from '@/domain/reservations';
import { parseTimestamp } from '@/domain/sessions';
import { reservationSchema, validate } from '@/domain/validation';
import { ErrorNotice } from '@/features/common/ErrorNotice';
import { CustomerPicker } from '@/features/customers/CustomerPicker';
import { ColorDot } from '@/features/pricing/pickers';
import { formatDuration } from '@/features/pricing/format';
import { useNow, useOrgPricing } from '@/features/sessions/data';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import { powersync } from '@/lib/powersync/database';
import { useAsyncAction } from '@/lib/useAsyncAction';
import {
  Button,
  Card,
  LoadingView,
  Notice,
  Screen,
  ScreenHeader,
  Stepper,
  Text,
  TextField,
} from '@/ui';

import { createReservation, updateReservation } from './api';
import { formatDay, timeRange, useBranchBookings, useBranchStations, useReservation } from './data';

const LENGTHS = [60, 90, 120, 180] as const;

type Params = {
  id?: string;
  stationId?: string;
  date?: string;
  time?: string;
  minutes?: string;
  players?: string;
  name?: string;
  phone?: string;
  note?: string;
  /** A refused booking being redone: removed from the "not saved" list once saved. */
  rejected?: string;
};

/** Book a station (or edit a booking that hasn't started). */
export function ReservationFormScreen() {
  const params = useLocalSearchParams<Params>();
  const { reservation, isLoading } = useReservation(params.id);
  if (params.id && isLoading) return <LoadingView />;
  return <ReservationForm params={params} existing={params.id ? (reservation ?? null) : null} />;
}

function ReservationForm({
  params,
  existing,
}: {
  params: Params;
  existing: ReturnType<typeof useReservation>['reservation'] | null;
}) {
  const { t, i18n } = useTranslation();
  const { org, branch, can, features } = useWorkspace();
  const timeZone = org?.timezone ?? 'Africa/Cairo';
  const now = useNow(30_000);
  const pickCustomers = features.customers && can('customers.manage');
  const { busy, error, run } = useAsyncAction();

  const initial = (() => {
    const start = parseTimestamp(existing?.scheduled_start);
    const end = parseTimestamp(existing?.scheduled_end);
    if (existing && start != null && end != null) {
      return {
        stationId: existing.station_id ?? '',
        ...rangeToForm(start, end, timeZone),
        players: existing.players ?? 1,
        name: existing.customer_name ?? '',
        phone: existing.customer_phone ?? '',
        note: existing.note ?? '',
      };
    }
    return {
      stationId: params.stationId ?? '',
      date: params.date || todayKey(now, timeZone),
      time: params.time ?? '',
      minutes: Number(params.minutes) || DEFAULT_RESERVATION_MINUTES,
      players: Math.max(1, Number(params.players) || 1),
      name: params.name ?? '',
      phone: params.phone ?? '',
      note: params.note ?? '',
    };
  })();

  const [stationId, setStationId] = useState(initial.stationId);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [minutes, setMinutes] = useState(String(initial.minutes));
  const [players, setPlayers] = useState(initial.players);
  const [name, setName] = useState(initial.name);
  const [phone, setPhone] = useState(initial.phone);
  const [note, setNote] = useState(initial.note);
  const [customerId, setCustomerId] = useState<string | null>(existing?.customer_id ?? null);
  const [touched, setTouched] = useState(false);

  const stations = useBranchStations(branch?.id).filter((s) => s.status === 'active');
  const station = stations.find((s) => s.id === stationId);
  const maxPlayers = station?.max_players ?? 1;
  const { rules } = useOrgPricing(org?.id);

  const result = validate(reservationSchema, {
    stationId,
    date,
    time,
    minutes,
    players: Math.min(players, maxPlayers),
    customerName: name,
    customerPhone: phone,
    note,
  });
  const range = result.ok
    ? reservationRange(result.data.date, result.data.time, result.data.minutes, timeZone)
    : null;

  // Bookings around the chosen time, to refuse a double booking before saving.
  const bookings = useBranchBookings(
    branch?.id,
    range ? range.start - 86_400_000 : now,
    range ? range.end + 86_400_000 : now,
    now,
  );
  const conflict =
    range && station ? findConflict(bookings, { id: existing?.id, stationId, ...range }) : null;
  const openSession = station ? openSessionOn(bookings, station.id) : null;
  const inPast = range ? range.end <= now : false;

  const estimate =
    range && station
      ? priceSession({
          segments: [
            {
              start: range.start,
              end: range.end,
              players: Math.min(players, maxPlayers),
              stationTypeId: station.type_id,
            },
          ],
          rules,
          timeZone,
        })
      : null;

  const fieldError = (key: keyof typeof result.errors) => {
    const e = result.errors[key];
    return touched && e ? t(`validation.${e}`) : null;
  };

  const submit = () => {
    setTouched(true);
    if (!result.ok || !range || !org || !branch || conflict || inPast) return;
    const data = result.data;
    return run(async () => {
      let id = existing?.id;
      if (id) {
        await updateReservation(id, {
          stationId: data.stationId,
          start: range.start,
          end: range.end,
          players: data.players,
          customerName: data.customerName,
          customerPhone: data.customerPhone,
          note: data.note,
          ...(pickCustomers ? { customerId } : {}),
        });
      } else {
        id = await createReservation({
          orgId: org.id,
          branchId: branch.id,
          stationId: data.stationId,
          start: range.start,
          end: range.end,
          players: data.players,
          customerName: data.customerName,
          customerPhone: data.customerPhone,
          note: data.note,
          customerId: pickCustomers ? customerId : null,
        });
      }
      if (params.rejected) {
        await powersync.execute('DELETE FROM upload_rejections WHERE id = ?', [params.rejected]);
      }
      router.replace({ pathname: '/reservations/[id]', params: { id } });
    });
  };

  if (params.id && (!existing || existing.status !== 'reserved')) {
    return (
      <Screen>
        <ScreenHeader title={t('reservations.edit')} />
        <Notice tone="warning" message={t('reservations.cantEdit')} />
      </Screen>
    );
  }

  const money = (amount: number) => formatMoney(amount, i18n.language);

  return (
    <Screen>
      <ScreenHeader title={existing ? t('reservations.edit') : t('reservations.new')} />

      <Card className="gap-2">
        <Text className="text-sm font-medium">{t('reservations.station')}</Text>
        {stations.length === 0 ? <Text variant="muted">{t('floor.empty')}</Text> : null}
        <View className="flex-row flex-wrap gap-2">
          {stations.map((s) => (
            <Button
              key={s.id}
              label={s.name ?? ''}
              variant="secondary"
              selected={s.id === stationId}
              onPress={() => setStationId(s.id)}
              testID={`station-${s.id}`}
            />
          ))}
        </View>
        {station ? (
          <View className="flex-row items-center gap-2">
            <ColorDot color={station.type_color} />
            <Text variant="muted">{station.type_name}</Text>
          </View>
        ) : null}
        {touched && !stationId ? (
          <Text className="text-sm text-danger">{t('validation.required')}</Text>
        ) : null}
      </Card>

      <Card className="gap-3">
        <TextField
          label={t('reservations.date')}
          value={date}
          onChangeText={setDate}
          placeholder="2026-12-31"
          hint={result.errors.date ? undefined : formatDayOrNull(date, i18n.language)}
          error={fieldError('date')}
          testID="reservation-date"
        />
        <TextField
          label={t('reservations.time')}
          value={time}
          onChangeText={setTime}
          placeholder="18:00"
          error={fieldError('time')}
          testID="reservation-time"
        />
        <View className="gap-2">
          <Text className="text-sm font-medium">{t('reservations.length')}</Text>
          <View className="flex-row flex-wrap gap-2">
            {LENGTHS.map((m) => (
              <Button
                key={m}
                label={formatDuration(m, t)}
                variant="secondary"
                selected={minutes === String(m)}
                onPress={() => setMinutes(String(m))}
                testID={`length-${m}`}
              />
            ))}
          </View>
          <TextField
            label={t('sessions.minutes')}
            value={minutes}
            onChangeText={setMinutes}
            keyboardType="number-pad"
            inputMode="numeric"
            error={fieldError('minutes')}
            testID="reservation-minutes"
          />
        </View>
        {maxPlayers > 1 ? (
          <Stepper
            label={t('pricing.players')}
            value={Math.min(players, maxPlayers)}
            onChange={setPlayers}
            min={1}
            max={maxPlayers}
            decreaseLabel={t('sessions.fewerPlayers')}
            increaseLabel={t('sessions.morePlayers')}
            testID="reservation-players"
          />
        ) : null}
      </Card>

      <Card className="gap-3">
        {pickCustomers ? (
          <CustomerPicker
            value={customerId}
            onChange={(c) => {
              setCustomerId(c?.id ?? null);
              if (c) {
                setName(c.name ?? '');
                setPhone(c.phone ?? '');
              }
            }}
          />
        ) : null}
        <TextField
          label={t('reservations.customerName')}
          value={name}
          onChangeText={setName}
          error={fieldError('customerName')}
          testID="reservation-name"
        />
        <TextField
          label={t('reservations.customerPhone')}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          inputMode="tel"
          error={fieldError('customerPhone')}
          testID="reservation-phone"
        />
        <TextField
          label={t('reservations.note')}
          value={note}
          onChangeText={setNote}
          error={fieldError('note')}
          testID="reservation-note"
        />
      </Card>

      {range ? (
        <Card className="gap-1" testID="reservation-summary">
          <Text>
            {formatDay(rangeToForm(range.start, range.end, timeZone).date, i18n.language, true)}{' '}
            {timeRange(range.start, range.end, timeZone)}
          </Text>
          {estimate ? (
            <Text variant="heading">
              {t('sessions.estimatedPrice', { price: money(estimate.total) })}
            </Text>
          ) : null}
          {estimate?.uncovered.length ? (
            <Notice tone="warning" message={t('pricing.uncoveredWarning')} />
          ) : null}
        </Card>
      ) : null}

      {conflict ? (
        <Notice
          tone="danger"
          message={t('reservations.conflict', {
            time: timeRange(conflict.start, conflict.end, timeZone),
          })}
          testID="reservation-conflict"
        />
      ) : null}
      {!conflict && openSession && range && range.start < now + 30 * 60_000 ? (
        <Notice tone="warning" message={t('reservations.openSessionWarning')} />
      ) : null}
      {inPast ? <Notice tone="warning" message={t('reservations.inPast')} /> : null}

      <ErrorNotice error={error} />
      <Button
        label={existing ? t('common.save') : t('reservations.book')}
        onPress={submit}
        disabled={busy || !!conflict || inPast}
        testID="save-reservation"
      />
    </Screen>
  );
}

function formatDayOrNull(date: string, language: string): string | undefined {
  try {
    return /^\d{4}-\d{1,2}-\d{1,2}$/.test(date.trim())
      ? formatDay(date.trim(), language, true)
      : undefined;
  } catch {
    return undefined;
  }
}
