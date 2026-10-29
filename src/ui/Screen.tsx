import type { ReactNode } from 'react';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/** Page container: safe areas, theme background, centered max width on large screens. */
export function Screen({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerClassName="w-full max-w-3xl self-center gap-4 p-4">
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
