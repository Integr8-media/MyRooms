import type { ReactNode } from 'react';

import { cn } from './cn';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/** Page container: safe areas, theme background, centered max width on large screens. */
export function Screen({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView
        contentContainerClassName={cn(
          'w-full self-center gap-4 p-4',
          wide ? 'max-w-6xl' : 'max-w-3xl',
        )}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
