import { column, Schema, Table } from '@powersync/common';

/**
 * Local SQLite schema mirrored from Postgres. PowerSync adds the `id` column.
 * Timestamps are ISO strings; money columns will be integers (piasters).
 */
const sync_checks = new Table({
  user_id: column.text,
  note: column.text,
  platform: column.text,
  created_at: column.text,
});

export const AppSchema = new Schema({ sync_checks });

export type Database = (typeof AppSchema)['types'];
export type SyncCheck = Database['sync_checks'];
