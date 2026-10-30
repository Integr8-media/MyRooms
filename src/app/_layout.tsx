import '@/global.css';
import '@/lib/i18n';

import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ErrorScreen } from '@/features/errors/ErrorScreen';
import { BootScreen } from '@/features/workspace/BootScreen';
import { useWorkspace, WorkspaceProvider } from '@/features/workspace/WorkspaceProvider';
import { AuthProvider, useAuth } from '@/lib/auth/AuthProvider';
import { initMonitoring, wrapRoot } from '@/lib/monitoring';
import { PowerSyncProvider } from '@/lib/powersync/PowerSyncProvider';
import { AppearanceProvider } from '@/lib/settings/AppearanceProvider';

// Before anything renders, so start-up errors are caught too.
initMonitoring();

export { ErrorScreen as ErrorBoundary };

export default wrapRoot(RootLayout);

function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppearanceProvider>
        <AuthProvider>
          <PowerSyncProvider>
            <WorkspaceProvider>
              <RootNavigator />
            </WorkspaceProvider>
          </PowerSyncProvider>
        </AuthProvider>
      </AppearanceProvider>
    </SafeAreaProvider>
  );
}

/**
 * Exactly one group is reachable at a time; when the state changes, the
 * router moves to the group that became available.
 *   signed out          -> (auth): sign in, sign up, forgot password
 *   reset/invite link   -> set-password
 *   no organization     -> onboarding
 *   member of an org    -> (app)
 */
function RootNavigator() {
  const { status, needsPassword } = useAuth();
  const workspace = useWorkspace();

  const signedIn = status === 'signedIn';
  const ready = signedIn && !needsPassword;

  // Keep the router unmounted until we know where to go, so a deep link
  // (e.g. /set-password#access_token=…) is not redirected away too early.
  if (status === 'loading' || (ready && workspace.status === 'loading')) return <BootScreen />;

  const hasOrg = workspace.status === 'ready';
  // Where a blocked route sends you: the one screen that fits the current state.
  const home = !signedIn
    ? '/sign-in'
    : needsPassword
      ? '/set-password'
      : hasOrg
        ? '/'
        : '/onboarding';

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!signedIn} redirectTo={home}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && needsPassword} redirectTo={home}>
        <Stack.Screen name="set-password" />
      </Stack.Protected>
      <Stack.Protected guard={ready && hasOrg} redirectTo={home}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={ready && !hasOrg} redirectTo={home}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
    </Stack>
  );
}
