import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import type { ComponentType } from 'react';
import { Platform } from 'react-native';

import { config } from '@/lib/config';

import { scrubBreadcrumb, scrubEvent } from './scrub';

/**
 * Error tracking with the Sentry SDK. The DSN can point at sentry.io or at a self-hosted
 * GlitchTip (deploy/glitchtip). Without EXPO_PUBLIC_SENTRY_DSN nothing is sent and every
 * call here does nothing. Personal data is removed before sending (scrub.ts).
 */
export const isMonitoringEnabled = Boolean(config.sentryDsn);

let started = false;

export function initMonitoring() {
  if (!isMonitoringEnabled || started) return;
  started = true;
  Sentry.init({
    dsn: config.sentryDsn,
    environment: config.appEnv,
    release: `myrooms@${Constants.expoConfig?.version ?? 'dev'}`,
    sendDefaultPii: false,
    // Errors only: no tracing, replays or profiling (keeps GlitchTip light and data small).
    tracesSampleRate: 0,
    attachScreenshot: false,
    attachViewHierarchy: false,
    // Offline devices: events are cached and sent later by the native SDK; web drops them.
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (crumb) => {
      // Console noise from PowerSync and React; keep warnings and errors only.
      if (crumb.category === 'console' && crumb.level !== 'warning' && crumb.level !== 'error') {
        return null;
      }
      return scrubBreadcrumb(crumb);
    },
  });
  Sentry.setTag('platform', Platform.OS);
}

/** Who is using the app (ids and role only, never names or emails). */
export function setMonitoringUser(
  user: {
    userId: string;
    orgId: string | null;
    role: string | null;
    branchId: string | null;
  } | null,
) {
  if (!isMonitoringEnabled) return;
  if (!user) {
    Sentry.setUser(null);
    return;
  }
  Sentry.setUser({ id: user.userId });
  Sentry.setTags({
    org: user.orgId ?? 'none',
    role: user.role ?? 'none',
    branch: user.branchId ?? 'none',
  });
}

type Context = { area: string } & Record<string, string | number | boolean | null | undefined>;

/** Reports an unexpected error (never shown to staff: they see the translated message). */
export function reportError(error: unknown, context: Context) {
  if (!isMonitoringEnabled) return;
  Sentry.withScope((scope) => {
    scope.setTag('area', context.area);
    scope.setContext('details', context);
    Sentry.captureException(error);
  });
}

/** Reports something worth knowing that isn't a crash (e.g. a refused upload). */
export function reportWarning(message: string, context: Context) {
  if (!isMonitoringEnabled) return;
  Sentry.withScope((scope) => {
    scope.setTag('area', context.area);
    scope.setContext('details', context);
    scope.setLevel('warning');
    Sentry.captureMessage(message);
  });
}

/** Wraps the root component so render errors and native crashes are caught. */
export function wrapRoot<P extends Record<string, unknown>>(
  component: ComponentType<P>,
): ComponentType<P> {
  return isMonitoringEnabled ? Sentry.wrap(component) : component;
}
