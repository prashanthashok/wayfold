import { newId } from '@/lib/ids';

import { db, sqlite } from './client';
import { withTransaction } from './transaction';
import type { RepoCtx } from './types';

/** The real context the app uses: the on-device database, secure UUIDs, the system clock. */
export const appCtx: RepoCtx = {
  db,
  newId,
  now: () => new Date().toISOString(),
  transaction: (fn) => withTransaction((sql) => sqlite.execSync(sql), fn),
};
