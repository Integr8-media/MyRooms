import { useRef, useState, type ComponentRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, ScrollView, View } from 'react-native';

import {
  dragRange,
  hourMarks,
  offsetInDay,
  shownEnd,
  slotAt,
  type DayWindow,
} from '@/domain/reservations';
import { formatClock } from '@/domain/zoned-time';
import { ColorDot } from '@/features/pricing/pickers';
import type { CalendarBooking, CalendarStation } from '@/features/reservations/data';
import { timeRange } from '@/features/reservations/data';
import { isLanguage, isRTL } from '@/lib/i18n';
import { cn, Text } from '@/ui';

import { BookingBlock, type BlockTone, type DragDelta } from './BookingBlock';

/** Pixels per minute: an hour is 96 px wide. */
export const PX_PER_MINUTE = 1.6;
export const ROW_HEIGHT = 56;
const NAME_WIDTH = 112;
const HEADER_HEIGHT = 28;

export type MoveRequest = { id: string; stationId: string; start: number; end: number };

type Props = {
  window: DayWindow;
  timeZone: string;
  stations: CalendarStation[];
  bookings: CalendarBooking[];
  conflicts: ReadonlySet<string>;
  now: number;
  selectedId: string | null;
  /** May book, move and resize reservations. */
  canEdit: boolean;
  onSelect: (id: string | null) => void;
  onOpen: (booking: CalendarBooking) => void;
  onCreate: (stationId: string, start: number) => void;
  onMove: (request: MoveRequest) => void;
};

export function blockTone(b: CalendarBooking): BlockTone {
  if (b.status === 'reserved') return 'reserved';
  if (b.status === 'active') return 'active';
  if (b.status === 'no_show') return 'no_show';
  return 'done';
}

/**
 * Day view: stations as rows, the day's hours as columns (scrolls sideways). Tap an empty slot
 * to book it; tap a reservation to select it, then drag it to another time or station, or drag
 * its end handle to change its length. Tap it again to open it.
 */
