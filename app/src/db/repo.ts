import {
  bookingSchema,
  locationSchema,
  segmentSchema,
  tripSchema,
  type Booking,
  type BookingSource,
  type BookingStatus,
  type BookingType,
  type BookingWithSegments,
  type Location,
  type ParsedBy,
  type Segment,
  type Trip,
} from '@wayfold/shared';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';

import * as schema from './schema';
import type { RepoCtx } from './types';

// All reads and writes for trips and bookings. Rules enforced here:
// - rows are validated with the shared zod schemas BEFORE any write;
// - deletes are soft (deleted_at), and every write bumps updated_at;
// - multi-row writes run in one transaction.
// Nothing in this file imports React Native or Expo, so it runs under vitest.

const { trips, bookings, segments, locations } = schema;

const clean = (value: string | null | undefined): string | null => value?.trim() || null;

// ---------------------------------------------------------------------------------------------
// Trips
// ---------------------------------------------------------------------------------------------

export interface TripInput {
  title: string;
  startDate: string;
  endDate: string;
  homeTimezone: string;
  coverImage?: string | null;
}

/** Live trips, soonest first. */
export async function listTrips(ctx: RepoCtx): Promise<Trip[]> {
  return ctx.db
    .select()
    .from(trips)
    .where(isNull(trips.deletedAt))
    .orderBy(asc(trips.startDate), asc(trips.title));
}

export async function getTrip(ctx: RepoCtx, id: string): Promise<Trip | null> {
  const [row] = await ctx.db
    .select()
    .from(trips)
    .where(and(eq(trips.id, id), isNull(trips.deletedAt)));
  return row ?? null;
}

export async function createTrip(ctx: RepoCtx, input: TripInput): Promise<Trip> {
  const row = tripSchema.parse({
    id: ctx.newId(),
    updatedAt: ctx.now(),
    deletedAt: null,
    title: input.title.trim(),
    startDate: input.startDate,
    endDate: input.endDate,
    homeTimezone: input.homeTimezone,
    coverImage: clean(input.coverImage),
  });
  await ctx.db.insert(trips).values(row);
  return row;
}

export async function updateTrip(ctx: RepoCtx, id: string, input: TripInput): Promise<Trip> {
  const existing = await getTrip(ctx, id);
  if (!existing) throw new Error(`Trip not found: ${id}`);
  const row = tripSchema.parse({
    ...existing,
    title: input.title.trim(),
    startDate: input.startDate,
    endDate: input.endDate,
    homeTimezone: input.homeTimezone,
    coverImage: input.coverImage === undefined ? existing.coverImage : clean(input.coverImage),
    updatedAt: ctx.now(),
  });
  await ctx.db.update(trips).set(row).where(eq(trips.id, id));
  return row;
}

/** Soft-deletes the trip, its bookings and their segments, and any locations they alone used. */
export async function deleteTrip(ctx: RepoCtx, id: string): Promise<void> {
  const now = ctx.now();
  await ctx.transaction(async () => {
    const tripBookings = await ctx.db
      .select({ id: bookings.id })
      .from(bookings)
      .where(and(eq(bookings.tripId, id), isNull(bookings.deletedAt)));
    await softDeleteBookings(
      ctx,
      tripBookings.map((b) => b.id),
      now,
    );
    await ctx.db
      .update(trips)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(trips.id, id), isNull(trips.deletedAt)));
  });
}

// ---------------------------------------------------------------------------------------------
// Reading a trip's bookings
// ---------------------------------------------------------------------------------------------

export interface TripDetail {
  trip: Trip;
  items: BookingWithSegments[];
  /** Locations referenced by those segments, by id. */
  locations: Map<string, Location>;
}

