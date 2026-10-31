// Enum values are defined once here and reused by the Drizzle schema (app/src/db/schema.ts),
// so the database CHECK constraints and the zod validation can't drift apart.

export const BOOKING_TYPES = ['ACCOMMODATION', 'TRANSPORT', 'ACTIVITY'] as const;
export type BookingType = (typeof BOOKING_TYPES)[number];

export const BOOKING_STATUSES = ['CONFIRMED', 'PENDING', 'CANCELLED'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const BOOKING_SOURCES = ['SHARE', 'PDF', 'EMAIL', 'CALENDAR', 'MANUAL'] as const;
export type BookingSource = (typeof BOOKING_SOURCES)[number];

export const PARSED_BY = ['DETERMINISTIC', 'LLM', 'MANUAL'] as const;
export type ParsedBy = (typeof PARSED_BY)[number];

export const ATTACHMENT_KINDS = ['PDF', 'IMAGE', 'EMAIL_RAW'] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];
