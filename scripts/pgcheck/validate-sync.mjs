// Validates deploy/powersync/sync-config.yaml with PowerSync's own parser.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SqlSyncRules } from '@powersync/service-sync-rules';

const here = dirname(fileURLToPath(import.meta.url));
const file = process.argv[2] ?? join(here, '../../deploy/powersync/sync-config.yaml');
const errors = SqlSyncRules.validate(readFileSync(file, 'utf8'), { defaultSchema: 'public' });
for (const e of errors) console.log(e.type ?? 'error', '-', e.message);
if (errors.some((e) => e.type !== 'warning')) process.exit(1);
console.log('sync-config.yaml: OK');
