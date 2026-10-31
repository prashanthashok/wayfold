import type { Booking, Segment, Trip } from './schemas';
import { addDays, daysBetween, utcToZoned } from './time';

// Day-by-day itinerary. Each event is placed on the calendar day it happens on *in its own
// timezone*, so a 23:00 departure in New York stays on that evening's day even though it is
// already tomorrow in UTC.

export type TimelineEventKind = 'CHECK_IN' | 'CHECK_OUT' | 'DEPARTURE' | 'ACTIVITY';

export interface TimelineEvent {
  /** Stable React key. */
  key: string;
  kind: TimelineEventKind;
  atUtc: string;
  timezone: string;
  /** When a departure/activity ends (null for check-in and check-out). */
  endsAtUtc: string | null;
  endsTimezone: string | null;
  /** Local calendar days between the event's start and end ("arrives +1 day"); 0 = same day. */
  endsDaysLater: number;
  booking: Booking;
  segment: Segment;
}

export interface TimelineDay {
  /** Local calendar date, `YYYY-MM-DD`. */
  date: string;
  /** False for days outside the trip's start/end dates that still have events. */
  inTrip: boolean;
  events: TimelineEvent[];
}

export interface BookingWithSegments {
  booking: Booking;
  segments: Segment[];
}

const MAX_FILLED_DAYS = 366;

export function buildTimeline(
  trip: Pick<Trip, 'startDate' | 'endDate'>,
  items: readonly BookingWithSegments[],
): TimelineDay[] {
  const events: TimelineEvent[] = [];

  for (const { booking, segments } of items) {
    for (const segment of segments) {
      const base = { booking, segment };
      if (booking.type === 'ACCOMMODATION') {
        events.push({
          ...base,
          key: `${segment.id}:in`,
          kind: 'CHECK_IN',
          atUtc: segment.startAtUtc,
          timezone: segment.startTimezone,
          endsAtUtc: null,
          endsTimezone: null,
          endsDaysLater: 0,
        });
        events.push({
          ...base,
          key: `${segment.id}:out`,
          kind: 'CHECK_OUT',
          atUtc: segment.endAtUtc,
          timezone: segment.endTimezone,
          endsAtUtc: null,
          endsTimezone: null,
          endsDaysLater: 0,
        });
      } else {
        const startDate = utcToZoned(segment.startAtUtc, segment.startTimezone).date;
        const endDate = utcToZoned(segment.endAtUtc, segment.endTimezone).date;
        events.push({
          ...base,
          key: segment.id,
          kind: booking.type === 'TRANSPORT' ? 'DEPARTURE' : 'ACTIVITY',
          atUtc: segment.startAtUtc,
          timezone: segment.startTimezone,
          endsAtUtc: segment.endAtUtc,
          endsTimezone: segment.endTimezone,
          endsDaysLater: Math.max(0, daysBetween(startDate, endDate)),
        });
      }
    }
  }

  events.sort((a, b) => a.atUtc.localeCompare(b.atUtc) || a.key.localeCompare(b.key));

  const days = new Map<string, TimelineDay>();
  const inRange = (date: string) => date >= trip.startDate && date <= trip.endDate;

  // Every day of the trip appears, even with nothing planned.
  const length = daysBetween(trip.startDate, trip.endDate);
  if (length >= 0 && length < MAX_FILLED_DAYS) {
    for (let i = 0; i <= length; i++) {
      const date = addDays(trip.startDate, i);
      days.set(date, { date, inTrip: true, events: [] });
    }
  }
  for (const event of events) {
    const date = utcToZoned(event.atUtc, event.timezone).date;
    const day = days.get(date) ?? { date, inTrip: inRange(date), events: [] };
    day.events.push(event);
    days.set(date, day);
  }

  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}
