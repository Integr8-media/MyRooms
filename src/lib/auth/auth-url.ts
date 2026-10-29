/** What an email link (confirm sign-up, reset password, invitation) carries back to the app. */
export type AuthLink = {
  accessToken?: string;
  refreshToken?: string;
  /** 'signup' | 'recovery' | 'invite' | 'magiclink' | 'email_change' */
  type?: string;
  errorCode?: string;
};

/**
 * Reads Supabase auth parameters from a link. They arrive in the URL fragment
 * (`#access_token=…&type=recovery`) or, for errors, sometimes in the query string.
 * Returns null when the URL carries nothing auth-related.
 */
export function parseAuthUrl(url: string): AuthLink | null {
  const params = new URLSearchParams();
  const hashIndex = url.indexOf('#');
  const queryIndex = url.indexOf('?');
  if (queryIndex !== -1) {
    const end = hashIndex > queryIndex ? hashIndex : url.length;
    new URLSearchParams(url.slice(queryIndex + 1, end)).forEach((v, k) => params.set(k, v));
  }
  if (hashIndex !== -1) {
    new URLSearchParams(url.slice(hashIndex + 1)).forEach((v, k) => params.set(k, v));
  }

  const link: AuthLink = {
    accessToken: params.get('access_token') ?? undefined,
    refreshToken: params.get('refresh_token') ?? undefined,
    type: params.get('type') ?? undefined,
    errorCode: params.get('error_code') ?? params.get('error') ?? undefined,
  };
  return link.accessToken || link.errorCode ? link : null;
}

/** Links after which the user must choose a (new) password. */
export function needsNewPassword(link: AuthLink | null): boolean {
  return link?.type === 'recovery' || link?.type === 'invite';
}
