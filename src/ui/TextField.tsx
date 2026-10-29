import { TextInput, View, type TextInputProps } from 'react-native';

import { cn } from './cn';
import { Text } from './Text';

export type TextFieldProps = TextInputProps & {
  label: string;
  /** Already-translated error message. */
  error?: string | null;
  hint?: string;
  className?: string;
};

export function TextField({ label, error, hint, className, editable, ...props }: TextFieldProps) {
  return (
    <View className={cn('gap-1', className)}>
      <Text className="text-sm font-medium">{label}</Text>
      <TextInput
        accessibilityLabel={label}
        editable={editable}
        className={cn(
          'min-h-11 rounded-lg border bg-background px-3 py-2 text-base text-foreground',
          error ? 'border-danger' : 'border-border',
          editable === false && 'opacity-60',
        )}
        {...props}
      />
      {error ? (
        <Text className="text-sm text-danger" accessibilityRole="alert">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="muted">{hint}</Text>
      ) : null}
    </View>
  );
}
