import { describe, expect, it } from 'vitest';

import type { Booking, Segment } from './schemas';
import { buildTimeline, type BookingWithSegments } from './timeline';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const NOW = '2027-01-01T00:00:00.000Z';

const trip = { startDate: '2027-03-12', endDate: '2027-03-17' };

function booking(n: number, type: Booking['type'], overrides: Partial<Booking> = {}): Booking {
  return {
    id: id(n),
    updatedAt: NOW,
    deletedAt: null,
    tripId: id(1),
    type,
    title: `Booking ${n}`,
    provider: null,
    confirmationNumber: null,
    originalUrl: null,
    status: 'CONFIRMED',
    source: 'MANUAL',
    parsedBy: 'MANUAL',
    costAmount: null,
    costCurrency: null,
    rawAttachmentId: null,
    ...overrides,
  };
}

function segment(n: number, bookingN: number, overrides: Partial<Segment>): Segment {
  return {
    id: id(n),
    updatedAt: NOW,
    deletedAt: null,
    bookingId: id(bookingN),
    startAtUtc: '2027-03-12T16:00:00Z',
    endAtUtc: '2027-03-12T17:00:00Z',
    startTimezone: 'UTC',
    endTimezone: 'UTC',
    startLocationId: null,
    endLocationId: null,
    flightNumber: null,
    seat: null,
    gate: null,
    terminal: null,
    room: null,
    meetingPoint: null,
    ...overrides,
  };
}

// The Tokyo sample trip: flight JFK→HND, hotel in Tokyo, food tour.
const flight: BookingWithSegments = {
  booking: booking(10, 'TRANSPORT', { title: 'JFK → HND' }),
  segments: [
    segment(30, 10, {
      startAtUtc: '2027-03-12T16:00:00Z',
      endAtUtc: '2027-03-13T05:30:00Z',
      startTimezone: 'America/New_York',
      endTimezone: 'Asia/Tokyo',
    }),
  ],
};
const hotel: BookingWithSegments = {
  booking: booking(11, 'ACCOMMODATION', { title: 'Hotel' }),
  segments: [
    segment(31, 11, {
      startAtUtc: '2027-03-13T06:00:00Z',
      endAtUtc: '2027-03-17T02:00:00Z',
      startTimezone: 'Asia/Tokyo',
      endTimezone: 'Asia/Tokyo',
    }),
  ],
};
const tour: BookingWithSegments = {
  booking: booking(12, 'ACTIVITY', { title: 'Food tour' }),
  segments: [
    segment(32, 12, {
      startAtUtc: '2027-03-14T01:00:00Z',
      endAtUtc: '2027-03-14T03:30:00Z',
      startTimezone: 'Asia/Tokyo',
      endTimezone: 'Asia/Tokyo',
    }),
  ],
};

