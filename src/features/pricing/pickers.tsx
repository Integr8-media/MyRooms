import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { Button, cn, Text } from '@/ui';

import { weekdayName, WEEKDAYS } from './format';

/** Colors for station types on the floor and calendar. Readable in light and dark themes. */
export const STATION_COLORS = [
  '#2563eb',
  '#7c3aed',
  '#db2777',
  '#dc2626',
  '#ea580c',
  '#ca8a04',
  '#16a34a',
  '#0891b2',
] as const;

export function ColorDot({ color, size = 'sm' }: { color: string | null; size?: 'sm' | 'lg' }) {
  return (
    <View
      className={cn('rounded-full border border-border', size === 'sm' ? 'h-4 w-4' : 'h-9 w-9')}
      style={{ backgroundColor: color ?? 'transparent' }}
    />
  );
}

export function ColorPicker({
  value,
  onChange,
  disabled,
}: {
  value: string | null;
  onChange: (color: string) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <View className="gap-1">
      <Text className="text-sm font-medium">{t('stationTypes.color')}</Text>
      <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
        {STATION_COLORS.map((color, i) => (
          <Pressable
            key={color}
            accessibilityRole="radio"
            accessibilityLabel={t('stationTypes.colorN', { n: i + 1 })}
            accessibilityState={{ selected: value === color, disabled }}
            disabled={disabled}
            onPress={() => onChange(color)}
            className={cn(
              'rounded-full p-0.5',
              value === color ? 'border-2 border-foreground' : 'border-2 border-transparent',
            )}
            testID={`color-${i}`}
          >
            <ColorDot color={color} size="lg" />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** Toggle buttons for the days of the week (Sunday first, as in the database mask). */
export function DayPicker({
  value,
  onChange,
  disabled,
  error,
}: {
  value: readonly number[];
  onChange: (days: number[]) => void;
  disabled?: boolean;
  error?: string | null;
}) {
  const { t, i18n } = useTranslation();
  const selected = new Set(value);
  const toggle = (day: number) => {
    const next = new Set(selected);
    if (next.has(day)) next.delete(day);
    else next.add(day);
    onChange([...next].sort());
  };
  return (
    <View className="gap-1">
      <Text className="text-sm font-medium">{t('pricing.days')}</Text>
      <View className="flex-row flex-wrap gap-2">
        {WEEKDAYS.map((day) => (
          <Button
            key={day}
            label={weekdayName(day, i18n.language)}
            variant="secondary"
            selected={selected.has(day)}
            disabled={disabled}
            onPress={() => toggle(day)}
            testID={`day-${day}`}
          />
        ))}
      </View>
      {error ? (
        <Text className="text-sm text-danger" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
