import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { cn } from './cn';

const variants = {
  title: 'text-3xl font-bold text-foreground',
  heading: 'text-lg font-semibold text-foreground',
  body: 'text-base text-foreground',
  muted: 'text-sm text-muted',
} as const;

export type TextProps = RNTextProps & { variant?: keyof typeof variants; className?: string };

/** Always use this instead of RN Text: it picks up theme colors and aligns to the reading direction. */
export function Text({ variant = 'body', className, ...props }: TextProps) {
  return <RNText className={cn('text-start', variants[variant], className)} {...props} />;
}