export async function getTripDetail(ctx: RepoCtx, tripId: string): Promise<TripDetail | null> {
  const trip = await getTrip(ctx, tripId);
  if (!trip) return null;

  const bookingRows = await ctx.db
    .select()
    .from(bookings)
    .where(and(eq(bookings.tripId, tripId), isNull(bookings.deletedAt)))
    .orderBy(asc(bookings.title), asc(bookings.id));
  const bookingIds = bookingRows.map((b) => b.id);

  const segmentRows = bookingIds.length
    ? await ctx.db
        .select()
        .from(segments)
        .where(and(inArray(segments.bookingId, bookingIds), isNull(segments.deletedAt)))
        .orderBy(asc(segments.startAtUtc), asc(segments.id))
    : [];

  const locationIds = [
    ...new Set(segmentRows.flatMap((s) => [s.startLocationId, s.endLocationId]).filter(isString)),
  ];
  const locationRows = locationIds.length
    ? await ctx.db
        .select()
        .from(locations)
        .where(and(inArray(locations.id, locationIds), isNull(locations.deletedAt)))
    : [];

  return {
    trip,
    items: bookingRows.map((booking) => ({
      booking,
      segments: segmentRows.filter((s) => s.bookingId === booking.id),
    })),
    locations: new Map(locationRows.map((l) => [l.id, l])),
  };
}

const isString = (v: string | null): v is string => v !== null;

// ---------------------------------------------------------------------------------------------
// Writing bookings
// ---------------------------------------------------------------------------------------------

export interface LocationInput {
  name: string;
  address?: string | null;
}

export interface SegmentInput {
  /** Present when editing an existing segment; absent for a new one. */
  id?: string;
  startAtUtc: string;
  endAtUtc: string;
  startTimezone: string;
  endTimezone: string;
  startLocation?: LocationInput | null;
  endLocation?: LocationInput | null;
  /** The end is the same place as the start (a hotel): one location row is shared. */
  sameLocation?: boolean;
  flightNumber?: string | null;
  seat?: string | null;
  gate?: string | null;
  terminal?: string | null;
  room?: string | null;
  meetingPoint?: string | null;
}

export interface BookingInput {
  type: BookingType;
  title: string;
  provider?: string | null;
  confirmationNumber?: string | null;
  originalUrl?: string | null;
  status: BookingStatus;
  /** Integer minor units; set together with `costCurrency`. */
  costAmount?: number | null;
  costCurrency?: string | null;
  segments: SegmentInput[];
  /** New bookings only; defaults to MANUAL. Editing never changes these. */
  source?: BookingSource;
  parsedBy?: ParsedBy;
}

interface LocationWrite {
  row: Location;
  mode: 'insert' | 'update';
}

interface Plan {
  booking: Booking;
  bookingMode: 'insert' | 'update';
  locationWrites: LocationWrite[];
  segmentWrites: { row: Segment; mode: 'insert' | 'update' }[];
  removedSegmentIds: string[];
  /** Locations that may have just become unreferenced. */
  pruneLocationIds: string[];
}

/**
 * Builds and validates every row in memory (throwing a ZodError on bad input) so that nothing
 * is written unless all of it is valid.
 */
function planLocation(
  ctx: RepoCtx,
  existing: Location | undefined,
  input: LocationInput | null | undefined,
  timezone: string,
  now: string,
): { id: string | null; write?: LocationWrite; dropped?: string } {
  const name = clean(input?.name);
  if (!name) return { id: null, dropped: existing?.id };
  const row = locationSchema.parse({
    id: existing?.id ?? ctx.newId(),
    updatedAt: now,
    deletedAt: null,
    name,
    address: clean(input?.address),
    lat: existing?.lat ?? null,
    lng: existing?.lng ?? null,
    timezone,
  });
  return { id: row.id, write: { row, mode: existing ? 'update' : 'insert' } };
}

