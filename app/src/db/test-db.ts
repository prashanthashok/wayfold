/// <reference types="node" />
// Test-only helper: a real SQLite database (Node's built-in `node:sqlite`) driven through
// Drizzle's sqlite-proxy, with the actual generated migrations applied. This exercises the same
// SQL, CHECK constraints and foreign keys the device runs, without needing a simulator.
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';

import { drizzle } from 'drizzle-orm/sqlite-proxy';

import * as schema from './schema';
import { withTransaction } from './transaction';
import type { RepoCtx } from './types';

const MIGRATIONS_DIR = join(__dirname, '../../drizzle');

export function createTestDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON;');

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    for (const statement of readFileSync(join(MIGRATIONS_DIR, file), 'utf8').split(
      '--> statement-breakpoint',
    )) {
      sqlite.exec(statement);
    }
  }

  const db = drizzle(
    async (sql, params, method) => {
      const stmt = sqlite.prepare(sql);
      stmt.setReturnArrays(true);
      const args = params as any[];
      if (method === 'run') {
        stmt.run(...args);
        return { rows: [] };
      }
      if (method === 'get') {
        return { rows: stmt.get(...args) as unknown[] | undefined } as { rows: unknown[] };
      }
      return { rows: stmt.all(...args) as unknown as unknown[][] };
    },
    { schema },
  );

  return { db, sqlite };
}

export interface TestCtxOptions {
  /** Override id generation, e.g. to throw partway through a write. */
  newId?: () => string;
}

/** A RepoCtx over a fresh in-memory database, with deterministic ids and a ticking clock. */
export function createTestCtx(options: TestCtxOptions = {}) {
  const { db, sqlite } = createTestDb();
  let idCounter = 0;
  let clock = 0;
  const ctx: RepoCtx = {
    db,
    newId:
      options.newId ?? (() => `7e570000-0000-4000-8000-${String(++idCounter).padStart(12, '0')}`),
    // Each call is one second later, so "updatedAt moved forward" is observable.
    now: () => new Date(Date.UTC(2027, 0, 1, 0, 0, clock++)).toISOString(),
    transaction: (fn) => withTransaction((sql) => sqlite.exec(sql), fn),
  };
  return { ctx, db, sqlite };
}
