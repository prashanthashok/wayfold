import { describe, expect, it } from 'vitest';

import {
  bookingSchema,
  currencySchema,
  ianaTimezoneSchema,
  idSchema,
  locationSchema,
  segmentSchema,
  tripSchema,
  utcInstantSchema,
} from './index';

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const NOW = '2027-01-01T00:00:00.000Z';
const row = (n: number) => ({ id: ID(n), updatedAt: NOW, deletedAt: null });

describe('idSchema', () => {
  it('accepts a UUID and rejects other strings', () => {
    expect(idSchema.safeParse(ID(1)).success).toBe(true);
    expect(idSchema.safeParse('not-a-uuid').success).toBe(false);
  });
});

describe('utcInstantSchema (no naive local times)', () => {
  it.each([
    ['UTC with Z', '2027-03-12T16:00:00Z', true],
    ['naive local time', '2027-03-12T11:00:00', false],
    ['offset instead of Z', '2027-03-12T11:00:00-05:00', false],
    ['fractional seconds', '2027-03-12T16:00:00.250Z', false],
    ['date only', '2027-03-12', false],
  ])('%s', (_name, value, ok) => {
    expect(utcInstantSchema.safeParse(value).success).toBe(ok);
  });
});

describe('ianaTimezoneSchema', () => {
  it.each(['America/New_York', 'Asia/Tokyo', 'America/Argentina/Buenos_Aires', 'UTC'])(
    'accepts %s',
    (tz) => expect(ianaTimezoneSchema.safeParse(tz).success).toBe(true),
  );
  it.each(['EST', 'JST', 'GMT+9', 'Mars/Olympus', '', 'asia/tokyo '])('rejects %j', (tz) =>
    expect(ianaTimezoneSchema.safeParse(tz).success).toBe(false),
  );
});

describe('currencySchema', () => {
  it('requires an upper-case ISO 4217 code', () => {
    expect(currencySchema.safeParse('USD').success).toBe(true);
    expect(currencySchema.safeParse('usd').success).toBe(false);
    expect(currencySchema.safeParse('US').success).toBe(false);
  });
});

describe('tripSchema', () => {
  const trip = {
    ...row(1),
    title: 'Tokyo',
    startDate: '2027-03-12',
    endDate: '2027-03-17',
    coverImage: null,
    homeTimezone: 'America/New_York',
  };
  it('accepts a valid trip', () => expect(tripSchema.safeParse(trip).success).toBe(true));
  it('requires soft-delete + sync columns', () => {
    const { deletedAt: _d, ...withoutDeletedAt } = trip;
    expect(tripSchema.safeParse(withoutDeletedAt).success).toBe(false);
  });
  it('rejects a trip that ends before it starts', () =>
    expect(tripSchema.safeParse({ ...trip, endDate: '2027-03-11' }).success).toBe(false));
  it('allows a one-day trip', () =>
    expect(tripSchema.safeParse({ ...trip, endDate: trip.startDate }).success).toBe(true));
  it('rejects a date with a time component', () =>
    expect(tripSchema.safeParse({ ...trip, startDate: '2027-03-12T00:00:00Z' }).success).toBe(
      false,
    ));
});

describe('locationSchema', () => {
  const loc = {
    ...row(2),
    name: 'HND',
    address: null,
    lat: 35.5494,
    lng: 139.7798,
    timezone: 'Asia/Tokyo',
  };
  it('accepts valid coordinates', () => expect(locationSchema.safeParse(loc).success).toBe(true));
  it('rejects out-of-range latitude', () =>
    expect(locationSchema.safeParse({ ...loc, lat: 91 }).success).toBe(false));
});

describe('bookingSchema', () => {
  const booking = {
    ...row(3),
    tripId: ID(1),
    type: 'TRANSPORT',
    title: 'Flight',
    provider: 'Example Air',
    confirmationNumber: 'ABC123',
    originalUrl: 'https://example.com/trip/ABC123',
    status: 'CONFIRMED',
    source: 'MANUAL',
    parsedBy: 'MANUAL',
    costAmount: 128450,
    costCurrency: 'USD',
    rawAttachmentId: null,
  };
  it('accepts a valid booking', () => expect(bookingSchema.safeParse(booking).success).toBe(true));
  it('rejects fractional money (must be integer minor units)', () =>
    expect(bookingSchema.safeParse({ ...booking, costAmount: 1284.5 }).success).toBe(false));
  it('rejects negative money', () =>
    expect(bookingSchema.safeParse({ ...booking, costAmount: -1 }).success).toBe(false));
  it('requires amount and currency together', () => {
    expect(bookingSchema.safeParse({ ...booking, costCurrency: null }).success).toBe(false);
    expect(
      bookingSchema.safeParse({ ...booking, costAmount: null, costCurrency: null }).success,
    ).toBe(true);
  });
  it('rejects unknown enum values', () =>
    expect(bookingSchema.safeParse({ ...booking, source: 'FAX' }).success).toBe(false));
});

describe('segmentSchema', () => {
  const segment = {
    ...row(4),
    bookingId: ID(3),
    startAtUtc: '2027-03-12T16:00:00Z',
    endAtUtc: '2027-03-13T05:30:00Z',
    startTimezone: 'America/New_York',
    endTimezone: 'Asia/Tokyo',
    startLocationId: null,
    endLocationId: null,
    flightNumber: 'EX 101',
    seat: null,
    gate: null,
    terminal: null,
    room: null,
    meetingPoint: null,
  };
  it('accepts a segment spanning two timezones', () =>
    expect(segmentSchema.safeParse(segment).success).toBe(true));
  it('rejects a segment that ends before it starts', () =>
    expect(segmentSchema.safeParse({ ...segment, endAtUtc: '2027-03-12T15:59:59Z' }).success).toBe(
      false,
    ));
  it('rejects a naive local start time', () =>
    expect(segmentSchema.safeParse({ ...segment, startAtUtc: '2027-03-12T11:00:00' }).success).toBe(
      false,
    ));
  it('rejects a timezone abbreviation', () =>
    expect(segmentSchema.safeParse({ ...segment, startTimezone: 'EST' }).success).toBe(false));
});
