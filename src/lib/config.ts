/** Public runtime config. EXPO_PUBLIC_* vars are inlined at build time. */
export const config = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabasePublishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
  powersyncUrl: process.env.EXPO_PUBLIC_POWERSYNC_URL ?? '',
};

export const isBackendConfigured = Boolean(
  config.supabaseUrl && config.supabasePublishableKey && config.powersyncUrl,
);
