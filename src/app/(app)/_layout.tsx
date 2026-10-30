import { Stack } from 'expo-router';

import { useSessionAlerts } from '@/features/sessions/useSessionAlerts';

export const unstable_settings = { initialRouteName: 'index' };

export default function AppLayout() {
  useSessionAlerts();
  return <Stack screenOptions={{ headerShown: false }} />;
}
