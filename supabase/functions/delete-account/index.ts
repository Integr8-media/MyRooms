// Edge Function: delete the caller's account ("Delete my account", required by the stores).
//
// 1. Finds the caller from their token (only they can delete their own account).
// 2. delete_account() (service role): refuses if they are the only owner of an organization
//    that still has other people ('last_owner'); deletes the organizations where they are the
//    only member; removes their other memberships and pending invitations.
// 3. Soft-deletes the auth user: GoTrue scrubs the email and removes sign-in identities but
//    keeps the row, so records they made (sessions, payments…) keep a valid reference.
//
// Safe to call again if step 3 fails (step 2 then finds nothing left to do).
//
// Deploy (self-hosted): copy this folder to <supabase>/volumes/functions/delete-account
// and restart the functions container. See deploy/README.md, step 7b.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

const env = (...names: string[]) => names.map((n) => Deno.env.get(n)).find(Boolean) ?? '';
const SUPABASE_URL = env('SUPABASE_URL');
const SECRET_KEY = env('SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'not_authenticated' }, 401);

  let input: { confirm?: boolean };
  try {
    input = await req.json();
  } catch {
    return json({ error: 'invalid_request' }, 400);
  }
  if (input.confirm !== true) return json({ error: 'invalid_request' }, 400);

  const admin = createClient(SUPABASE_URL, SECRET_KEY, { auth: { persistSession: false } });
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return json({ error: 'not_authenticated' }, 401);
  const userId = userData.user.id;

  const { data: result, error } = await admin.rpc('delete_account', { p_user: userId });
  if (error) {
    // Error keys raised by the database (e.g. last_owner) are translated by the app.
    const known = /^[a-z_]+$/.test(error.message);
    if (!known) console.error('delete-account: delete_account failed', error.code);
    return json({ error: known ? error.message : 'server_error' }, known ? 400 : 500);
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId, true);
  if (deleteError) {
    console.error('delete-account: auth user not deleted', deleteError.code);
    return json({ error: 'server_error' }, 500);
  }

  return json({ deleted_orgs: (result as { deleted_orgs: string[] }).deleted_orgs });
});
