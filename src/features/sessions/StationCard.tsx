import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { formatMoney } from '@/domain/money';
import {
  elapsedMs,
  formatTimer,
  remainingMs,
  type FloorStatus,
  type SessionTiming,
} from '@/domain/sessions';
import { ColorDot } from '@/features/pricing/pickers';
import { Badge, cn, Text } from '@/ui';

const tone = {
  free: { box: 'border-success/60 bg-success/10', badge: 'success' },
  active: { box: 'border-primary/60 bg-primary/10', badge: 'primary' },
  ending_soon: { box: 'border-warning bg-warning/15', badge: 'warning' },
  overtime: { box: 'border-danger bg-danger/15', badge: 'danger' },
  maintenance: { box: 'border-border bg-border/30 opacity-70', badge: 'neutral' },
  reserved_soon: { box: 'border-reserved bg-reserved/10', badge: 'reserved' },
} as const;

/** What a card shows: the floor status, or "reserved soon" for a free station. */
export type CardStatus = FloorStatus | 'reserved_soon';

export type StationCardProps = {
  name: string;
  typeName: string | null;
  color: string | null;
  status: CardStatus;
  /** The next reservation ("Reserved 18:00 · Ahmed"), and whether this session runs into it. */
  reservation?: { label: string; warn: boolean } | null;
  timing: SessionTiming | null;
  players: number | null;
  estimate: number | null;
  now: number;
  onPress?: () => void;
  testID?: string;
};

/** One station on the live floor: status, timer, players and running cost. */
export function StationCard({
  name,
  typeName,
  color,
  status,
  reservation,
  timing,
  players,
  estimate,
  now,
  onPress,
  testID,
}: StationCardProps) {
  const { t, i18n } = useTranslation();
  const remaining = timing ? remainingMs(timing, now) : null;
  const timer = timing ? formatTimer(remaining ?? elapsedMs(timing, now)) : null;
  const timerLabel =
    remaining == null ? t('floor.elapsed') : remaining < 0 ? t('floor.overBy') : t('floor.left');
  const statusLabel = t(`floor.status.${status}`);
  const reservationLine = reservation ? (
    <Text
      className={cn('text-sm', reservation.warn ? 'font-medium text-danger' : 'text-reserved')}
      numberOfLines={1}
      testID={testID ? `${testID}-reservation` : undefined}
    >
      {reservation.label}
    </Text>
  ) : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[
        name,
        statusLabel,
        timer ? `${timerLabel} ${timer}` : null,
        reservation?.label,
      ]
        .filter(Boolean)
        .join(', ')}
      accessibilityState={{ disabled: !onPress }}
      disabled={!onPress}
      onPress={onPress}
      className={cn(
        'min-h-36 flex-1 gap-1.5 rounded-xl border-2 p-3 active:opacity-80',
        tone[status].box,
      )}
      testID={testID}
    >
      <View className="flex-row items-center gap-2">
        <ColorDot color={color} />
        <Text variant="heading" className="flex-1" numberOfLines={1}>
          {name}
        </Text>
      </View>
      {typeName ? (
        <Text variant="muted" numberOfLines={1}>
          {typeName}
        </Text>
      ) : null}
      <Badge label={statusLabel} tone={tone[status].badge} />
      {timing ? (
        <>
          <View className="flex-row items-baseline gap-2">
            <Text variant="muted">{timerLabel}</Text>
            <Text
              className={cn(
                'text-2xl font-bold tabular-nums',
                status === 'overtime' && 'text-danger',
              )}
              testID={testID ? `${testID}-timer` : undefined}
            >
              {timer}
            </Text>
          </View>
          <View className="flex-row flex-wrap gap-x-3">
            {players ? <Text variant="muted">{t('floor.players', { count: players })}</Text> : null}
            {estimate != null ? (
              <Text className="font-medium">{formatMoney(estimate, i18n.language)}</Text>
            ) : null}
          </View>
          {reservationLine}
        </>
      ) : (
        <>
          <Text variant="muted">
            {status === 'maintenance'
              ? t('floor.outOfService')
              : status === 'reserved_soon'
                ? t('floor.tapToCheckIn')
                : t('floor.tapToStart')}
          </Text>
          {reservationLine}
        </>
      )}
    </Pressable>
  );
}
