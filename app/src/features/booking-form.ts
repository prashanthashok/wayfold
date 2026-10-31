import {
  formatMoneyInput,
  ianaTimezoneSchema,
  parseMoney,
  tzAbbreviation,
  utcToZoned,
  zonedTimeToUtc,
  type BookingStatus,
  type BookingType,
  type BookingWithSegments,
} from '@wayfold/shared';

import type { BookingDetail, BookingInput, SegmentInput } from '@/db/repo';

// Pure logic behind the booking form: typed text in, validated BookingInput out (and back for
// editing). No React, no database, so the time, money and per-type rules are unit-tested.

export interface SegmentFormState {
  /** Set when editing an existing segment. */
  id?: string;
  startDate: string;
  startTime: string;
  startTz: string;
  endDate: string;
  endTime: string;
  endTz: string;
  startLocationName: string;
  startLocationAddress: string;
  endLocationName: string;
  endLocationAddress: string;
  flightNumber: string;
  seat: string;
  gate: string;
  terminal: string;
  room: string;
  meetingPoint: string;
}

export interface BookingFormState {
  type: BookingType;
  title: string;
  provider: string;
  confirmationNumber: string;
  originalUrl: string;
  status: BookingStatus;
  costAmount: string;
  costCurrency: string;
  segments: SegmentFormState[];
}

type DetailField = 'flightNumber' | 'seat' | 'gate' | 'terminal' | 'room' | 'meetingPoint';

interface SegmentLayout {
  startLabel: string;
  endLabel: string;
  /** Both ends are in the same zone, so only one timezone field is shown. */
  singleTimezone: boolean;
  /** Both ends are the same place (a hotel), so only one location is shown. */
  singleLocation: boolean;
  /** The end may be left blank; it then equals the start. */
  endOptional: boolean;
  startLocationLabel: string;
  endLocationLabel: string;
  /** Extra fields shown (and saved) for this type. */
  details: DetailField[];
}

/** What the form shows for each booking type. Hidden fields are never saved. */
export const SEGMENT_LAYOUT: Record<BookingType, SegmentLayout> = {
  TRANSPORT: {
    startLabel: 'Departs',
    endLabel: 'Arrives',
    singleTimezone: false,
    singleLocation: false,
    endOptional: false,
    startLocationLabel: 'From',
    endLocationLabel: 'To',
    details: ['flightNumber', 'seat', 'gate', 'terminal'],
  },
  ACCOMMODATION: {
    startLabel: 'Check-in',
    endLabel: 'Check-out',
    singleTimezone: true,
    singleLocation: true,
    endOptional: false,
    startLocationLabel: 'Property',
    endLocationLabel: 'Property',
    details: ['room'],
  },
  ACTIVITY: {
    startLabel: 'Starts',
    endLabel: 'Ends',
    singleTimezone: true,
    singleLocation: true,
    endOptional: true,
    startLocationLabel: 'Place',
    endLocationLabel: 'Place',
    details: ['meetingPoint'],
  },
};

export const DETAIL_LABELS: Record<DetailField, string> = {
  flightNumber: 'Flight / train number',
  seat: 'Seat',
  gate: 'Gate',
  terminal: 'Terminal',
  room: 'Room',
  meetingPoint: 'Meeting point',
};

// ---------------------------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------------------------

export function emptySegmentForm(date: string, timezone: string): SegmentFormState {
  return {
    startDate: date,
    startTime: '',
    startTz: timezone,
    endDate: date,
    endTime: '',
    endTz: timezone,
    startLocationName: '',
    startLocationAddress: '',
    endLocationName: '',
    endLocationAddress: '',
    flightNumber: '',
    seat: '',
    gate: '',
    terminal: '',
    room: '',
    meetingPoint: '',
  };
}

export function emptyBookingForm(
  type: BookingType,
  defaults: { date: string; timezone: string; currency: string },
): BookingFormState {
  return {
    type,
    title: '',
    provider: '',
    confirmationNumber: '',
    originalUrl: '',
    status: 'CONFIRMED',
    costAmount: '',
    costCurrency: defaults.currency,
    segments: [emptySegmentForm(defaults.date, defaults.timezone)],
  };
}

/**
 * Where you probably are: the zone the trip's latest segment ends in, else the home zone. Used
 * to pre-fill the timezone so a hotel added after a flight to Tokyo defaults to Tokyo.
 */
