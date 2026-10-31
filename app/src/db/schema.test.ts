import {
  attachmentSchema,
  bookingSchema,
  locationSchema,
  segmentSchema,
  tripSchema,
} from '@wayfold/shared';
import { asc, eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import * as schema from './schema';
import { SEED_IDS, buildSeedData } from './seed-data';
import { seedSampleTrip } from './seed';
import { createTestDb } from './test-db';

const NOW = '2027-01-01T00:00:00.000Z';

async function seeded() {
  const t = createTestDb();
  await seedSampleTrip(t.db, NOW);
  return t;
}

/** Wall-clock time of a UTC instant in an IANA zone, e.g. "2027-03-12 11:00". */
function localTime(utc: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(utc));
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/** Awaits `promise`, expecting a rejection whose message (or cause) matches `pattern`. */
async function expectRejects(promise: Promise<unknown>, pattern: RegExp) {
  let message = '';
  try {
    await promise;
  } catch (e) {
    const err = e as Error & { cause?: Error };
    message = `${err.message} | ${err.cause?.message ?? ''}`;
  }
  expect(message).toMatch(pattern);
}

describe('migrations', () => {
  it('create all five tables', () => {
    const { sqlite } = createTestDb();
    const names = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((r) => (r as { name: string }).name);
    expect(names).toEqual(['attachments', 'bookings', 'locations', 'segments', 'trips']);
  });

  it('give every table id, updated_at and deleted_at', () => {
    const { sqlite } = createTestDb();
    for (const table of ['trips', 'bookings', 'segments', 'locations', 'attachments']) {
      const cols = sqlite
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .map((r) => (r as { name: string }).name);
      expect(cols, table).toEqual(expect.arrayContaining(['id', 'updated_at', 'deleted_at']));
    }
  });
});

describe('seed', () => {
  it('inserts one trip with a flight, a hotel and an activity', async () => {
    const { db } = await seeded();
    expect(await db.select().from(schema.trips)).toHaveLength(1);
    const bookings = await db.select().from(schema.bookings);
    expect(bookings.map((b) => b.type).sort()).toEqual(['ACCOMMODATION', 'ACTIVITY', 'TRANSPORT']);
    expect(await db.select().from(schema.segments)).toHaveLength(3);
    expect(await db.select().from(schema.locations)).toHaveLength(4);
  });

  it('is idempotent', async () => {
    const { db } = await seeded();
    await seedSampleTrip(db, NOW);
    await seedSampleTrip(db, '2027-06-01T00:00:00.000Z');
    expect(await db.select().from(schema.trips)).toHaveLength(1);
    expect(await db.select().from(schema.segments)).toHaveLength(3);
  });

  it('does not resurrect a soft-deleted sample trip', async () => {
    const { db } = await seeded();
    await db.update(schema.trips).set({ deletedAt: NOW }).where(eq(schema.trips.id, SEED_IDS.trip));
    await seedSampleTrip(db, '2027-06-01T00:00:00.000Z');
    const [trip] = await db.select().from(schema.trips);
    expect(trip?.deletedAt).toBe(NOW);
  });

  it('round-trips through SQLite and still satisfies the shared zod schemas', async () => {
    const { db } = await seeded();
    const all = (s: typeof schema.trips | typeof schema.locations | typeof schema.bookings) =>
      db.select().from(s);
    for (const r of await all(schema.trips)) expect(tripSchema.parse(r)).toEqual(r);
    for (const r of await all(schema.locations)) expect(locationSchema.parse(r)).toEqual(r);
    for (const r of await all(schema.bookings)) expect(bookingSchema.parse(r)).toEqual(r);
    for (const r of await db.select().from(schema.segments)) {
      expect(segmentSchema.parse(r)).toEqual(r);
    }
  });

  it('matches the data module exactly', async () => {
    const { db } = await seeded();
    const data = buildSeedData(NOW);
    expect(await db.select().from(schema.segments).orderBy(asc(schema.segments.id))).toEqual(
      data.segments,
    );
  });
});

describe('timezones (UTC + IANA)', () => {
  it('shows the flight in each end’s local time', async () => {
    const { db } = await seeded();
    const [seg] = await db
      .select()
      .from(schema.segments)
      .where(eq(schema.segments.id, SEED_IDS.segFlight));
    expect(seg).toBeDefined();
    if (!seg) return;
    expect(localTime(seg.startAtUtc, seg.startTimezone)).toBe('2027-03-12 11:00'); // EST
    expect(localTime(seg.endAtUtc, seg.endTimezone)).toBe('2027-03-13 14:30'); // JST
    const hours = (Date.parse(seg.endAtUtc) - Date.parse(seg.startAtUtc)) / 3_600_000;
    expect(hours).toBe(13.5);
  });

  it('orders segments chronologically by the UTC text column', async () => {
    const { db } = await seeded();
    const rows = await db.select().from(schema.segments).orderBy(asc(schema.segments.startAtUtc));
    expect(rows.map((r) => r.id)).toEqual([
      SEED_IDS.segFlight,
      SEED_IDS.segHotel,
      SEED_IDS.segTour,
    ]);
  });
});

describe('money', () => {
  it('keeps currencies separate and stores integer minor units', async () => {
    const { db } = await seeded();
    const totals = await db
      .select({
        currency: schema.bookings.costCurrency,
        total: sql<number>`sum(${schema.bookings.costAmount})`,
      })
      .from(schema.bookings)
      .groupBy(schema.bookings.costCurrency)
      .orderBy(asc(schema.bookings.costCurrency));
    // The activity has no cost, so its (null) currency group has a null total.
    expect(totals).toEqual([
      { currency: null, total: null },
      { currency: 'JPY', total: 84000 },
      { currency: 'USD', total: 128450 },
    ]);
  });
});

describe('constraints', () => {
  const booking = () => buildSeedData(NOW).bookings[0]!;
  const segment = () => buildSeedData(NOW).segments[0]!;
  const newId = '5eed0000-0000-4000-8000-0000000000ff';

  it('reject a booking whose trip does not exist (foreign keys on)', async () => {
    const { db } = await seeded();
    await expectRejects(
      db.insert(schema.bookings).values({ ...booking(), id: newId, tripId: newId }),
      /FOREIGN KEY/i,
    );
  });

  it('reject an unknown enum value', async () => {
    const { db } = await seeded();
    await expectRejects(
      db.insert(schema.bookings).values({ ...booking(), id: newId, source: 'FAX' as never }),
      /bookings_source_valid/,
    );
  });

  it('reject a cost amount without a currency', async () => {
    const { db } = await seeded();
    await expectRejects(
      db.insert(schema.bookings).values({ ...booking(), id: newId, costCurrency: null }),
      /bookings_cost_pair/,
    );
  });

  it('reject a negative cost', async () => {
    const { db } = await seeded();
    await expectRejects(
      db.insert(schema.bookings).values({ ...booking(), id: newId, costAmount: -1 }),
      /bookings_cost_nonnegative/,
    );
  });

  it('reject a naive local datetime (no Z)', async () => {
    const { db } = await seeded();
    await expectRejects(
      db
        .insert(schema.segments)
        .values({ ...segment(), id: newId, startAtUtc: '2027-03-12T11:00:00' }),
      /segments_utc_format/,
    );
  });

  it('reject a segment that ends before it starts', async () => {
    const { db } = await seeded();
    await expectRejects(
      db
        .insert(schema.segments)
        .values({ ...segment(), id: newId, endAtUtc: '2027-03-12T15:59:59Z' }),
      /segments_times_ordered/,
    );
  });

  it('reject an out-of-range latitude', async () => {
    const { db } = await seeded();
    const loc = buildSeedData(NOW).locations[0]!;
    await expectRejects(
      db.insert(schema.locations).values({ ...loc, id: newId, lat: 123 }),
      /locations_lat_range/,
    );
  });

  it('reject a trip that ends before it starts', async () => {
    const { db } = await seeded();
    const trip = buildSeedData(NOW).trips[0]!;
    await expectRejects(
      db.insert(schema.trips).values({ ...trip, id: newId, endDate: '2027-03-01' }),
      /trips_dates_ordered/,
    );
  });

  it('accept an attachment and link a booking to it', async () => {
    const { db } = await seeded();
    const attachment = attachmentSchema.parse({
      id: newId,
      updatedAt: NOW,
      deletedAt: null,
      kind: 'PDF',
      storageKey: 'file:///documents/attachments/abc.pdf',
      parsedAt: null,
    });
    await db.insert(schema.attachments).values(attachment);
    await db
      .update(schema.bookings)
      .set({ rawAttachmentId: newId })
      .where(eq(schema.bookings.id, SEED_IDS.bookingFlight));
    const [b] = await db
      .select()
      .from(schema.bookings)
      .where(eq(schema.bookings.id, SEED_IDS.bookingFlight));
    expect(b?.rawAttachmentId).toBe(newId);
  });
});
