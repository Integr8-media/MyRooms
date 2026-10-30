// Edge Function: the final bill of a completed session, calculated on the server.
//
// The app creates the bill on the device when a session ends (an estimate, so checkout works
// offline). When that bill uploads, the PowerSync connector calls this function instead of
// inserting the row. It:
//   1. reads the session, its segments, the org's time zone, rate rules and package *as the
//      caller* (RLS decides whether they may see the session at all);
//   2. prices it with src/domain (copied to ../_shared/domain by `npm run domain:sync`);
//   3. saves it with public.create_bill() using the service role (clients can't write amounts).
// Calling it again for the same session returns the existing bill.
//
// Errors: { error: '<key>' } with 400/403/409 (the connector drops the upload: retrying can't
// help) or 5xx (the connector retries later).
//
// Deploy (self-hosted): copy this folder and ../_shared to <supabase>/volumes/functions and
// restart the functions container. See deploy/README.md.
import { createClient } from 'npm:@supabase/supabase-js@2';

import {
  computeFinalBill,
  packageFromRow,
  rateRuleFromRow,
  segmentFromRow,
} from '../_shared/domain/billing.ts';
import { parseTimestamp } from '../_shared/domain/sessions.ts';

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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Postgres errors from create_bill(): our error keys arrive as the message. */
function dbError(error: { code?: string; message?: string }) {
  const status = error.code === '42501' ? 403 : error.code?.startsWith('23') ? 409 : 400;
  if (!error.code?.match(/^(22|23|42501)/)) {
    console.error('create-bill: database error', error);
    return json({ error: 'unknown' }, 500);
  }
  return json({ error: error.message ?? 'unknown' }, status);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const authorization = req.headers.get('Authorization');
  if (!authorization) return json({ error: 'not_authenticated' }, 401);

  let sessionId: unknown;
  try {
    sessionId = (await req.json())?.session_id;
  } catch {
    return json({ error: 'invalid_request' }, 400);
  }
  if (typeof sessionId !== 'string' || !UUID.test(sessionId)) {
    return json({ error: 'invalid_request' }, 400);
  }

  // As the caller: RLS applies to every read.
  const asCaller = createClient(SUPABASE_URL, PUBLIC_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await asCaller.auth.getUser();
  if (userError || !userData.user) return json({ error: 'not_authenticated' }, 401);

  const { data: session, error: sessionError } = await asCaller
    .from('sessions')
    .select('id, org_id, branch_id, status, package_id, actual_start, actual_end')
    .eq('id', sessionId)
    .maybeSingle();
  if (sessionError) return dbError(sessionError);
  if (!session) return json({ error: 'not_allowed' }, 403);

  const { data: existing } = await asCaller
    .from('bills')
    .select('id')
    .eq('id', sessionId)
    .maybeSingle();
  if (existing) return json({ bill_id: existing.id });

  if (session.status !== 'completed') return json({ error: 'session_not_ended' }, 409);
  const start = parseTimestamp(session.actual_start);
  const end = parseTimestamp(session.actual_end);
  if (start == null || end == null) return json({ error: 'invalid_session' }, 409);

  const [segments, org, rules, pkg] = await Promise.all([
    asCaller
      .from('session_segments')
      .select('station_type_id, players, started_at, ended_at')
      .eq('session_id', sessionId),
    asCaller.from('organizations').select('timezone').eq('id', session.org_id).single(),
    asCaller.from('rate_rules').select('*').eq('org_id', session.org_id),
    session.package_id
      ? asCaller.from('packages').select('*').eq('id', session.package_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  const readError = segments.error ?? org.error ?? rules.error ?? pkg.error;
  if (readError) return dbError(readError);

  const records = [];
  for (const row of segments.data ?? []) {
    const record = segmentFromRow(row);
    if (!record) return json({ error: 'invalid_session' }, 409);
    records.push(record);
  }

  let bill;
  try {
    bill = computeFinalBill({
      segments: records,
      sessionStart: start,
      sessionEnd: end,
      rules: (rules.data ?? []).map(rateRuleFromRow),
      package: pkg.data ? packageFromRow(pkg.data) : null,
      timeZone: org.data?.timezone ?? 'Africa/Cairo',
    });
  } catch (error) {
    console.error('create-bill: pricing failed', sessionId, error);
    return json({ error: 'invalid_session' }, 409);
  }

  const admin = createClient(SUPABASE_URL, SECRET_KEY, { auth: { persistSession: false } });
  const { data: billId, error } = await admin.rpc('create_bill', {
    p_session_id: sessionId,
    p_time_amount: bill.timeAmount,
    p_details: bill.details,
    p_actor: userData.user.id,
  });
  if (error) return dbError(error);
  return json({ bill_id: billId, time_amount: bill.timeAmount });
});
