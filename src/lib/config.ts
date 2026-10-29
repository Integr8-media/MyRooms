/** Public runtime config. EXPO_PUBLIC_* vars are inlined at build time. */
export const config = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabasePublishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
  powersyncUrl: process.env.EXPO_PUBLIC_POWERSYNC_URL ?? '',
  /** Public web app URL, used in email links opened from the Windows app (e.g. https://app.example.com). */
  appUrl: process.env.EXPO_PUBLIC_APP_URL ?? '',
};

export const isBackendConfigured = Boolean(
  config.supabaseUrl && config.supabasePublishableKey && config.powersyncUrl,
);
