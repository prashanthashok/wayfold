import {
  ATTACHMENT_KINDS,
  BOOKING_SOURCES,
  BOOKING_STATUSES,
  BOOKING_TYPES,
  PARSED_BY,
} from '@wayfold/shared';
import { sql } from 'drizzle-orm';
import { check, index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// The on-device SQLite database is Wayfold's source of truth. Every table carries `id` (UUID),
// `updated_at` and `deleted_at` (soft delete) from day one so premium sync is a later add-on.
// zod mirrors of these tables live in packages/shared/src/schemas.ts; keep them in step
// (schema-matches-shared.ts fails the typecheck if they drift).
//
// TIME RULE: instants are stored as UTC ISO-8601 text (`2027-03-12T16:00:00Z`, whole seconds)
// plus an IANA timezone per segment end. Never naive local datetimes. Fixed-width UTC text sorts
// chronologically. `trips.start_date/end_date` are calendar dates (`2027-03-12`), not instants.

const syncColumns = {
  id: text('id').primaryKey(),
  /** UTC with milliseconds (`Date.toISOString()`); bump on every write. */
  updatedAt: text('updated_at').notNull(),
  /** Soft delete: null = live row. Never hard-delete synced rows. */
  deletedAt: text('deleted_at'),
};

const enumCheck = (column: string, values: readonly string[]) =>
  sql.raw(`${column} IN (${values.map((v) => `'${v}'`).join(', ')})`);

export const trips = sqliteTable(
  'trips',
  {
    ...syncColumns,
    title: text('title').notNull(),
    startDate: text('start_date').notNull(),
    endDate: text('end_date').notNull(),
    coverImage: text('cover_image'),
    homeTimezone: text('home_timezone').notNull(),
  },
  (t) => [check('trips_dates_ordered', sql`${t.startDate} <= ${t.endDate}`)],
);

export const locations = sqliteTable(
  'locations',
  {
    ...syncColumns,
    name: text('name').notNull(),
    address: text('address'),
    lat: real('lat'),
    lng: real('lng'),
    timezone: text('timezone'),
  },
  (t) => [
    check('locations_lat_range', sql`${t.lat} IS NULL OR ${t.lat} BETWEEN -90 AND 90`),
    check('locations_lng_range', sql`${t.lng} IS NULL OR ${t.lng} BETWEEN -180 AND 180`),
  ],
);

export const attachments = sqliteTable(
  'attachments',
  {
    ...syncColumns,
    kind: text('kind', { enum: ATTACHMENT_KINDS }).notNull(),
    /** Local file path on the device (a cloud key once premium sync exists). */
    storageKey: text('storage_key').notNull(),
    parsedAt: text('parsed_at'),
  },
  (t) => [check('attachments_kind_valid', enumCheck('kind', ATTACHMENT_KINDS))],
);

export const bookings = sqliteTable(
  'bookings',
  {
    ...syncColumns,
    tripId: text('trip_id')
      .notNull()
      .references(() => trips.id),
    type: text('type', { enum: BOOKING_TYPES }).notNull(),
    title: text('title').notNull(),
    provider: text('provider'),
    confirmationNumber: text('confirmation_number'),
    /** Deep link back to the source booking. */
    originalUrl: text('original_url'),
    status: text('status', { enum: BOOKING_STATUSES }).notNull(),
    source: text('source', { enum: BOOKING_SOURCES }).notNull(),
    parsedBy: text('parsed_by', { enum: PARSED_BY }).notNull(),
    /** Integer MINOR units (cents; JPY has no minor unit, so ¥84,000 is 84000). */
    costAmount: integer('cost_amount'),
    /** ISO 4217. Set together with costAmount, never converted. */
    costCurrency: text('cost_currency'),
    rawAttachmentId: text('raw_attachment_id').references(() => attachments.id),
  },
  (t) => [
    index('bookings_trip_id_idx').on(t.tripId),
    check('bookings_type_valid', enumCheck('type', BOOKING_TYPES)),
    check('bookings_status_valid', enumCheck('status', BOOKING_STATUSES)),
    check('bookings_source_valid', enumCheck('source', BOOKING_SOURCES)),
    check('bookings_parsed_by_valid', enumCheck('parsed_by', PARSED_BY)),
    check('bookings_cost_nonnegative', sql`${t.costAmount} IS NULL OR ${t.costAmount} >= 0`),
    check('bookings_cost_pair', sql`(${t.costAmount} IS NULL) = (${t.costCurrency} IS NULL)`),
  ],
);

export const segments = sqliteTable(
  'segments',
  {
    ...syncColumns,
    bookingId: text('booking_id')
      .notNull()
      .references(() => bookings.id),
    startAtUtc: text('start_at_utc').notNull(),
    endAtUtc: text('end_at_utc').notNull(),
    /** IANA names (e.g. "Asia/Tokyo"), never abbreviations. */
    startTimezone: text('start_timezone').notNull(),
    endTimezone: text('end_timezone').notNull(),
    startLocationId: text('start_location_id').references(() => locations.id),
    endLocationId: text('end_location_id').references(() => locations.id),
    // Transport
    flightNumber: text('flight_number'),
    seat: text('seat'),
    gate: text('gate'),
    terminal: text('terminal'),
    // Accommodation
    room: text('room'),
    // Activity
    meetingPoint: text('meeting_point'),
  },
  (t) => [
    index('segments_booking_id_idx').on(t.bookingId),
    index('segments_start_at_utc_idx').on(t.startAtUtc),
    check('segments_times_ordered', sql`${t.startAtUtc} <= ${t.endAtUtc}`),
    check(
      'segments_utc_format',
      sql`${t.startAtUtc} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]Z' AND ${t.endAtUtc} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]Z'`,
    ),
  ],
);
