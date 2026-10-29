import { View } from 'react-native';

import { Button } from './Button';

type Option<T extends string> = { value: T; label: string };

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
      {options.map((option) => (
        <Button
          key={option.value}
          label={option.label}
          variant="secondary"
          selected={option.value === value}
          onPress={() => onChange(option.value)}
        />
      ))}
    </View>
  );
}
