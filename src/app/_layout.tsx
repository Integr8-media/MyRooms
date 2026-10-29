import '@/global.css';
import '@/lib/i18n';

import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { PowerSyncProvider } from '@/lib/powersync/PowerSyncProvider';
import { AppearanceProvider } from '@/lib/settings/AppearanceProvider';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppearanceProvider>
        <PowerSyncProvider>
          <Stack screenOptions={{ headerShown: false }} />
        </PowerSyncProvider>
      </AppearanceProvider>
    </SafeAreaProvider>
  );
}
