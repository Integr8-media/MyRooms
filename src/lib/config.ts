/** Public runtime config. EXPO_PUBLIC_* vars are inlined at build time. */
export const config = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabasePublishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
  powersyncUrl: process.env.EXPO_PUBLIC_POWERSYNC_URL ?? '',
  /** Public web app URL, used in email links opened from the Windows app (e.g. https://app.example.com). */
  appUrl: process.env.EXPO_PUBLIC_APP_URL ?? '',
  /** Error tracking (Sentry or self-hosted GlitchTip). A DSN is public by design; empty = off. */
  sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? '',
  /** Shown on error reports: development, pilot, production… */
  appEnv: process.env.EXPO_PUBLIC_APP_ENV ?? (__DEV__ ? 'development' : 'production'),
};

export const isBackendConfigured = Boolean(
  config.supabaseUrl && config.supabasePublishableKey && config.powersyncUrl,
);