function planBooking(
  ctx: RepoCtx,
  tripId: string,
  input: BookingInput,
  existing: { booking: Booking; segments: Segment[]; locations: Map<string, Location> } | null,
): Plan {
  const now = ctx.now();
  const booking = bookingSchema.parse({
    id: existing?.booking.id ?? ctx.newId(),
    updatedAt: now,
    deletedAt: null,
    tripId,
    type: input.type,
    title: input.title.trim(),
    provider: clean(input.provider),
    confirmationNumber: clean(input.confirmationNumber),
    originalUrl: clean(input.originalUrl),
    status: input.status,
    source: existing?.booking.source ?? input.source ?? 'MANUAL',
    parsedBy: existing?.booking.parsedBy ?? input.parsedBy ?? 'MANUAL',
    costAmount: input.costAmount ?? null,
    costCurrency: clean(input.costCurrency),
    rawAttachmentId: existing?.booking.rawAttachmentId ?? null,
  });

  const existingSegments = new Map((existing?.segments ?? []).map((s) => [s.id, s]));
  const locationWrites: LocationWrite[] = [];
  const pruneLocationIds: string[] = [];
  const segmentWrites: Plan['segmentWrites'] = [];

  for (const s of input.segments) {
    const previous = s.id ? existingSegments.get(s.id) : undefined;
    if (s.id && !previous) throw new Error(`Segment ${s.id} does not belong to this booking`);

    const startPrev = previous?.startLocationId
      ? existing?.locations.get(previous.startLocationId)
      : undefined;
    const endPrev = previous?.endLocationId
      ? existing?.locations.get(previous.endLocationId)
      : undefined;

    const start = planLocation(ctx, startPrev, s.startLocation, s.startTimezone, now);
    if (start.write) locationWrites.push(start.write);
    if (start.dropped) pruneLocationIds.push(start.dropped);

    let endId: string | null;
    if (s.sameLocation) {
      endId = start.id;
      // A shared location is the start's row; the old separate end row (if any) goes away.
      if (endPrev && endPrev.id !== start.id) pruneLocationIds.push(endPrev.id);
    } else {
      // Don't reuse the start's row for a different end: if they were shared before, make a
      // new end row so editing one end can't silently change the other.
      const reusableEnd = endPrev && endPrev.id !== startPrev?.id ? endPrev : undefined;
      const end = planLocation(ctx, reusableEnd, s.endLocation, s.endTimezone, now);
      if (end.write) locationWrites.push(end.write);
      if (end.dropped) pruneLocationIds.push(end.dropped);
      endId = end.id;
    }

    const row = segmentSchema.parse({
      id: previous?.id ?? ctx.newId(),
      updatedAt: now,
      deletedAt: null,
      bookingId: booking.id,
      startAtUtc: s.startAtUtc,
      endAtUtc: s.endAtUtc,
      startTimezone: s.startTimezone,
      endTimezone: s.endTimezone,
      startLocationId: start.id,
      endLocationId: endId,
      flightNumber: clean(s.flightNumber),
      seat: clean(s.seat),
      gate: clean(s.gate),
      terminal: clean(s.terminal),
      room: clean(s.room),
      meetingPoint: clean(s.meetingPoint),
    });
    segmentWrites.push({ row, mode: previous ? 'update' : 'insert' });
  }

  const keptIds = new Set(input.segments.map((s) => s.id).filter(Boolean));
  const removed = (existing?.segments ?? []).filter((s) => !keptIds.has(s.id));
  for (const s of removed) {
    for (const locationId of [s.startLocationId, s.endLocationId]) {
      if (locationId) pruneLocationIds.push(locationId);
    }
  }

  if (segmentWrites.length === 0) throw new Error('A booking needs at least one segment');

  return {
    booking,
    bookingMode: existing ? 'update' : 'insert',
    locationWrites,
    segmentWrites,
    removedSegmentIds: removed.map((s) => s.id),
    pruneLocationIds,
  };
}

async function applyPlan(ctx: RepoCtx, plan: Plan): Promise<void> {
  const now = plan.booking.updatedAt;
  await ctx.transaction(async () => {
    if (plan.bookingMode === 'insert') {
      await ctx.db.insert(bookings).values(plan.booking);
    } else {
      await ctx.db.update(bookings).set(plan.booking).where(eq(bookings.id, plan.booking.id));
    }
    // Locations before segments: segments reference them.
    for (const { row, mode } of plan.locationWrites) {
      if (mode === 'insert') await ctx.db.insert(locations).values(row);
      else await ctx.db.update(locations).set(row).where(eq(locations.id, row.id));
    }
    for (const { row, mode } of plan.segmentWrites) {
      if (mode === 'insert') await ctx.db.insert(segments).values(row);
      else await ctx.db.update(segments).set(row).where(eq(segments.id, row.id));
    }
    if (plan.removedSegmentIds.length) {
      await ctx.db
        .update(segments)
        .set({ deletedAt: now, updatedAt: now })
        .where(inArray(segments.id, plan.removedSegmentIds));
    }
    await pruneLocations(ctx, plan.pruneLocationIds, now);
  });
}