export function DayTimeline({
  window,
  timeZone,
  stations,
  bookings,
  conflicts,
  now,
  selectedId,
  canEdit,
  onSelect,
  onOpen,
  onCreate,
  onMove,
}: Props) {
  const { t, i18n } = useTranslation();
  const rtl = isLanguage(i18n.language) && isRTL(i18n.language);
  const width = window.minutes * PX_PER_MINUTE;
  const marks = hourMarks(window, timeZone);
  const showNow = now >= window.start && now < window.end;
  const nowOffset = offsetInDay(now, window) * PX_PER_MINUTE;

  // Open on the current time (today) or 08:00.
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const [viewport, setViewport] = useState(0);
  const scrollToStart = (visible: number) => {
    const target = Math.max(0, (showNow ? nowOffset : 8 * 60 * PX_PER_MINUTE) - 96);
    const x = Math.min(target, Math.max(0, width - visible));
    // Sideways scroll offsets count from the physical left on phones and are negative in
    // right-to-left pages on the web.
    const physical = !rtl ? x : Platform.OS === 'web' ? -x : width - visible - x;
    scroll.current?.scrollTo({ x: physical, animated: false });
  };

  const rowOf = new Map(stations.map((s, i) => [s.id, i]));

  const drop = (b: CalendarBooking, mode: 'move' | 'resize', d: DragDelta) => {
    if (b.end == null) return;
    // Time runs right to left in Arabic.
    const minutes = (rtl ? -d.dx : d.dx) / PX_PER_MINUTE;
    const range = dragRange({ start: b.start, end: b.end }, minutes, mode);
    let stationId = b.stationId;
    if (mode === 'move') {
      const index = (rowOf.get(b.stationId) ?? 0) + Math.round(d.dy / ROW_HEIGHT);
      stationId = stations[Math.min(stations.length - 1, Math.max(0, index))]?.id ?? b.stationId;
    }
    if (stationId === b.stationId && range.start === b.start && range.end === b.end) return;
    onMove({ id: b.id, stationId, ...range });
  };

  const tapRow = (station: CalendarStation, locationX: number) => {
    if (selectedId) return onSelect(null);
    if (!canEdit || station.status !== 'active') return;
    const px = rtl ? width - locationX : locationX;
    const start = slotAt(window, px / PX_PER_MINUTE);
    onCreate(station.id, start);
  };

  return (
    <View className="flex-row rounded-xl border border-border bg-surface" testID="day-timeline">
      {/* Station names (start side). */}
      <View style={{ width: NAME_WIDTH }} className="border-e border-border">
        <View style={{ height: HEADER_HEIGHT }} className="border-b border-border" />
        {stations.map((s) => (
          <View
            key={s.id}
            style={{ height: ROW_HEIGHT }}
            className="justify-center gap-0.5 border-b border-border px-2"
          >
            <View className="flex-row items-center gap-1.5">
              <ColorDot color={s.type_color} />
              <Text className="flex-1 text-sm font-medium" numberOfLines={1}>
                {s.name}
              </Text>
            </View>
            <Text className="text-xs" variant="muted" numberOfLines={1}>
              {s.status === 'active' ? s.type_name : t('floor.status.maintenance')}
            </Text>
          </View>
        ))}
      </View>

      <ScrollView
        ref={scroll}
        horizontal
        className="flex-1"
        onLayout={(e) => {
          const visible = e.nativeEvent.layout.width;
          if (visible !== viewport) {
            setViewport(visible);
            scrollToStart(visible);
          }
        }}
        testID="day-timeline-scroll"
      >
        <View style={{ width }}>
          {/* Hours. */}
          <View style={{ height: HEADER_HEIGHT }} className="border-b border-border">
            {marks.map((m) => (
              <Text
                key={m.offset}
                className="absolute top-1 px-1 text-xs"
                variant="muted"
                style={{ start: m.offset * PX_PER_MINUTE }}
              >
                {formatClock(m.hour * 60)}
              </Text>
            ))}
          </View>

          <View>
            {/* Hour lines and the current time, under the rows. */}
            {marks.map((m) => (
              <View
                key={m.offset}
                pointerEvents="none"
                className="absolute bottom-0 top-0 w-px bg-border"
                style={{ start: m.offset * PX_PER_MINUTE }}
              />
            ))}

            {stations.map((s) => (
              <Pressable
                key={s.id}
                accessibilityRole="button"
                accessibilityLabel={
                  s.status === 'active' && canEdit
                    ? t('calendar.bookStation', { station: s.name ?? '' })
                    : (s.name ?? '')
                }
                onPress={(e) => tapRow(s, e.nativeEvent.locationX)}
                style={{ height: ROW_HEIGHT }}
                className={cn('border-b border-border', s.status !== 'active' && 'bg-border/30')}
                testID={`timeline-row-${s.id}`}
              >
                {bookings
                  .filter((b) => b.stationId === s.id)
                  .map((b) => {
                    const startOffset = offsetInDay(b.start, window);
                    const endOffset = offsetInDay(shownEnd(b, now), window);
                    const range = timeRange(b.start, b.end, timeZone);
                    const title =
                      b.customerName ??
                      (b.reservation ? t('calendar.reservation') : t('calendar.walkIn'));
                    const status = t(`calendar.blockStatus.${b.status}`);
                    return (
                      <BookingBlock
                        key={b.id}
                        offset={startOffset * PX_PER_MINUTE + 1}
                        width={Math.max(4, (endOffset - startOffset) * PX_PER_MINUTE - 2)}
                        height={ROW_HEIGHT - 6}
                        tone={blockTone(b)}
                        title={title}
                        subtitle={range}
                        accessibilityLabel={`${title}, ${range}, ${status}`}
                        conflict={conflicts.has(b.id)}
                        selected={selectedId === b.id}
                        draggable={canEdit && b.status === 'reserved'}
                        rtl={rtl}
                        onPress={() =>
                          canEdit && b.status === 'reserved' && selectedId !== b.id
                            ? onSelect(b.id)
                            : onOpen(b)
                        }
                        onDragEnd={(mode, d) => drop(b, mode, d)}
                        testID={`block-${b.id}`}
                      />
                    );
                  })}
              </Pressable>
            ))}

            {showNow ? (
              <View
                pointerEvents="none"
                className="absolute bottom-0 top-0 w-0.5 bg-danger"
                style={{ start: nowOffset }}
                testID="now-line"
              />
            ) : null}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
