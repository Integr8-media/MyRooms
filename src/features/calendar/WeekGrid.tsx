import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { dayWindow, offsetInDay, shownEnd } from '@/domain/reservations';
import { ColorDot } from '@/features/pricing/pickers';
import {
  formatDay,
  timeRange,
  type CalendarBooking,
  type CalendarStation,
} from '@/features/reservations/data';
import { cn, Text } from '@/ui';

import { blockTone } from './DayTimeline';

const tones = {
  reserved: 'bg-reserved',
  active: 'bg-warning',
  done: 'bg-muted/50',
  no_show: 'bg-danger/50',
} as const;

type Props = {
  dates: string[];
  today: string;
  timeZone: string;
  stations: CalendarStation[];
  bookings: CalendarBooking[];
  conflicts: ReadonlySet<string>;
  now: number;
  onOpenDay: (date: string) => void;
  onOpen: (booking: CalendarBooking) => void;
};

/**
 * Week view (tablets and desktop): stations as rows, 7 days as columns. Each cell is a small
 * 24-hour strip. Tap a booking to open it, or an empty spot to see that day.
 */
export function WeekGrid({
  dates,
  today,
  timeZone,
  stations,
  bookings,
  conflicts,
  now,
  onOpenDay,
  onOpen,
}: Props) {
  const { t, i18n } = useTranslation();
  const windows = dates.map((d) => dayWindow(d, timeZone));

  return (
    <View className="rounded-xl border border-border bg-surface" testID="week-grid">
      <View className="flex-row border-b border-border">
        <View className="w-28 border-e border-border" />
        {dates.map((d) => (
          <Pressable
            key={d}
            accessibilityRole="button"
            onPress={() => onOpenDay(d)}
            className={cn('flex-1 items-center py-1.5', d === today && 'bg-primary/10')}
            testID={`week-day-${d}`}
          >
            <Text className={cn('text-xs font-medium', d === today && 'text-primary')}>
              {formatDay(d, i18n.language)}
            </Text>
          </Pressable>
        ))}
      </View>

      {stations.map((s) => (
        <View key={s.id} className="min-h-12 flex-row border-b border-border">
          <View className="w-28 flex-row items-center gap-1.5 border-e border-border px-2">
            <ColorDot color={s.type_color} />
            <Text className="flex-1 text-sm font-medium" numberOfLines={1}>
              {s.name}
            </Text>
          </View>
          {windows.map((w) => {
            const here = bookings.filter(
              (b) => b.stationId === s.id && b.start < w.end && shownEnd(b, now) > w.start,
            );
            return (
              <Pressable
                key={w.date}
                accessibilityRole="button"
                accessibilityLabel={`${s.name ?? ''}, ${formatDay(w.date, i18n.language)}`}
                onPress={() => onOpenDay(w.date)}
                className={cn(
                  'flex-1 border-e border-border',
                  w.date === today && 'bg-primary/5',
                  s.status !== 'active' && 'bg-border/30',
                )}
              >
                {here.map((b) => {
                  const from = offsetInDay(b.start, w) / w.minutes;
                  const to = offsetInDay(shownEnd(b, now), w) / w.minutes;
                  const range = timeRange(b.start, b.end, timeZone);
                  const title =
                    b.customerName ??
                    (b.reservation ? t('calendar.reservation') : t('calendar.walkIn'));
                  return (
                    <Pressable
                      key={b.id}
                      accessibilityRole="button"
                      accessibilityLabel={`${title}, ${range}`}
                      onPress={() => onOpen(b)}
                      className={cn(
                        'absolute bottom-1.5 top-1.5 rounded-sm',
                        tones[blockTone(b)],
                        conflicts.has(b.id) && 'border-2 border-danger',
                      )}
                      style={{
                        start: `${from * 100}%`,
                        width: `${Math.max(2, (to - from) * 100)}%`,
                      }}
                      testID={`week-block-${b.id}-${w.date}`}
                    />
                  );
                })}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
