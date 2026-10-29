import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

import { config } from '@/lib/config';

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Where links in auth emails should send the user back to.
 * Phones: the app's deep link (myrooms://…). Web: this site.
 * Windows: the hosted web app, because email links open in the browser, not in Tauri.
 * Every URL used here must be in Supabase Auth's redirect allow list (see deploy/README.md).
 */
export function authRedirectUrl(path: string): string {
  if (Platform.OS !== 'web') return Linking.createURL(path);
  const base = isTauri() && config.appUrl ? config.appUrl : window.location.origin;
  return new URL(path, base).toString();
}
