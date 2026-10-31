import { describe, expect, it } from 'vitest';

import {
  createBooking,
  createTrip,
  deleteBooking,
  deleteTrip,
  getBooking,
  getTrip,
  getTripDetail,
  listTrips,
  updateBooking,
  updateTrip,
  type BookingInput,
  type SegmentInput,
  type TripInput,
} from './repo';
import * as schema from './schema';
import { createTestCtx } from './test-db';

const trip: TripInput = {
  title: 'Tokyo',
  startDate: '2027-03-12',
  endDate: '2027-03-17',
  homeTimezone: 'America/New_York',
};

const flightSegment: SegmentInput = {
  startAtUtc: '2027-03-12T16:00:00Z',
  endAtUtc: '2027-03-13T05:30:00Z',
  startTimezone: 'America/New_York',
  endTimezone: 'Asia/Tokyo',
  startLocation: { name: 'JFK', address: 'Queens, NY' },
  endLocation: { name: 'HND' },
  flightNumber: 'EX 101',
  seat: ' 34A ',
  gate: '',
};

const flight: BookingInput = {
  type: 'TRANSPORT',
  title: 'JFK → HND',
  provider: 'Example Air',
  confirmationNumber: 'ABC123',
  originalUrl: 'https://example.com/manage/ABC123',
  status: 'CONFIRMED',
  costAmount: 128450,
  costCurrency: 'USD',
  segments: [flightSegment],
};

const hotel: BookingInput = {
  type: 'ACCOMMODATION',
  title: 'Hotel',
  status: 'CONFIRMED',
  segments: [
    {
      startAtUtc: '2027-03-13T06:00:00Z',
      endAtUtc: '2027-03-17T02:00:00Z',
      startTimezone: 'Asia/Tokyo',
      endTimezone: 'Asia/Tokyo',
      startLocation: { name: 'Example Hotel Shinjuku' },
      sameLocation: true,
      room: 'Twin 1204',
    },
  ],
};

async function setup() {
  const t = createTestCtx();
  const created = await createTrip(t.ctx, trip);
  return { ...t, tripId: created.id };
}

