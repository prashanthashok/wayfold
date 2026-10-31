import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

import type * as schema from './schema';

/** Works with both the on-device (sync) driver and the test (async proxy) driver. */
export type Db = BaseSQLiteDatabase<'sync' | 'async', any, typeof schema>;

/** Everything the repository functions need, injected so tests can control ids, time and the DB. */
export interface RepoCtx {
  db: Db;
  /** A new UUID for a row. */
  newId(): string;
  /** The current time as an ISO string with milliseconds (`new Date().toISOString()`). */
  now(): string;
  /** Runs `fn` atomically: all writes commit together or none do. Not re-entrant. */
  transaction<T>(fn: () => Promise<T>): Promise<T>;
}
