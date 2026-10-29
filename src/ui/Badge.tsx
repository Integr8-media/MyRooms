import { View } from 'react-native';

import { cn } from './cn';
import { Text } from './Text';

const tones = {
  neutral: 'bg-border/60',
  primary: 'bg-primary/15',
  success: 'bg-success/15',
  warning: 'bg-warning/15',
  danger: 'bg-danger/15',
} as const;

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: keyof typeof tones }) {
  return (
    <View className={cn('self-start rounded-full px-2.5 py-0.5', tones[tone])}>
      <Text className="text-xs font-medium">{label}</Text>
    </View>
  );
}
