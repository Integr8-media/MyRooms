import { View } from 'react-native';

import { cn } from './cn';
import { Text } from './Text';

const tones = {
  info: 'border-primary/40 bg-primary/10',
  success: 'border-success/40 bg-success/10',
  warning: 'border-warning/40 bg-warning/10',
  danger: 'border-danger/40 bg-danger/10',
} as const;

/** An inline message box (errors, confirmations, hints). */
export function Notice({
  message,
  tone = 'info',
  testID,
}: {
  message: string;
  tone?: keyof typeof tones;
  testID?: string;
}) {
  return (
    <View
      className={cn('rounded-lg border p-3', tones[tone])}
      accessibilityRole={tone === 'danger' ? 'alert' : undefined}
      testID={testID}
    >
      <Text>{message}</Text>
    </View>
  );
}
