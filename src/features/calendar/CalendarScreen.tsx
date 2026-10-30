import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWindowDimensions, View } from 'react-native';

import { DEFAULT_WEEK_START } from '@/domain/income';
import {
  addDays,
  dayWindow,
  overlappingIds,
  rangeToForm,
  todayKey,
  weekDates,
} from '@/domain/reservations';
import { parseDateKey } from '@/domain/zoned-time';
import { ErrorNotice } from '@/features/common/ErrorNotice';
import {
  formatDay,
  timeRange,
  useBranchBookings,
  useBranchStations,
  type CalendarBooking,
} from '@/features/reservations/data';
import { updateReservation } from '@/features/reservations/api';
import { useNow } from '@/features/sessions/data';
import { RejectedChanges } from '@/features/sync/RejectedChanges';
import { BranchSwitcher } from '@/features/workspace/BranchSwitcher';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import { isLanguage, isRTL } from '@/lib/i18n';
import { useAsyncAction } from '@/lib/useAsyncAction';
import { Button, Card, Notice, Screen, ScreenHeader, SegmentedControl, Text } from '@/ui';

import { DayTimeline, type MoveRequest } from './DayTimeline';
import { WeekGrid } from './WeekGrid';

type View_ = 'day' | 'week';
type KindFilter = 'all' | 'pc_desk' | 'ps_room';

/** The week view needs room for 7 columns. */
const WEEK_MIN_WIDTH = 900;

