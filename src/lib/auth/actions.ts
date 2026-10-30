import { FunctionsHttpError } from '@supabase/supabase-js';

import { powersync } from '@/lib/powersync/database';
import { useWorkspaceStore } from '@/lib/settings/workspace-store';
import { getSupabase } from '@/lib/supabase/client';

import { authRedirectUrl } from './redirect';
import { scheduleAlerts } from '@/lib/notifications/alerts';

export async function signIn(email: string, password: string) {
  const { error } = await getSupabase().auth.signInWithPassword({ email, password });
  if (error) throw error;
}

/** Returns whether the user must confirm their email before they can sign in. */
export async function signUp(input: { fullName: string; email: string; password: string }) {
  const { data, error } = await getSupabase().auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: { full_name: input.fullName },
      emailRedirectTo: authRedirectUrl('/'),
    },
  });
  if (error) throw error;
  return { needsConfirmation: !data.session };
}

export async function sendPasswordReset(email: string) {
  const { error } = await getSupabase().auth.resetPasswordForEmail(email, {
    redirectTo: authRedirectUrl('/set-password'),
  });
  if (error) throw error;
}

export async function updatePassword(password: string) {
  const { error } = await getSupabase().auth.updateUser({ password });
  if (error) throw error;
}

/** The name shown in staff lists (copied to memberships by a database trigger). */
export async function updateDisplayName(fullName: string) {
  const { error } = await getSupabase().auth.updateUser({ data: { full_name: fullName } });
  if (error) throw error;
}

/**
 * Signs out and wipes this device's local copy of the data, so the next person
 * to sign in here never sees it. Changes not yet uploaded are lost: callers
 * should warn first (see usePendingUploads).
 */
export async function signOut() {
  await clearDevice();
  const supabase = getSupabase();
  const { error } = await supabase.auth.signOut();
  // Offline: the server call fails, so at least forget the session on this device.
  if (error) await supabase.auth.signOut({ scope: 'local' });
}

/** Forgets this account on the device: alerts, the local database and the chosen org/branch. */
async function clearDevice() {
  // Scheduled session alerts belong to this account's branch.
  await scheduleAlerts([]).catch(() => {});
  await powersync.disconnectAndClear();
  useWorkspaceStore.getState().reset();
}

/**
 * Deletes the signed-in account (online only) through the `delete-account` Edge Function,
 * then clears this device. Organizations where the person is the only member are deleted
 * too; the server refuses with `last_owner` if they are the only owner of one with staff.
 */
export async function deleteAccount() {
  const supabase = getSupabase();
  const { error } = await supabase.functions.invoke('delete-account', { body: { confirm: true } });
  if (error) {
    if (error instanceof FunctionsHttpError && error.context instanceof Response) {
      const body = (await error.context.json().catch(() => null)) as { error?: string } | null;
      throw { message: body?.error ?? 'unknown' };
    }
    throw { message: 'network' };
  }
  await clearDevice();
  // The account no longer exists on the server: only the local session is left to forget.
  await supabase.auth.signOut({ scope: 'local' });
}
