import '@azure/core-asynciterator-polyfill';

import { PowerSyncDatabase } from '@powersync/react-native';

import { AppSchema } from './schema';

/**
 * Native (Android / iOS): SQLite via op-sqlite. Needs a development build
 * (does not run in Expo Go). Web uses database.web.ts.
 */
export const powersync = new PowerSyncDatabase({
  schema: AppSchema,
  database: { dbFilename: 'myrooms.db' },
});
