import { z } from 'zod';

import {
  ATTACHMENT_KINDS,
  BOOKING_SOURCES,
  BOOKING_STATUSES,
  BOOKING_TYPES,
  PARSED_BY,
} from './enums';

// ---------------------------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------------------------

/** Every row is keyed by a UUID. */
export const idSchema = z.uuid();
export type Id = z.infer<typeof idSchema>;

/**
 * A moment in time: ISO 8601, UTC, whole seconds, e.g. `2027-03-12T16:00:00Z`.
 * Rejects offsets (`+09:00`), naive local times (no `Z`) and fractional seconds. A fixed format
 * means plain string comparison and ORDER BY sort chronologically.
 */
export const utcInstantSchema = z.iso.datetime({ precision: 0 });

/** Bookkeeping timestamp: UTC with milliseconds (`Date.toISOString()`), for last-write-wins. */
export const syncTimestampSchema = z.iso.datetime({ precision: 3 });

/** A calendar date with no time or zone, e.g. a trip's first day: `2027-03-12`. */
export const calendarDateSchema = z.iso.date();

function isKnownTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** IANA timezone name, e.g. `America/New_York`. Abbreviations like `EST` are not accepted. */
export const ianaTimezoneSchema = z
  .string()
  .regex(/^(UTC|[A-Za-z_]+(\/[A-Za-z_+-]+)+)$/, 'Expected an IANA timezone like "Asia/Tokyo"')
  .refine(isKnownTimeZone, 'Unknown IANA timezone');

/** ISO 4217 currency code, upper case, e.g. `USD`, `JPY`. */
export const currencySchema = z.string().regex(/^[A-Z]{3}$/, 'Expected an ISO 4217 code');

/** Money in integer minor units (cents for USD, whole yen for JPY — the exponent is per currency). */
export const minorUnitsSchema = z.int().nonnegative();

/** Columns on every synced row. `deletedAt` is a soft delete: null means the row is live. */
const rowBase = {
  id: idSchema,
  updatedAt: syncTimestampSchema,
  deletedAt: syncTimestampSchema.nullable(),
};

// ---------------------------------------------------------------------------------------------
// Entities (these mirror the Drizzle tables in app/src/db/schema.ts)
// ---------------------------------------------------------------------------------------------

export const tripSchema = z
  .object({
    ...rowBase,
    title: z.string().min(1),
    startDate: calendarDateSchema,
    endDate: calendarDateSchema,
    coverImage: z.string().nullable(),
    homeTimezone: ianaTimezoneSchema,
  })
  .refine((t) => t.startDate <= t.endDate, {
    message: 'endDate must not be before startDate',
    path: ['endDate'],
  });
export type Trip = z.infer<typeof tripSchema>;

export const locationSchema = z.object({
  ...rowBase,
  name: z.string().min(1),
  address: z.string().nullable(),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  timezone: ianaTimezoneSchema.nullable(),
});
export type Location = z.infer<typeof locationSchema>;

export const attachmentSchema = z.object({
  ...rowBase,
  kind: z.enum(ATTACHMENT_KINDS),
  /** Local file path on the device (a cloud key once premium sync exists). */
  storageKey: z.string().min(1),
  parsedAt: syncTimestampSchema.nullable(),
});
export type Attachment = z.infer<typeof attachmentSchema>;

export const bookingSchema = z
  .object({
    ...rowBase,
    tripId: idSchema,
    type: z.enum(BOOKING_TYPES),
    title: z.string().min(1),
    /** e.g. "Airbnb", "United" */
    provider: z.string().nullable(),
    confirmationNumber: z.string().nullable(),
    /** Deep link back to the source booking. */
    originalUrl: z.url().nullable(),
    status: z.enum(BOOKING_STATUSES),
    source: z.enum(BOOKING_SOURCES),
    parsedBy: z.enum(PARSED_BY),
    costAmount: minorUnitsSchema.nullable(),
    costCurrency: currencySchema.nullable(),
    rawAttachmentId: idSchema.nullable(),
  })
  .refine((b) => (b.costAmount === null) === (b.costCurrency === null), {
    message: 'costAmount and costCurrency must be set together',
    path: ['costCurrency'],
  });
export type Booking = z.infer<typeof bookingSchema>;

export const segmentSchema = z
  .object({
    ...rowBase,
    bookingId: idSchema,
    startAtUtc: utcInstantSchema,
    endAtUtc: utcInstantSchema,
    startTimezone: ianaTimezoneSchema,
    endTimezone: ianaTimezoneSchema,
    startLocationId: idSchema.nullable(),
    endLocationId: idSchema.nullable(),
    // Transport
    flightNumber: z.string().nullable(),
    seat: z.string().nullable(),
    gate: z.string().nullable(),
    terminal: z.string().nullable(),
    // Accommodation
    room: z.string().nullable(),
    // Activity
    meetingPoint: z.string().nullable(),
  })
  .refine((s) => s.startAtUtc <= s.endAtUtc, {
    message: 'endAtUtc must not be before startAtUtc',
    path: ['endAtUtc'],
  });
export type Segment = z.infer<typeof segmentSchema>;
