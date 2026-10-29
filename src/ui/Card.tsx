import { View, type ViewProps } from 'react-native';

import { cn } from './cn';

export function Card({ className, ...props }: ViewProps & { className?: string }) {
  return (
    <View
      className={cn('gap-3 rounded-xl border border-border bg-surface p-4', className)}
      {...props}
    />
  );
}
