// Edge Function: invite a staff member and email them if they have no account yet.
//
// 1. Creates the invitation through invite_member() *as the caller*, so the database
//    decides who may invite whom (same rules as the app, see the Phase 1 migration).
// 2. If the email has no account, sends Supabase Auth's invite email (needs SMTP).
//    The link opens the app's "choose a password" screen, then the invitation is
//    waiting on the onboarding screen.
//
// Deploy (self-hosted): copy this folder to <supabase>/volumes/functions/invite-staff
// and restart the functions container. See deploy/README.md.
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
const PUBLIC_KEY = env('SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY');
const SECRET_KEY = env('SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const authorization = req.headers.get('Authorization');
  if (!authorization) return json({ error: 'not_authenticated' }, 401);

  let input: {
    org_id?: string;
    email?: string;
    role?: string;
    branch_ids?: string[];
    redirect_to?: string;
  };
  try {
    input = await req.json();
  } catch {
    return json({ error: 'invalid_request' }, 400);
  }

  // As the caller: RLS and the function's own checks apply.
  const asCaller = createClient(SUPABASE_URL, PUBLIC_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data: invitationId, error } = await asCaller.rpc('invite_member', {
    p_org_id: input.org_id,
    p_email: input.email,
    p_role: input.role,
    p_branch_ids: input.branch_ids ?? [],
  });
  if (error) return json({ error: error.message }, 400);

  // Email only people without an account; existing users see the invitation in the app.
  const admin = createClient(SUPABASE_URL, SECRET_KEY, { auth: { persistSession: false } });
  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    String(input.email).trim().toLowerCase(),
    { redirectTo: input.redirect_to },
  );
  const emailSent = !inviteError;
  if (inviteError && inviteError.code !== 'email_exists') {
    console.error('invite-staff: email not sent', inviteError);
  }

  return json({ invitation_id: invitationId, email_sent: emailSent });
});
