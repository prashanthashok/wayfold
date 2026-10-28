import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';

// Pass `{ schema }` from './schema' to drizzle() once Prompt 1 adds tables.
// The on-device SQLite database is Wayfold's source of truth.
const sqlite = openDatabaseSync('wayfold.db');
sqlite.execSync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

export const db = drizzle(sqlite);

export function sqliteVersion(): string {
  return sqlite.getFirstSync<{ v: string }>('SELECT sqlite_version() AS v')?.v ?? 'unknown';
}
