import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { createContext, use, useEffect, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { isBackendConfigured } from '@/lib/config';
import { getSupabase } from '@/lib/supabase/client';

import { needsNewPassword, parseAuthUrl } from './auth-url';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

type AuthContextValue = {
  status: AuthStatus;
  session: Session | null;
  /** True after a password-reset or invitation link: the user must pick a password first. */
  needsPassword: boolean;
  /** Error code from an expired or invalid email link, shown on the sign-in screen. */
  linkError: string | null;
  passwordSet: () => void;
  clearLinkError: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

// Web: Supabase reads (and clears) the email-link fragment when its client starts,
// so capture what the link was for at load time, before that happens.
const initialWebLink =
  Platform.OS === 'web' && typeof window !== 'undefined'
    ? parseAuthUrl(window.location.href)
    : null;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isBackendConfigured);
  const [needsPassword, setNeedsPassword] = useState(() => needsNewPassword(initialWebLink));
  const [linkError, setLinkError] = useState<string | null>(initialWebLink?.errorCode ?? null);

  useEffect(() => {
    if (!isBackendConfigured) return;

    const supabase = getSupabase();
    let active = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === 'PASSWORD_RECOVERY') setNeedsPassword(true);
      if (event === 'SIGNED_OUT') setNeedsPassword(false);
    });

    // Phones: email links open the app through its deep link (myrooms://…#access_token=…).
    const handleUrl = async (url: string | null) => {
      const link = url ? parseAuthUrl(url) : null;
      if (!link) return;
      if (link.errorCode) {
        setLinkError(link.errorCode);
        return;
      }
      if (link.accessToken && link.refreshToken) {
        if (needsNewPassword(link)) setNeedsPassword(true);
        const { error } = await supabase.auth.setSession({
          access_token: link.accessToken,
          refresh_token: link.refreshToken,
        });
        if (error) setLinkError(error.code ?? 'unknown');
      }
    };
    let urlListener: { remove: () => void } | undefined;
    if (Platform.OS !== 'web') {
      void Linking.getInitialURL().then(handleUrl);
      urlListener = Linking.addEventListener('url', (event) => void handleUrl(event.url));
    }

    return () => {
      active = false;
      listener.subscription.unsubscribe();
      urlListener?.remove();
    };
  }, []);

  const value: AuthContextValue = {
    status: loading ? 'loading' : session ? 'signedIn' : 'signedOut',
    session,
    needsPassword: needsPassword && !!session,
    linkError,
    passwordSet: () => setNeedsPassword(false),
    clearLinkError: () => setLinkError(null),
  };

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const value = use(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
