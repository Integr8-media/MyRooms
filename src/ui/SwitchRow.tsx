import { Switch, View } from 'react-native';

import { Text } from './Text';

export function SwitchRow({
  label,
  description,
  value,
  onValueChange,
  disabled,
  testID,
}: {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <View className="min-h-11 flex-row items-center gap-3">
      <View className="flex-1 gap-0.5">
        <Text>{label}</Text>
        {description ? <Text variant="muted">{description}</Text> : null}
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        testID={testID}
      />
    </View>
  );
}
