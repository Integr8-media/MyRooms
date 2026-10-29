import './polyfills';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import { config } from '@/lib/config';

let client: SupabaseClient | null = null;

/** Lazily created so the app still boots when the backend is not configured. */
export function getSupabase(): SupabaseClient {
  if (!client) {
    if (!config.supabaseUrl || !config.supabasePublishableKey) {
      throw new Error('Supabase is not configured (EXPO_PUBLIC_SUPABASE_URL / _PUBLISHABLE_KEY).');
    }
    client = createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: {
        // Web uses localStorage by default; native needs AsyncStorage.
        storage: Platform.OS === 'web' ? undefined : AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: Platform.OS === 'web',
      },
    });
  }
  return client;
}

/**
 * Phase 0 only: sign in anonymously so the sync demo has a user.
 * Replaced by real email/password auth in Phase 1.
 */
export async function ensureSession() {
  const supabase = getSupabase();
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session;
  const { data: signIn, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return signIn.session;
}
