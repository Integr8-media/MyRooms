import { Stack } from 'expo-router';

import { ErrorScreen } from '@/features/errors/ErrorScreen';
import { useSessionAlerts } from '@/features/sessions/useSessionAlerts';
import { useSyncWatch } from '@/features/sync/useSyncWatch';

// A crashed screen keeps the providers (workspace, sync) around it.
export { ErrorScreen as ErrorBoundary };

export const unstable_settings = { initialRouteName: 'index' };

export default function AppLayout() {
  useSessionAlerts();
  useSyncWatch();
  return <Stack screenOptions={{ headerShown: false }} />;
}