export async function createBooking(
  ctx: RepoCtx,
  tripId: string,
  input: BookingInput,
): Promise<Booking> {
  if (!(await getTrip(ctx, tripId))) throw new Error(`Trip not found: ${tripId}`);
  const plan = planBooking(ctx, tripId, input, null);
  await applyPlan(ctx, plan);
  return plan.booking;
}

export interface BookingDetail {
  booking: Booking;
  segments: Segment[];
  locations: Map<string, Location>;
}

export async function getBooking(ctx: RepoCtx, id: string): Promise<BookingDetail | null> {
  const [booking] = await ctx.db
    .select()
    .from(bookings)
    .where(and(eq(bookings.id, id), isNull(bookings.deletedAt)));
  if (!booking) return null;
  const segmentRows = await ctx.db
    .select()
    .from(segments)
    .where(and(eq(segments.bookingId, id), isNull(segments.deletedAt)))
    .orderBy(asc(segments.startAtUtc), asc(segments.id));
  const locationIds = [
    ...new Set(segmentRows.flatMap((s) => [s.startLocationId, s.endLocationId]).filter(isString)),
  ];
  const locationRows = locationIds.length
    ? await ctx.db
        .select()
        .from(locations)
        .where(and(inArray(locations.id, locationIds), isNull(locations.deletedAt)))
    : [];
  return {
    booking,
    segments: segmentRows,
    locations: new Map(locationRows.map((l) => [l.id, l])),
  };
}

export async function updateBooking(
  ctx: RepoCtx,
  id: string,
  input: BookingInput,
): Promise<Booking> {
  const existing = await getBooking(ctx, id);
  if (!existing) throw new Error(`Booking not found: ${id}`);
  const plan = planBooking(ctx, existing.booking.tripId, input, existing);
  await applyPlan(ctx, plan);
  return plan.booking;
}

export async function deleteBooking(ctx: RepoCtx, id: string): Promise<void> {
  const now = ctx.now();
  await ctx.transaction(() => softDeleteBookings(ctx, [id], now));
}

// ---------------------------------------------------------------------------------------------
// Soft-delete helpers
// ---------------------------------------------------------------------------------------------

async function softDeleteBookings(ctx: RepoCtx, bookingIds: string[], now: string) {
  if (bookingIds.length === 0) return;
  const doomed = await ctx.db
    .select()
    .from(segments)
    .where(and(inArray(segments.bookingId, bookingIds), isNull(segments.deletedAt)));
  await ctx.db
    .update(segments)
    .set({ deletedAt: now, updatedAt: now })
    .where(and(inArray(segments.bookingId, bookingIds), isNull(segments.deletedAt)));
  await ctx.db
    .update(bookings)
    .set({ deletedAt: now, updatedAt: now })
    .where(and(inArray(bookings.id, bookingIds), isNull(bookings.deletedAt)));
  await pruneLocations(
    ctx,
    doomed.flatMap((s) => [s.startLocationId, s.endLocationId]).filter(isString),
    now,
  );
}

/** Soft-deletes any of these locations that no live segment still points at. */
async function pruneLocations(ctx: RepoCtx, candidateIds: string[], now: string) {
  const ids = [...new Set(candidateIds)];
  if (ids.length === 0) return;
  const stillUsed = await ctx.db
    .select({ start: segments.startLocationId, end: segments.endLocationId })
    .from(segments)
    .where(isNull(segments.deletedAt));
  const used = new Set(stillUsed.flatMap((s) => [s.start, s.end]).filter(isString));
  const orphans = ids.filter((id) => !used.has(id));
  if (orphans.length === 0) return;
  await ctx.db
    .update(locations)
    .set({ deletedAt: now, updatedAt: now })
    .where(and(inArray(locations.id, orphans), isNull(locations.deletedAt)));
}
