// Runs every migration and pgTAP test file against PGlite (Postgres in WASM), with a small
// stand-in for what Supabase provides (stub.sql) and a tiny pgTAP subset (tap.sql).
// Not a replacement for `npm run db:test` on real Supabase (CI), but needs no Docker.
//
//   npm --prefix scripts/pgcheck install   (once)
//   npm run db:check
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';

const here = dirname(fileURLToPath(import.meta.url));
const repo = process.argv[2] ?? join(here, '../..');
const db = await PGlite.create();

const exec = async (label, sql) => {
  try {
    await db.exec(sql);
  } catch (e) {
    console.error(`FAILED in ${label}:`, e.message, e.where ?? '');
    process.exit(1);
  }
};

await exec('stub', readFileSync(join(here, 'stub.sql'), 'utf8'));
for (const f of readdirSync(join(repo, 'supabase/migrations')).sort()) {
  await exec(f, readFileSync(join(repo, 'supabase/migrations', f), 'utf8'));
  console.log('migrated', f);
}
await exec('tap', readFileSync(join(here, 'tap.sql'), 'utf8'));

let failed = 0;
const only = process.argv[3];
for (const f of readdirSync(join(repo, 'supabase/tests'))
  .filter((f) => f.endsWith('.sql') && (!only || f.includes(only)))
  .sort()) {
  const sql = readFileSync(join(repo, 'supabase/tests', f), 'utf8')
    .replace(/create extension if not exists pgtap[^;]*;/, '')
    .replace(/\brollback;\s*$/, '');
  await exec(f, sql);
  await db.exec('reset role');
  const plan = (await db.query("select current_setting('tap.plan', true) as p")).rows[0].p;
  const { rows } = await db.query('select * from public.tap_results order by n');
  console.log(`# ${f}`);
  for (const r of rows) {
    if (!r.ok) failed++;
    console.log(`${r.ok ? 'ok' : 'NOT OK'} ${r.n} - ${r.descr}${r.ok ? '' : '  # ' + r.diag}`);
  }
  if (String(rows.length) !== plan) {
    failed++;
    console.log(`PLAN MISMATCH: planned ${plan}, ran ${rows.length}`);
  }
  await db.exec('rollback; truncate public.tap_results restart identity');
}
console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