const count = (t: { sqlite: { prepare: (s: string) => { get: () => unknown } } }, table: string) =>
  (t.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;

describe('trips', () => {
  it('creates, reads, lists soonest first, and excludes deleted trips', async () => {
    const { ctx } = createTestCtx();
    const later = await createTrip(ctx, {
      ...trip,
      title: 'Later',
      startDate: '2027-06-01',
      endDate: '2027-06-05',
    });
    const sooner = await createTrip(ctx, { ...trip, title: '  Sooner  ' });
    expect(sooner.title).toBe('Sooner');
    expect((await listTrips(ctx)).map((t) => t.id)).toEqual([sooner.id, later.id]);
    await deleteTrip(ctx, later.id);
    expect((await listTrips(ctx)).map((t) => t.id)).toEqual([sooner.id]);
    expect(await getTrip(ctx, later.id)).toBeNull();
  });

  it('updates a trip and moves updatedAt forward', async () => {
    const { ctx } = createTestCtx();
    const created = await createTrip(ctx, trip);
    const updated = await updateTrip(ctx, created.id, {
      ...trip,
      title: 'Tokyo 2027',
      endDate: '2027-03-20',
    });
    expect(updated.title).toBe('Tokyo 2027');
    expect(updated.updatedAt > created.updatedAt).toBe(true);
    expect((await getTrip(ctx, created.id))?.endDate).toBe('2027-03-20');
  });

  it('rejects invalid trips and writes nothing', async () => {
    const { ctx, sqlite } = createTestCtx();
    await expect(createTrip(ctx, { ...trip, endDate: '2027-03-01' })).rejects.toThrow();
    await expect(createTrip(ctx, { ...trip, title: '   ' })).rejects.toThrow();
    await expect(createTrip(ctx, { ...trip, homeTimezone: 'EST' })).rejects.toThrow();
    expect(count({ sqlite }, 'trips')).toBe(0);
  });

  it('refuses to update a trip that does not exist', async () => {
    const { ctx } = createTestCtx();
    await expect(updateTrip(ctx, '7e570000-0000-4000-8000-0000000000aa', trip)).rejects.toThrow(
      /not found/,
    );
  });
});

describe('createBooking', () => {
  it('stores a flight with two timezones, two locations and cleaned-up fields', async () => {
    const { ctx, tripId } = await setup();
    const booking = await createBooking(ctx, tripId, flight);
    expect(booking).toMatchObject({ source: 'MANUAL', parsedBy: 'MANUAL', costAmount: 128450 });

    const detail = await getBooking(ctx, booking.id);
    expect(detail?.segments).toHaveLength(1);
    const [segment] = detail!.segments;
    expect(segment).toMatchObject({
      startAtUtc: '2027-03-12T16:00:00Z',
      endAtUtc: '2027-03-13T05:30:00Z',
      startTimezone: 'America/New_York',
      endTimezone: 'Asia/Tokyo',
      flightNumber: 'EX 101',
      seat: '34A', // trimmed
      gate: null, // empty string becomes null
    });
    const start = detail!.locations.get(segment!.startLocationId!);
    const end = detail!.locations.get(segment!.endLocationId!);
    expect(start).toMatchObject({
      name: 'JFK',
      address: 'Queens, NY',
      timezone: 'America/New_York',
    });
    expect(end).toMatchObject({ name: 'HND', address: null, timezone: 'Asia/Tokyo' });
  });

  it('shares one location row for a hotel check-in and check-out', async () => {
    const t = await setup();
    const booking = await createBooking(t.ctx, t.tripId, hotel);
    const detail = await getBooking(t.ctx, booking.id);
    const [segment] = detail!.segments;
    expect(segment!.startLocationId).toBe(segment!.endLocationId);
    expect(count(t, 'locations')).toBe(1);
  });

  it('supports a round trip as one booking with two segments', async () => {
    const { ctx, tripId } = await setup();
    const ret: SegmentInput = {
      ...flightSegment,
      id: undefined,
      startAtUtc: '2027-03-17T10:00:00Z',
      endAtUtc: '2027-03-17T23:00:00Z',
      startTimezone: 'Asia/Tokyo',
      endTimezone: 'America/New_York',
      startLocation: { name: 'HND' },
      endLocation: { name: 'JFK' },
    };
    const booking = await createBooking(ctx, tripId, { ...flight, segments: [flightSegment, ret] });
    const detail = await getTripDetail(ctx, tripId);
    expect(detail?.items).toHaveLength(1);
    expect(detail?.items[0]?.segments.map((s) => s.startAtUtc)).toEqual([
      '2027-03-12T16:00:00Z',
      '2027-03-17T10:00:00Z',
    ]);
    expect(detail?.items[0]?.booking.id).toBe(booking.id);
  });

  it('allows no location and no cost', async () => {
    const { ctx, tripId } = await setup();
    const booking = await createBooking(ctx, tripId, {
      type: 'ACTIVITY',
      title: 'Walk',
      status: 'PENDING',
      segments: [
        {
          startAtUtc: '2027-03-14T01:00:00Z',
          endAtUtc: '2027-03-14T02:00:00Z',
          startTimezone: 'Asia/Tokyo',
          endTimezone: 'Asia/Tokyo',
        },
      ],
    });
    expect(booking.costAmount).toBeNull();
    const detail = await getBooking(ctx, booking.id);
    expect(detail?.segments[0]?.startLocationId).toBeNull();
    expect(detail?.locations.size).toBe(0);
  });

  describe('invalid input writes nothing', () => {
    const cases: [string, BookingInput][] = [
      ['an amount without a currency', { ...flight, costCurrency: null }],
      ['a negative amount', { ...flight, costAmount: -1 }],
      ['a fractional amount', { ...flight, costAmount: 12.5 }],
      ['no segments', { ...flight, segments: [] }],
      ['a blank title', { ...flight, title: '  ' }],
      ['a non-URL link', { ...flight, originalUrl: 'not a url' }],
      [
        'a segment ending before it starts',
        { ...flight, segments: [{ ...flightSegment, endAtUtc: '2027-03-12T15:00:00Z' }] },
      ],
      [
        'a naive local time',
        { ...flight, segments: [{ ...flightSegment, startAtUtc: '2027-03-12T11:00:00' }] },
      ],
      [
        'a timezone abbreviation',
        { ...flight, segments: [{ ...flightSegment, startTimezone: 'EST' }] },
      ],
    ];
    it.each(cases)('%s', async (_name, input) => {
      const t = await setup();
      await expect(createBooking(t.ctx, t.tripId, input)).rejects.toThrow();
      expect(count(t, 'bookings')).toBe(0);
      expect(count(t, 'segments')).toBe(0);
      expect(count(t, 'locations')).toBe(0);
    });
  });

  it('refuses a trip that does not exist or was deleted', async () => {
    const { ctx, tripId } = await setup();
    await deleteTrip(ctx, tripId);
    await expect(createBooking(ctx, tripId, flight)).rejects.toThrow(/Trip not found/);
  });

  it('is atomic: a failure partway through leaves no partial rows', async () => {
    let calls = 0;
    const t = createTestCtx({
      // 1st id is the trip, 2nd the booking, 3rd and 4th the locations, 5th the segment.
      newId: () => {
        calls += 1;
        if (calls === 5) throw new Error('boom');
        return `7e570000-0000-4000-8000-${String(calls).padStart(12, '0')}`;
      },
    });
    const created = await createTrip(t.ctx, trip);
    await expect(createBooking(t.ctx, created.id, flight)).rejects.toThrow('boom');
    expect(count(t, 'bookings')).toBe(0);
    expect(count(t, 'segments')).toBe(0);
    expect(count(t, 'locations')).toBe(0);
  });

  it('rolls back writes already made when the database itself rejects a row', async () => {
    const t = await setup();
    // Start a booking write whose booking row is valid, then break a CHECK on a later row by
    // bypassing zod: a segment id that collides with an existing primary key.
    const first = await createBooking(t.ctx, t.tripId, flight);
    const clash = (await getBooking(t.ctx, first.id))!.segments[0]!.id;
    const ctx = {
      ...t.ctx,
      newId: (() => {
        let n = 0;
        return () =>
          n++ < 3 ? `7e570000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}` : clash;
      })(),
    };
    const before = { b: count(t, 'bookings'), s: count(t, 'segments'), l: count(t, 'locations') };
    await expect(createBooking(ctx, t.tripId, flight)).rejects.toThrow();
    expect({ b: count(t, 'bookings'), s: count(t, 'segments'), l: count(t, 'locations') }).toEqual(
      before,
    );
  });
});

describe('updateBooking', () => {
  it('edits fields in place, keeps ids, and keeps source and parsedBy', async () => {
    const { ctx, tripId, db } = await setup();
    const created = await createBooking(ctx, tripId, {
      ...flight,
      source: 'SHARE',
      parsedBy: 'LLM',
    });
    const before = (await getBooking(ctx, created.id))!;

    const updated = await updateBooking(ctx, created.id, {
      ...flight,
      title: 'JFK → HND (moved)',
      costAmount: 99900,
      status: 'PENDING',
      source: 'MANUAL', // ignored when editing
      parsedBy: 'MANUAL',
      segments: [{ ...flightSegment, id: before.segments[0]!.id, seat: '12C' }],
    });

    expect(updated).toMatchObject({
      id: created.id,
      title: 'JFK → HND (moved)',
      costAmount: 99900,
      status: 'PENDING',
      source: 'SHARE',
      parsedBy: 'LLM',
    });
    expect(updated.updatedAt > created.updatedAt).toBe(true);
    const after = (await getBooking(ctx, created.id))!;
    expect(after.segments[0]?.id).toBe(before.segments[0]?.id);
    expect(after.segments[0]?.seat).toBe('12C');
    expect(after.segments[0]?.startLocationId).toBe(before.segments[0]?.startLocationId);
    expect((await db.select().from(schema.locations)).length).toBe(2);
  });

  it('renames a location in place and clears one by blanking its name', async () => {
    const t = await setup();
    const created = await createBooking(t.ctx, t.tripId, flight);
    const before = (await getBooking(t.ctx, created.id))!;
    const seg = before.segments[0]!;

    await updateBooking(t.ctx, created.id, {
      ...flight,
      segments: [
        {
          ...flightSegment,
          id: seg.id,
          startLocation: { name: 'JFK Terminal 4' },
          endLocation: { name: '  ' },
        },
      ],
    });
    const after = (await getBooking(t.ctx, created.id))!;
    const afterSeg = after.segments[0]!;
    expect(afterSeg.startLocationId).toBe(seg.startLocationId); // same row, renamed
    expect(after.locations.get(afterSeg.startLocationId!)?.name).toBe('JFK Terminal 4');
    expect(afterSeg.endLocationId).toBeNull();

    // The dropped end location is soft-deleted, not removed.
    const dropped = (await t.db.select().from(schema.locations)).find(
      (l) => l.id === seg.endLocationId,
    );
    expect(dropped?.deletedAt).not.toBeNull();
  });

  it('adds a segment and soft-deletes a removed one', async () => {
    const t = await setup();
    const created = await createBooking(t.ctx, t.tripId, flight);
    const seg = (await getBooking(t.ctx, created.id))!.segments[0]!;

    const extra: SegmentInput = {
      ...flightSegment,
      startAtUtc: '2027-03-17T10:00:00Z',
      endAtUtc: '2027-03-17T23:00:00Z',
      startLocation: { name: 'HND' },
      endLocation: { name: 'JFK' },
    };
    await updateBooking(t.ctx, created.id, {
      ...flight,
      segments: [{ ...flightSegment, id: seg.id }, extra],
    });
    expect((await getBooking(t.ctx, created.id))!.segments).toHaveLength(2);

    // Now drop the original outbound segment.
    const both = (await getBooking(t.ctx, created.id))!.segments;
    const returnLeg = both.find((s) => s.startAtUtc === '2027-03-17T10:00:00Z')!;
    await updateBooking(t.ctx, created.id, {
      ...flight,
      segments: [{ ...extra, id: returnLeg.id }],
    });
    const live = (await getBooking(t.ctx, created.id))!.segments;
    expect(live.map((s) => s.id)).toEqual([returnLeg.id]);
    const removed = (await t.db.select().from(schema.segments)).find((s) => s.id === seg.id);
    expect(removed?.deletedAt).not.toBeNull(); // still in the table
  });

  it('turns a shared hotel location into two, and back, without losing either', async () => {
    const t = await setup();
    const created = await createBooking(t.ctx, t.tripId, hotel);
    const seg = (await getBooking(t.ctx, created.id))!.segments[0]!;
    const base = hotel.segments[0]!;

    await updateBooking(t.ctx, created.id, {
      ...hotel,
      segments: [
        {
          ...base,
          id: seg.id,
          sameLocation: false,
          startLocation: { name: 'Hotel A' },
          endLocation: { name: 'Hotel B' },
        },
      ],
    });
    const split = (await getBooking(t.ctx, created.id))!;
    const s = split.segments[0]!;
    expect(s.startLocationId).not.toBe(s.endLocationId);
    expect(split.locations.get(s.startLocationId!)?.name).toBe('Hotel A');
    expect(split.locations.get(s.endLocationId!)?.name).toBe('Hotel B');

    await updateBooking(t.ctx, created.id, {
      ...hotel,
      segments: [{ ...base, id: seg.id, startLocation: { name: 'Hotel A' }, sameLocation: true }],
    });
    const merged = (await getBooking(t.ctx, created.id))!;
    expect(merged.segments[0]!.startLocationId).toBe(merged.segments[0]!.endLocationId);
    expect(merged.locations.size).toBe(1);
  });

  it('rejects a segment id from another booking and a missing booking, changing nothing', async () => {
    const t = await setup();
    const a = await createBooking(t.ctx, t.tripId, flight);
    const b = await createBooking(t.ctx, t.tripId, hotel);
    const hotelSeg = (await getBooking(t.ctx, b.id))!.segments[0]!;
    await expect(
      updateBooking(t.ctx, a.id, { ...flight, segments: [{ ...flightSegment, id: hotelSeg.id }] }),
    ).rejects.toThrow(/does not belong/);
    await expect(
      updateBooking(t.ctx, '7e570000-0000-4000-8000-0000000000aa', flight),
    ).rejects.toThrow(/not found/);
    expect((await getBooking(t.ctx, b.id))!.segments[0]?.room).toBe('Twin 1204');
  });

  it('invalid edits leave the booking exactly as it was', async () => {
    const t = await setup();
    const created = await createBooking(t.ctx, t.tripId, flight);
    const seg = (await getBooking(t.ctx, created.id))!.segments[0]!;
    await expect(
      updateBooking(t.ctx, created.id, {
        ...flight,
        title: 'Changed',
        segments: [{ ...flightSegment, id: seg.id, endAtUtc: '2027-03-01T00:00:00Z' }],
      }),
    ).rejects.toThrow();
    expect((await getBooking(t.ctx, created.id))!.booking.title).toBe('JFK → HND');
  });
});

describe('deleting', () => {
  it('soft-deletes a booking, its segments and the locations only it used', async () => {
    const t = await setup();
    const keep = await createBooking(t.ctx, t.tripId, hotel);
    const gone = await createBooking(t.ctx, t.tripId, flight);
    await deleteBooking(t.ctx, gone.id);

    expect(await getBooking(t.ctx, gone.id)).toBeNull();
    expect((await getTripDetail(t.ctx, t.tripId))!.items.map((i) => i.booking.id)).toEqual([
      keep.id,
    ]);
    // Rows are kept, flagged deleted, so a future sync can propagate the delete.
    expect(count(t, 'bookings')).toBe(2);
    const live = await t.db.select().from(schema.locations);
    expect(live.filter((l) => l.deletedAt === null).map((l) => l.name)).toEqual([
      'Example Hotel Shinjuku',
    ]);
  });

  it('soft-deletes a whole trip and everything in it', async () => {
    const t = await setup();
    await createBooking(t.ctx, t.tripId, flight);
    await createBooking(t.ctx, t.tripId, hotel);
    await deleteTrip(t.ctx, t.tripId);

    expect(await getTripDetail(t.ctx, t.tripId)).toBeNull();
    for (const table of [schema.trips, schema.bookings, schema.segments, schema.locations]) {
      const rows = await t.db.select().from(table);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.deletedAt !== null)).toBe(true);
    }
  });

  it('deleting is idempotent and leaves other trips alone', async () => {
    const t = await setup();
    const other = await createTrip(t.ctx, { ...trip, title: 'Other' });
    await createBooking(t.ctx, other.id, hotel);
    await deleteTrip(t.ctx, t.tripId);
    await deleteTrip(t.ctx, t.tripId);
    expect((await getTripDetail(t.ctx, other.id))!.items).toHaveLength(1);
  });

  it('does not delete a location another live segment still uses', async () => {
    const t = await setup();
    const a = await createBooking(t.ctx, t.tripId, hotel);
    const shared = (await getBooking(t.ctx, a.id))!.segments[0]!.startLocationId!;
    // Point a second booking's segment at the same location row (as an importer might).
    const b = await createBooking(t.ctx, t.tripId, { ...hotel, title: 'Other stay' });
    const bSeg = (await getBooking(t.ctx, b.id))!.segments[0]!;
    await t.db
      .update(schema.segments)
      .set({ startLocationId: shared, endLocationId: shared })
      .where((await import('drizzle-orm')).eq(schema.segments.id, bSeg.id));

    await deleteBooking(t.ctx, a.id);
    const row = (await t.db.select().from(schema.locations)).find((l) => l.id === shared);
    expect(row?.deletedAt).toBeNull();
  });
});

describe('getTripDetail', () => {
  it('returns nothing for an unknown trip and an empty list for a trip with no bookings', async () => {
    const { ctx, tripId } = await setup();
    expect(await getTripDetail(ctx, '7e570000-0000-4000-8000-0000000000aa')).toBeNull();
    const detail = await getTripDetail(ctx, tripId);
    expect(detail?.items).toEqual([]);
    expect(detail?.locations.size).toBe(0);
  });
});