/** Timeline of the branch's stations: reservations, running and past sessions. */
export function CalendarScreen() {
  const { t, i18n } = useTranslation();
  const params = useLocalSearchParams<{ date?: string }>();
  const { org, branch, can } = useWorkspace();
  const timeZone = org?.timezone ?? 'Africa/Cairo';
  const now = useNow(30_000);
  const { width } = useWindowDimensions();
  const rtl = isLanguage(i18n.language) && isRTL(i18n.language);
  const { error, run } = useAsyncAction();

  const today = todayKey(now, timeZone);
  const [date, setDate] = useState(() =>
    params.date && parseDateKey(params.date) ? params.date : todayKey(Date.now(), timeZone),
  );
  const [view, setView] = useState<View_>('day');
  const [kind, setKind] = useState<KindFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const weekAllowed = width >= WEEK_MIN_WIDTH;
  const shown: View_ = weekAllowed ? view : 'day';

  const dates = shown === 'week' ? weekDates(date, DEFAULT_WEEK_START) : [date];
  const first = dayWindow(dates[0]!, timeZone);
  const last = dayWindow(dates[dates.length - 1]!, timeZone);

  const allStations = useBranchStations(branch?.id);
  const stations = allStations.filter((s) => kind === 'all' || s.type_kind === kind);
  const kinds = new Set(allStations.map((s) => s.type_kind));
  const bookings = useBranchBookings(branch?.id, first.start, last.end, now);
  const conflicts = overlappingIds(bookings, now);
  const selected = bookings.find((b) => b.id === selectedId) ?? null;
  const canEdit = can('reservations.manage');

  const step = (days: number) => {
    setSelectedId(null);
    setDate((d) => addDays(d, days));
  };

  const open = (b: CalendarBooking) => {
    setSelectedId(null);
    if (b.status === 'reserved' || b.status === 'no_show') {
      router.push({ pathname: '/reservations/[id]', params: { id: b.id } });
    } else {
      router.push({ pathname: '/sessions/[id]', params: { id: b.id } });
    }
  };

  const create = (stationId: string, start: number) => {
    const form = rangeToForm(start, start, timeZone);
    router.push({
      pathname: '/reservations/new',
      params: { stationId, date: form.date, time: form.time },
    });
  };

  const move = (request: MoveRequest) =>
    run(() =>
      updateReservation(request.id, {
        stationId: request.stationId,
        start: request.start,
        end: request.end,
      }),
    );

  // Arrows point the way time goes: right to left in Arabic.
  const [back, forward] = rtl ? ['›', '‹'] : ['‹', '›'];
  const span = shown === 'week' ? 7 : 1;

  return (
    <Screen wide>
      <ScreenHeader
        title={t('calendar.title')}
        actions={
          canEdit ? (
            <Button
              label={t('reservations.new')}
              onPress={() => router.push({ pathname: '/reservations/new', params: { date } })}
              testID="new-reservation"
            />
          ) : null
        }
      />
      <BranchSwitcher />
      <RejectedChanges />

      <View className="flex-row flex-wrap items-center gap-2">
        <Button
          label={back}
          variant="secondary"
          accessibilityLabel={t('calendar.previous')}
          onPress={() => step(-span)}
          testID="calendar-prev"
        />
        <Button
          label={t('calendar.today')}
          variant="secondary"
          selected={date === today}
          onPress={() => {
            setSelectedId(null);
            setDate(today);
          }}
          testID="calendar-today"
        />
        <Button
          label={forward}
          variant="secondary"
          accessibilityLabel={t('calendar.next')}
          onPress={() => step(span)}
          testID="calendar-next"
        />
        <Text variant="heading" className="flex-1" testID="calendar-date">
          {shown === 'week'
            ? `${formatDay(dates[0]!, i18n.language)} – ${formatDay(dates[6]!, i18n.language, true)}`
            : formatDay(date, i18n.language, true)}
        </Text>
        {weekAllowed ? (
          <SegmentedControl<View_>
            value={view}
            onChange={(v) => {
              setSelectedId(null);
              setView(v);
            }}
            options={[
              { value: 'day', label: t('calendar.day') },
              { value: 'week', label: t('calendar.week') },
            ]}
          />
        ) : null}
      </View>

      {kinds.size > 1 ? (
        <SegmentedControl<KindFilter>
          value={kind}
          onChange={setKind}
          options={[
            { value: 'all', label: t('calendar.allStations') },
            { value: 'pc_desk', label: t('stationTypes.kindPc') },
            { value: 'ps_room', label: t('stationTypes.kindPs') },
          ]}
        />
      ) : null}

      {!branch ? <Notice tone="warning" message={t('home.noBranch')} /> : null}
      {branch && stations.length === 0 ? (
        <Card>
          <Text variant="muted">{t('floor.empty')}</Text>
        </Card>
      ) : null}
      {conflicts.size ? <Notice tone="danger" message={t('calendar.overlapWarning')} /> : null}
      <ErrorNotice error={error} />

      {stations.length && shown === 'day' ? (
        <>
          <Text variant="muted">
            {canEdit ? t('calendar.dayHint') : t('calendar.dayHintReadOnly')}
          </Text>
          {selected?.end != null ? (
            <Card className="flex-row flex-wrap items-center gap-2 py-2" testID="selection-bar">
              <Text className="flex-1">
                {t('calendar.selected', {
                  name: selected.customerName ?? t('calendar.reservation'),
                  time: timeRange(selected.start, selected.end, timeZone),
                })}
              </Text>
              <Button
                label={t('calendar.open')}
                onPress={() => open(selected)}
                testID="selection-open"
              />
              <Button
                label={t('common.done')}
                variant="secondary"
                onPress={() => setSelectedId(null)}
              />
            </Card>
          ) : null}
          <DayTimeline
            window={first}
            timeZone={timeZone}
            stations={stations}
            bookings={bookings}
            conflicts={conflicts}
            now={now}
            selectedId={selectedId}
            canEdit={canEdit}
            onSelect={setSelectedId}
            onOpen={open}
            onCreate={create}
            onMove={move}
          />
        </>
      ) : null}

      {stations.length && shown === 'week' ? (
        <WeekGrid
          dates={dates}
          today={today}
          timeZone={timeZone}
          stations={stations}
          bookings={bookings}
          conflicts={conflicts}
          now={now}
          onOpenDay={(d) => {
            setDate(d);
            setView('day');
          }}
          onOpen={open}
        />
      ) : null}

      <View className="flex-row flex-wrap gap-3" testID="calendar-legend">
        {(['reserved', 'active', 'completed', 'no_show'] as const).map((s) => (
          <View key={s} className="flex-row items-center gap-1.5">
            <View
              className={
                s === 'reserved'
                  ? 'h-3 w-3 rounded-sm bg-reserved'
                  : s === 'active'
                    ? 'h-3 w-3 rounded-sm bg-warning'
                    : s === 'completed'
                      ? 'h-3 w-3 rounded-sm bg-muted/50'
                      : 'h-3 w-3 rounded-sm bg-danger/50'
              }
            />
            <Text variant="muted">{t(`calendar.blockStatus.${s}`)}</Text>
          </View>
        ))}
      </View>
    </Screen>
  );
}
