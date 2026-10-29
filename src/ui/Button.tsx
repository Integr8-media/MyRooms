import { Pressable, type PressableProps } from 'react-native';

import { cn } from './cn';
import { Text } from './Text';

const variants = {
  primary: { box: 'bg-primary', text: 'text-primary-foreground' },
  secondary: { box: 'bg-surface border border-border', text: 'text-foreground' },
  danger: { box: 'bg-danger', text: 'text-primary-foreground' },
} as const;

export type ButtonProps = Omit<PressableProps, 'children'> & {
  label: string;
  variant?: keyof typeof variants;
  selected?: boolean;
  className?: string;
};

export function Button({
  label,
  variant = 'primary',
  selected,
  disabled,
  className,
  ...props
}: ButtonProps) {
  const v = variants[selected ? 'primary' : variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, selected }}
      disabled={disabled}
      className={cn(
        'min-h-11 items-center justify-center rounded-lg px-4 py-2 active:opacity-80',
        v.box,
        disabled && 'opacity-50',
        className,
      )}
      {...props}
    >
      <Text className={cn('text-center font-medium', v.text)}>{label}</Text>
    </Pressable>
  );
}
