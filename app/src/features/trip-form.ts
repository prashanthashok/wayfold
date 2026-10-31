import { ianaTimezoneSchema, isValidCalendarDate } from '@wayfold/shared';

import type { TripInput } from '@/db/repo';

import { normalizeDate } from './booking-form';

export interface TripFormState {
  title: string;
  startDate: string;
  endDate: string;
  homeTimezone: string;
}

export type TripFormResult =
  | { ok: true; input: TripInput }
  | { ok: false; errors: Partial<Record<keyof TripFormState, string>> };

/** Typed text → a validated trip, or per-field messages. Dates are calendar dates, no zone. */
export function validateTripForm(form: TripFormState): TripFormResult {
  const errors: Partial<Record<keyof TripFormState, string>> = {};

  const title = form.title.trim();
  if (!title) errors.title = 'Enter a trip name';

  const startDate = normalizeDate(form.startDate);
  const endDate = normalizeDate(form.endDate);
  if (!startDate) errors.startDate = 'Enter a start date';
  else if (!isValidCalendarDate(startDate)) errors.startDate = 'Use a real date like 2027-03-12';
  if (!endDate) errors.endDate = 'Enter an end date';
  else if (!isValidCalendarDate(endDate)) errors.endDate = 'Use a real date like 2027-03-17';
  if (!errors.startDate && !errors.endDate && endDate < startDate) {
    errors.endDate = 'The trip can’t end before it starts';
  }

  const homeTimezone = form.homeTimezone.trim();
  if (!ianaTimezoneSchema.safeParse(homeTimezone).success) {
    errors.homeTimezone = 'Pick a timezone like America/New_York';
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, input: { title, startDate, endDate, homeTimezone } };
}
