import { buildSeedData } from './seed-data';
import * as schema from './schema';
import type { Db } from './types';

/**
 * Inserts the sample trip. Idempotent (`ON CONFLICT DO NOTHING` per row): safe to run on every
 * dev launch, finishes a half-completed earlier run, and never resurrects a sample row the user
 * soft-deleted, because soft-deleted rows still exist.
 */
export async function seedSampleTrip(db: Db, now = new Date().toISOString()): Promise<void> {
  const data = buildSeedData(now);
  // Parents before children: foreign keys are enforced.
  await db.insert(schema.trips).values(data.trips).onConflictDoNothing();
  await db.insert(schema.locations).values(data.locations).onConflictDoNothing();
  await db.insert(schema.bookings).values(data.bookings).onConflictDoNothing();
  await db.insert(schema.segments).values(data.segments).onConflictDoNothing();
}
