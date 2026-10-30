import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

// The create-bill Edge Function runs a copy of src/domain (see scripts/sync-domain.mjs).
// If this fails, run `npm run domain:sync` and commit the result.
it('the Edge Functions use the current pricing and billing code', () => {
  expect(() =>
    execFileSync(process.execPath, [join(__dirname, '../../scripts/sync-domain.mjs'), '--check'], {
      stdio: 'pipe',
    }),
  ).not.toThrow();
});
