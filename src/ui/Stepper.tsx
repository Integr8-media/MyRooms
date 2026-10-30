import { View } from 'react-native';

import { Button } from './Button';
import { Text } from './Text';

/** A number with − / + buttons, kept within [min, max]. */
export function Stepper({
  label,
  value,
  onChange,
  min,
  max,
  decreaseLabel,
  increaseLabel,
  disabled,
  testID,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  decreaseLabel: string;
  increaseLabel: string;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <View className="gap-1">
      <Text className="text-sm font-medium">{label}</Text>
      <View className="flex-row items-center gap-3">
        <Button
          label="−"
          variant="secondary"
          className="w-12"
          accessibilityLabel={decreaseLabel}
          disabled={disabled || value <= min}
          onPress={() => onChange(Math.max(min, value - 1))}
          testID={testID ? `${testID}-decrease` : undefined}
        />
        <Text
          variant="heading"
          className="min-w-8 text-center"
          accessibilityLiveRegion="polite"
          testID={testID ? `${testID}-value` : undefined}
        >
          {value}
        </Text>
        <Button
          label="+"
          variant="secondary"
          className="w-12"
          accessibilityLabel={increaseLabel}
          disabled={disabled || value >= max}
          onPress={() => onChange(Math.min(max, value + 1))}
          testID={testID ? `${testID}-increase` : undefined}
        />
      </View>
    </View>
  );
}