describe('buildTimeline', () => {
  it('lists every day of the trip, in order, including empty ones', () => {
    const days = buildTimeline(trip, [flight, hotel, tour]);
    expect(days.map((d) => d.date)).toEqual([
      '2027-03-12',
      '2027-03-13',
      '2027-03-14',
      '2027-03-15',
      '2027-03-16',
      '2027-03-17',
    ]);
    expect(days.find((d) => d.date === '2027-03-15')?.events).toEqual([]);
    expect(days.every((d) => d.inTrip)).toBe(true);
  });

  it('puts each event on its own local day: a 11:00 EST departure stays on Mar 12', () => {
    const days = buildTimeline(trip, [flight, hotel, tour]);
    const byDate = Object.fromEntries(days.map((d) => [d.date, d.events.map((e) => e.kind)]));
    expect(byDate['2027-03-12']).toEqual(['DEPARTURE']);
    expect(byDate['2027-03-13']).toEqual(['CHECK_IN']); // 15:00 JST
    expect(byDate['2027-03-14']).toEqual(['ACTIVITY']);
    expect(byDate['2027-03-17']).toEqual(['CHECK_OUT']); // 11:00 JST
  });

  it('uses the event’s own zone, not UTC, to pick the day', () => {
    // 2027-03-13T02:00Z is still Mar 12 evening in New York but already Mar 13 in Tokyo.
    const late = (tz: string): BookingWithSegments => ({
      booking: booking(20, 'ACTIVITY'),
      segments: [
        segment(40, 20, {
          startAtUtc: '2027-03-13T02:00:00Z',
          endAtUtc: '2027-03-13T03:00:00Z',
          startTimezone: tz,
          endTimezone: tz,
        }),
      ],
    });
    const ny = buildTimeline(trip, [late('America/New_York')]);
    const tokyo = buildTimeline(trip, [late('Asia/Tokyo')]);
    expect(ny.find((d) => d.events.length)?.date).toBe('2027-03-12');
    expect(tokyo.find((d) => d.events.length)?.date).toBe('2027-03-13');
  });

  it('reports how many local days later an arrival lands', () => {
    const [event] = buildTimeline(trip, [flight]).flatMap((d) => d.events);
    expect(event?.endsDaysLater).toBe(1); // departs Mar 12 EST, arrives Mar 13 JST
    const [tourEvent] = buildTimeline(trip, [tour]).flatMap((d) => d.events);
    expect(tourEvent?.endsDaysLater).toBe(0);
  });

  it('splits a stay into check-in and check-out events', () => {
    const events = buildTimeline(trip, [hotel]).flatMap((d) => d.events);
    expect(events.map((e) => [e.kind, e.timezone])).toEqual([
      ['CHECK_IN', 'Asia/Tokyo'],
      ['CHECK_OUT', 'Asia/Tokyo'],
    ]);
    expect(events[0]?.endsAtUtc).toBeNull();
  });

  it('orders events within a day by instant, not by booking', () => {
    const morning: BookingWithSegments = {
      booking: booking(21, 'ACTIVITY', { title: 'Z morning' }),
      segments: [
        segment(41, 21, {
          startAtUtc: '2027-03-15T00:00:00Z',
          endAtUtc: '2027-03-15T01:00:00Z',
          startTimezone: 'UTC',
          endTimezone: 'UTC',
        }),
      ],
    };
    const evening: BookingWithSegments = {
      booking: booking(22, 'ACTIVITY', { title: 'A evening' }),
      segments: [
        segment(42, 22, {
          startAtUtc: '2027-03-15T20:00:00Z',
          endAtUtc: '2027-03-15T21:00:00Z',
          startTimezone: 'UTC',
          endTimezone: 'UTC',
        }),
      ],
    };
    const day = buildTimeline(trip, [evening, morning]).find((d) => d.date === '2027-03-15');
    expect(day?.events.map((e) => e.booking.title)).toEqual(['Z morning', 'A evening']);
  });

  it('adds days outside the trip dates when events fall there, flagged as such', () => {
    const early: BookingWithSegments = {
      booking: booking(23, 'ACTIVITY'),
      segments: [
        segment(43, 23, {
          startAtUtc: '2027-03-10T12:00:00Z',
          endAtUtc: '2027-03-10T13:00:00Z',
        }),
      ],
    };
    const days = buildTimeline(trip, [early, flight]);
    expect(days[0]).toMatchObject({ date: '2027-03-10', inTrip: false });
    expect(days[0]?.events).toHaveLength(1);
    expect(days.filter((d) => d.inTrip)).toHaveLength(6);
  });

  it('keeps cancelled bookings so the UI can show them struck through', () => {
    const cancelled: BookingWithSegments = {
      booking: { ...tour.booking, status: 'CANCELLED' },
      segments: tour.segments,
    };
    const events = buildTimeline(trip, [cancelled]).flatMap((d) => d.events);
    expect(events).toHaveLength(1);
    expect(events[0]?.booking.status).toBe('CANCELLED');
  });

  it('handles a trip with no bookings and a trip whose end precedes its start', () => {
    expect(buildTimeline(trip, [])).toHaveLength(6);
    expect(buildTimeline({ startDate: '2027-03-17', endDate: '2027-03-12' }, [])).toEqual([]);
  });
});
