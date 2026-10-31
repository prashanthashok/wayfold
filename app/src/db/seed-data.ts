import type { Booking, Location, Segment, Trip } from '@wayfold/shared';

// Dev-only sample trip: JFK → Tokyo, a hotel and a food tour. It spans two timezones
// (America/New_York is UTC-5 on the departure date, Asia/Tokyo is UTC+9) and two currencies
// (USD has cents; JPY has no minor unit, so ¥84,000 is stored as 84000).
//
// IDs are fixed so seeding is idempotent and can self-heal after a partial run.

const id = (n: number) => `5eed0000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const SEED_IDS = {
  trip: id(1),
  locJfk: id(10),
  locHnd: id(11),
  locHotel: id(12),
  locTour: id(13),
  bookingFlight: id(20),
  bookingHotel: id(21),
  bookingTour: id(22),
  segFlight: id(30),
  segHotel: id(31),
  segTour: id(32),
} as const;

export interface SeedData {
  trips: Trip[];
  locations: Location[];
  bookings: Booking[];
  segments: Segment[];
}

/** `now` is the sync timestamp stamped on every row (UTC, ISO with milliseconds). */
export function buildSeedData(now: string): SeedData {
  const row = { updatedAt: now, deletedAt: null };

  const trips: Trip[] = [
    {
      ...row,
      id: SEED_IDS.trip,
      title: 'Tokyo (sample trip)',
      startDate: '2027-03-12',
      endDate: '2027-03-17',
      coverImage: null,
      homeTimezone: 'America/New_York',
    },
  ];

  const locations: Location[] = [
    {
      ...row,
      id: SEED_IDS.locJfk,
      name: 'John F. Kennedy International Airport',
      address: 'Queens, NY 11430, USA',
      lat: 40.6413,
      lng: -73.7781,
      timezone: 'America/New_York',
    },
    {
      ...row,
      id: SEED_IDS.locHnd,
      name: 'Tokyo Haneda Airport',
      address: 'Ōta City, Tokyo 144-0041, Japan',
      lat: 35.5494,
      lng: 139.7798,
      timezone: 'Asia/Tokyo',
    },
    {
      ...row,
      id: SEED_IDS.locHotel,
      name: 'Example Hotel Shinjuku',
      address: 'Shinjuku City, Tokyo, Japan',
      lat: 35.6938,
      lng: 139.7034,
      timezone: 'Asia/Tokyo',
    },
    {
      ...row,
      id: SEED_IDS.locTour,
      name: 'Tsukiji Outer Market',
      address: 'Chuo City, Tokyo, Japan',
      lat: 35.6655,
      lng: 139.7707,
      timezone: 'Asia/Tokyo',
    },
  ];

  const bookings: Booking[] = [
    {
      ...row,
      id: SEED_IDS.bookingFlight,
      tripId: SEED_IDS.trip,
      type: 'TRANSPORT',
      title: 'JFK → HND',
      provider: 'Example Air',
      confirmationNumber: 'ABC123',
      originalUrl: 'https://example.com/manage/ABC123',
      status: 'CONFIRMED',
      source: 'MANUAL',
      parsedBy: 'MANUAL',
      costAmount: 128450,
      costCurrency: 'USD',
      rawAttachmentId: null,
    },
    {
      ...row,
      id: SEED_IDS.bookingHotel,
      tripId: SEED_IDS.trip,
      type: 'ACCOMMODATION',
      title: 'Example Hotel Shinjuku',
      provider: 'Example Hotels',
      confirmationNumber: 'HTL-98765',
      originalUrl: null,
      status: 'CONFIRMED',
      source: 'MANUAL',
      parsedBy: 'MANUAL',
      costAmount: 84000,
      costCurrency: 'JPY',
      rawAttachmentId: null,
    },
    {
      ...row,
      id: SEED_IDS.bookingTour,
      tripId: SEED_IDS.trip,
      type: 'ACTIVITY',
      title: 'Guided food tour',
      provider: null,
      confirmationNumber: null,
      originalUrl: 'https://example.com/tours/tsukiji',
      status: 'PENDING',
      source: 'SHARE',
      parsedBy: 'DETERMINISTIC',
      costAmount: null,
      costCurrency: null,
      rawAttachmentId: null,
    },
  ];

  const noDetails = {
    flightNumber: null,
    seat: null,
    gate: null,
    terminal: null,
    room: null,
    meetingPoint: null,
  };

  const segments: Segment[] = [
    {
      ...row,
      ...noDetails,
      id: SEED_IDS.segFlight,
      bookingId: SEED_IDS.bookingFlight,
      // 11:00 EST (UTC-5) Mar 12 → 14:30 JST (UTC+9) Mar 13: a 13h30m flight.
      startAtUtc: '2027-03-12T16:00:00Z',
      endAtUtc: '2027-03-13T05:30:00Z',
      startTimezone: 'America/New_York',
      endTimezone: 'Asia/Tokyo',
      startLocationId: SEED_IDS.locJfk,
      endLocationId: SEED_IDS.locHnd,
      flightNumber: 'EX 101',
      seat: '34A',
      terminal: '4',
    },
    {
      ...row,
      ...noDetails,
      id: SEED_IDS.segHotel,
      bookingId: SEED_IDS.bookingHotel,
      // Check-in 15:00 JST Mar 13, check-out 11:00 JST Mar 17.
      startAtUtc: '2027-03-13T06:00:00Z',
      endAtUtc: '2027-03-17T02:00:00Z',
      startTimezone: 'Asia/Tokyo',
      endTimezone: 'Asia/Tokyo',
      startLocationId: SEED_IDS.locHotel,
      endLocationId: SEED_IDS.locHotel,
      room: 'Twin 1204',
    },
    {
      ...row,
      ...noDetails,
      id: SEED_IDS.segTour,
      bookingId: SEED_IDS.bookingTour,
      // 10:00–12:30 JST Mar 14.
      startAtUtc: '2027-03-14T01:00:00Z',
      endAtUtc: '2027-03-14T03:30:00Z',
      startTimezone: 'Asia/Tokyo',
      endTimezone: 'Asia/Tokyo',
      startLocationId: SEED_IDS.locTour,
      endLocationId: SEED_IDS.locTour,
      meetingPoint: 'Under the clock, east exit',
    },
  ];

  return { trips, locations, bookings, segments };
}