export function suggestTimezone(items: readonly BookingWithSegments[], homeTimezone: string) {
  let latest: { endAtUtc: string; endTimezone: string } | null = null;
  for (const { booking, segments } of items) {
    if (booking.status === 'CANCELLED') continue;
    for (const s of segments) {
      if (!latest || s.endAtUtc > latest.endAtUtc) latest = s;
    }
  }
  return latest?.endTimezone ?? homeTimezone;
}

/** The most-used currency among the trip's bookings, else USD. */
export function suggestCurrency(items: readonly BookingWithSegments[]): string {
  const counts = new Map<string, number>();
  for (const { booking } of items) {
    if (booking.costCurrency) {
      counts.set(booking.costCurrency, (counts.get(booking.costCurrency) ?? 0) + 1);
    }
  }
  let best = 'USD';
  let bestCount = 0;
  for (const [currency, n] of counts) {
    if (n > bestCount || (n === bestCount && currency < best)) {
      best = currency;
      bestCount = n;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------------------------
// Stored booking → form
// ---------------------------------------------------------------------------------------------

export function bookingToForm(detail: BookingDetail): BookingFormState {
  const { booking, segments, locations } = detail;
  return {
    type: booking.type,
    title: booking.title,
    provider: booking.provider ?? '',
    confirmationNumber: booking.confirmationNumber ?? '',
    originalUrl: booking.originalUrl ?? '',
    status: booking.status,
    costAmount:
      booking.costAmount !== null && booking.costCurrency !== null
        ? formatMoneyInput(booking.costAmount, booking.costCurrency)
        : '',
    costCurrency: booking.costCurrency ?? '',
    segments: segments.map((s) => {
      const start = utcToZoned(s.startAtUtc, s.startTimezone);
      const end = utcToZoned(s.endAtUtc, s.endTimezone);
      const startLocation = s.startLocationId ? locations.get(s.startLocationId) : undefined;
      const endLocation = s.endLocationId ? locations.get(s.endLocationId) : undefined;
      return {
        id: s.id,
        startDate: start.date,
        startTime: start.time,
        startTz: s.startTimezone,
        endDate: end.date,
        endTime: end.time,
        endTz: s.endTimezone,
        startLocationName: startLocation?.name ?? '',
        startLocationAddress: startLocation?.address ?? '',
        endLocationName: endLocation?.name ?? '',
        endLocationAddress: endLocation?.address ?? '',
        flightNumber: s.flightNumber ?? '',
        seat: s.seat ?? '',
        gate: s.gate ?? '',
        terminal: s.terminal ?? '',
        room: s.room ?? '',
        meetingPoint: s.meetingPoint ?? '',
      };
    }),
  };
}

// ---------------------------------------------------------------------------------------------
// Form → BookingInput
// ---------------------------------------------------------------------------------------------

/** "2027-3-5" → "2027-03-05". Returns the input unchanged if it isn't date-shaped. */
export function normalizeDate(text: string): string {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text.trim());
  return m ? `${m[1]}-${m[2]!.padStart(2, '0')}-${m[3]!.padStart(2, '0')}` : text.trim();
}

/** "9:30" → "09:30". Returns the input unchanged if it isn't time-shaped. */
export function normalizeTime(text: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  return m ? `${m[1]!.padStart(2, '0')}:${m[2]}` : text.trim();
}

/** Only web links are accepted (and later opened). Works the same on every JS engine. */
export function isWebUrl(text: string): boolean {
  return /^https?:\/\/[^\s/$.?#][^\s]*$/i.test(text);
}

export type BookingFormResult =
  | { ok: true; input: BookingInput; warnings: string[] }
  | { ok: false; errors: Record<string, string> };

export function formToBookingInput(form: BookingFormState): BookingFormResult {
  const errors: Record<string, string> = {};
  const warnings: string[] = [];
  const layout = SEGMENT_LAYOUT[form.type];

  const title = form.title.trim();
  if (!title) errors.title = 'Enter a title';

  const url = form.originalUrl.trim();
  if (url && !isWebUrl(url)) errors.originalUrl = 'Enter a link starting with https://';

  // Cost: blank amount means no cost (and the currency is ignored).
  let costAmount: number | null = null;
  let costCurrency: string | null = null;
  if (form.costAmount.trim()) {
    const currency = form.costCurrency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      errors.costCurrency = 'Enter a 3-letter currency code, like USD';
    } else {
      const parsed = parseMoney(form.costAmount, currency);
      if (parsed.ok) {
        costAmount = parsed.minor;
        costCurrency = currency;
      } else {
        errors.costAmount = parsed.error;
      }
    }
  }

  const segments: SegmentInput[] = [];
  form.segments.forEach((s, i) => {
    const at = (field: string) => `segments.${i}.${field}`;
    const startTz = s.startTz.trim();
    const endTz = layout.singleTimezone ? startTz : s.endTz.trim();

    for (const [field, tz] of [
      ['startTz', startTz],
      ['endTz', endTz],
    ] as const) {
      if (field === 'endTz' && layout.singleTimezone) continue;
      if (!ianaTimezoneSchema.safeParse(tz).success) {
        errors[at(field)] = 'Pick a timezone like Asia/Tokyo';
      }
    }

    const start = resolveLocalTime(
      s.startDate,
      s.startTime,
      startTz,
      layout.startLabel,
      at('startDate'),
      at('startTime'),
      errors,
      warnings,
    );

    const endBlank = !s.endDate.trim() && !s.endTime.trim();
    let end = start;
    if (!(layout.endOptional && endBlank)) {
      end = resolveLocalTime(
        s.endDate,
        s.endTime,
        endTz,
        layout.endLabel,
        at('endDate'),
        at('endTime'),
        errors,
        warnings,
      );
      if (start && end && end.utc < start.utc) {
        errors[at('endDate')] =
          `${layout.endLabel} must be after ${layout.startLabel.toLowerCase()}`;
      }
    }

    if (!start || !end || errors[at('startTz')] || errors[at('endTz')]) return;

    const wants = (field: DetailField) => (layout.details.includes(field) ? s[field] : null);
    segments.push({
      id: s.id,
      startAtUtc: start.utc,
      endAtUtc: end.utc,
      startTimezone: startTz,
      endTimezone: endTz,
      startLocation: { name: s.startLocationName, address: s.startLocationAddress },
      endLocation: layout.singleLocation
        ? null
        : { name: s.endLocationName, address: s.endLocationAddress },
      sameLocation: layout.singleLocation,
      flightNumber: wants('flightNumber'),
      seat: wants('seat'),
      gate: wants('gate'),
      terminal: wants('terminal'),
      room: wants('room'),
      meetingPoint: wants('meetingPoint'),
    });
  });

  if (form.segments.length === 0) errors.segments = 'Add at least one date and time';
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    warnings,
    input: {
      type: form.type,
      title,
      provider: form.provider,
      confirmationNumber: form.confirmationNumber,
      originalUrl: url || null,
      status: form.status,
      costAmount,
      costCurrency,
      segments,
    },
  };
}

function resolveLocalTime(
  rawDate: string,
  rawTime: string,
  timezone: string,
  label: string,
  dateKey: string,
  timeKey: string,
  errors: Record<string, string>,
  warnings: string[],
): { utc: string } | null {
  const date = normalizeDate(rawDate);
  const time = normalizeTime(rawTime);
  if (!date) errors[dateKey] = 'Enter a date';
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) errors[dateKey] = 'Use the format YYYY-MM-DD';
  if (!time) errors[timeKey] = 'Enter a time';
  else if (!/^\d{2}:\d{2}$/.test(time)) errors[timeKey] = 'Use 24-hour time like 14:30';
  if (errors[dateKey] || errors[timeKey]) return null;
  if (!ianaTimezoneSchema.safeParse(timezone).success) return null;

  let resolved;
  try {
    resolved = zonedTimeToUtc(date, time, timezone);
  } catch {
    // Impossible dates (Feb 30) and times (25:00) land here.
    const bad = Number(time.slice(0, 2)) > 23 || Number(time.slice(3)) > 59;
    errors[bad ? timeKey : dateKey] = bad ? 'That time doesn’t exist' : 'That date doesn’t exist';
    return null;
  }

  if (resolved.resolution === 'gap') {
    const shown = utcToZoned(resolved.utc, timezone).time;
    warnings.push(
      `${label} ${time} doesn’t exist in ${timezone} on ${date} (clocks skip forward), so it was saved as ${shown}.`,
    );
  } else if (resolved.resolution === 'ambiguous') {
    warnings.push(
      `${label} ${time} happens twice in ${timezone} on ${date} (clocks go back); the first one was used (${tzAbbreviation(resolved.utc, timezone)}).`,
    );
  }
  return { utc: resolved.utc };
}
