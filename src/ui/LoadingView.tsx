import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Text } from './Text';

/** Full-screen spinner with an optional message and extra content (e.g. a sign-out button). */
export function LoadingView({ message, children }: { message?: string; children?: ReactNode }) {
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-background p-6">
      <ActivityIndicator size="large" />
      {message ? <Text className="text-center">{message}</Text> : null}
      {children}
    </View>
  );
}
