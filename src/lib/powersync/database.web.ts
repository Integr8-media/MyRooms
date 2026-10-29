import { PowerSyncDatabase } from '@powersync/web';

import { AppSchema } from './schema';

// Worker + WASM files are copied to public/@powersync by `npm run powersync:assets`
// (runs automatically after `npm install`).
const WORKER = '/@powersync/worker.js';

/** Web and Windows (Tauri): SQLite compiled to WASM, persisted in the browser. */
export const powersync = new PowerSyncDatabase({
  schema: AppSchema,
  database: { dbFilename: 'myrooms.db', worker: WORKER },
  sync: { worker: WORKER },
});
