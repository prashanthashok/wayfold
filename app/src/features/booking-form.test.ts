import type { BookingWithSegments } from '@wayfold/shared';
import { describe, expect, it } from 'vitest';

import { createBooking, createTrip, getBooking, getTripDetail } from '@/db/repo';
import { createTestCtx } from '@/db/test-db';

import {
  bookingToForm,
  emptyBookingForm,
  formToBookingInput,
  isWebUrl,
  normalizeDate,
  normalizeTime,
  suggestCurrency,
  suggestTimezone,
  type BookingFormState,
} from './booking-form';

const defaults = { date: '2027-03-12', timezone: 'America/New_York', currency: 'USD' };

function flightForm(overrides: Partial<BookingFormState> = {}): BookingFormState {
  const form = emptyBookingForm('TRANSPORT', defaults);
  Object.assign(form, { title: 'JFK → HND', provider: 'Example Air', ...overrides });
  Object.assign(form.segments[0]!, {
    startDate: '2027-03-12',
    startTime: '11:00',
    startTz: 'America/New_York',
    endDate: '2027-03-13',
    endTime: '14:30',
    endTz: 'Asia/Tokyo',
    startLocationName: 'JFK',
    endLocationName: 'HND',
    flightNumber: 'EX 101',
    seat: '34A',
  });
  return form;
}

function ok(form: BookingFormState) {
  const result = formToBookingInput(form);
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.errors)}`);
  return result;
}

function errors(form: BookingFormState) {
  const result = formToBookingInput(form);
  if (result.ok) throw new Error('expected errors');
  return result.errors;
}

describe('formToBookingInput: transport', () => {
  it('converts local departure and arrival to UTC using each end’s own zone', () => {
    const { input, warnings } = ok(flightForm({ costAmount: '1284.50', costCurrency: 'usd' }));
    expect(warnings).toEqual([]);
    expect(input).toMatchObject({
      type: 'TRANSPORT',
      title: 'JFK → HND',
      costAmount: 128450,
      costCurrency: 'USD',
    });
    expect(input.segments[0]).toMatchObject({
      startAtUtc: '2027-03-12T16:00:00Z', // 11:00 EST
      endAtUtc: '2027-03-13T05:30:00Z', // 14:30 JST
      startTimezone: 'America/New_York',
      endTimezone: 'Asia/Tokyo',
      startLocation: { name: 'JFK' },
      endLocation: { name: 'HND' },
      sameLocation: false,
      flightNumber: 'EX 101',
      seat: '34A',
    });
  });

  it('accepts loose date and time shapes', () => {
    const form = flightForm();
    Object.assign(form.segments[0]!, { startDate: '2027-3-12', startTime: '9:05' });
    expect(ok(form).input.segments[0]?.startAtUtc).toBe('2027-03-12T14:05:00Z');
  });

  it('compares end and start by instant, not by wall-clock date', () => {
    // 00:30 on the 13th in Tokyo looks later than 11:00 on the 12th, but it is 15:30Z, earlier
    // than the 16:00Z departure.
    const form = flightForm();
    Object.assign(form.segments[0]!, { endDate: '2027-03-13', endTime: '00:30' });
    expect(errors(form)['segments.0.endDate']).toMatch(/must be after/);
    // 05:00 JST on the 13th is 20:00Z on the 12th: fine, despite the "earlier" clock reading.
    Object.assign(form.segments[0]!, { endTime: '05:00' });
    expect(formToBookingInput(form).ok).toBe(true);
  });
});

describe('formToBookingInput: accommodation and activity', () => {
  it('a stay uses one timezone and one shared location, and drops transport fields', () => {
    const form = emptyBookingForm('ACCOMMODATION', defaults);
    Object.assign(form, { title: 'Hotel' });
    Object.assign(form.segments[0]!, {
      startDate: '2027-03-13',
      startTime: '15:00',
      startTz: 'Asia/Tokyo',
      endDate: '2027-03-17',
      endTime: '11:00',
      endTz: 'America/New_York', // stale: must be ignored for a stay
      startLocationName: 'Example Hotel',
      endLocationName: 'ignored',
      room: 'Twin 1204',
      seat: '34A', // stale from a previous type
      flightNumber: 'EX 101',
    });
    const seg = ok(form).input.segments[0]!;
    expect(seg).toMatchObject({
      startAtUtc: '2027-03-13T06:00:00Z',
      endAtUtc: '2027-03-17T02:00:00Z',
      startTimezone: 'Asia/Tokyo',
      endTimezone: 'Asia/Tokyo',
      sameLocation: true,
      endLocation: null,
      room: 'Twin 1204',
      seat: null,
      flightNumber: null,
    });
  });

  it('an activity may leave the end blank, which makes it equal the start', () => {
    const form = emptyBookingForm('ACTIVITY', defaults);
    Object.assign(form, { title: 'Food tour' });
    Object.assign(form.segments[0]!, {
      startDate: '2027-03-14',
      startTime: '10:00',
      startTz: 'Asia/Tokyo',
      endDate: '',
      endTime: '',
      meetingPoint: 'Under the clock',
    });
    const seg = ok(form).input.segments[0]!;
    expect(seg.startAtUtc).toBe('2027-03-14T01:00:00Z');
    expect(seg.endAtUtc).toBe(seg.startAtUtc);
    expect(seg.meetingPoint).toBe('Under the clock');
  });

  it('a stay still requires its check-out', () => {
    const form = emptyBookingForm('ACCOMMODATION', defaults);
    Object.assign(form, { title: 'Hotel' });
    Object.assign(form.segments[0]!, { startTime: '15:00', endDate: '', endTime: '' });
    const e = errors(form);
    expect(e['segments.0.endDate']).toBeDefined();
    expect(e['segments.0.endTime']).toBeDefined();
  });
});

describe('formToBookingInput: validation', () => {
  it('requires a title', () => {
    expect(errors(flightForm({ title: '   ' })).title).toBeDefined();
  });

  it.each(['https://example.com/trip/1', 'http://example.com', 'HTTPS://EXAMPLE.COM/x?y=1#z'])(
    'accepts the link %s',
    (url) => expect(ok(flightForm({ originalUrl: url })).input.originalUrl).toBe(url),
  );
  it.each([
    'example.com',
    'ftp://example.com',
    'javascript:alert(1)',
    'not a url',
    'https://',
    'https://a b',
  ])('rejects the link %j', (url) =>
    expect(errors(flightForm({ originalUrl: url })).originalUrl).toBeDefined(),
  );
  it('treats a blank link as none', () => {
    expect(ok(flightForm({ originalUrl: '  ' })).input.originalUrl).toBeNull();
  });

  describe('cost', () => {
    it('a blank amount means no cost, whatever the currency says', () => {
      const { input } = ok(flightForm({ costAmount: '  ', costCurrency: 'EUR' }));
      expect(input.costAmount).toBeNull();
      expect(input.costCurrency).toBeNull();
    });
    it('uses the currency’s own minor unit (JPY has none)', () => {
      expect(ok(flightForm({ costAmount: '84000', costCurrency: 'JPY' })).input).toMatchObject({
        costAmount: 84000,
        costCurrency: 'JPY',
      });
      expect(errors(flightForm({ costAmount: '840.50', costCurrency: 'JPY' })).costAmount).toMatch(
        /no decimal places/,
      );
    });
    it('rejects a bad amount or a missing currency', () => {
      expect(errors(flightForm({ costAmount: 'abc' })).costAmount).toBeDefined();
      expect(errors(flightForm({ costAmount: '12.345' })).costAmount).toBeDefined();
      expect(errors(flightForm({ costAmount: '10', costCurrency: '' })).costCurrency).toBeDefined();
      expect(
        errors(flightForm({ costAmount: '10', costCurrency: 'US' })).costCurrency,
      ).toBeDefined();
    });
  });

  describe('dates, times and zones', () => {
    const bad = (patch: Record<string, string>) => {
      const form = flightForm();
      Object.assign(form.segments[0]!, patch);
      return errors(form);
    };
    it('reports malformed and impossible values on the right field', () => {
      expect(bad({ startDate: '12/03/2027' })['segments.0.startDate']).toMatch(/YYYY-MM-DD/);
      expect(bad({ startDate: '' })['segments.0.startDate']).toBeDefined();
      expect(bad({ startDate: '2027-02-30' })['segments.0.startDate']).toMatch(/doesn’t exist/);
      expect(bad({ startTime: '25:00' })['segments.0.startTime']).toMatch(/doesn’t exist/);
      expect(bad({ startTime: '10:75' })['segments.0.startTime']).toMatch(/doesn’t exist/);
      expect(bad({ startTime: '2pm' })['segments.0.startTime']).toMatch(/24-hour/);
      expect(bad({ startTime: '' })['segments.0.startTime']).toBeDefined();
    });
    it('rejects unknown zones and abbreviations', () => {
      expect(bad({ startTz: 'EST' })['segments.0.startTz']).toBeDefined();
      expect(bad({ endTz: 'Mars/Olympus' })['segments.0.endTz']).toBeDefined();
    });
    it('keys errors by segment index', () => {
      const form = flightForm();
      form.segments.push({ ...form.segments[0]!, startTime: 'nope' });
      expect(Object.keys(errors(form))).toEqual(['segments.1.startTime']);
    });
    it('requires at least one segment', () => {
      const form = flightForm();
      form.segments = [];
      expect(errors(form).segments).toBeDefined();
    });
  });

  describe('daylight saving warnings', () => {
    it('warns when a time falls in the skipped hour and saves the shifted time', () => {
      const form = flightForm();
      Object.assign(form.segments[0]!, {
        startDate: '2027-03-14',
        startTime: '02:30',
        endDate: '2027-03-15',
        endTime: '10:00',
      });
      const { input, warnings } = ok(form);
      expect(input.segments[0]?.startAtUtc).toBe('2027-03-14T07:30:00Z'); // 03:30 EDT
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toMatch(/doesn’t exist.*saved as 03:30/);
    });
    it('warns when a time happens twice and uses the first', () => {
      const form = flightForm();
      Object.assign(form.segments[0]!, {
        startDate: '2027-11-07',
        startTime: '01:30',
        endDate: '2027-11-08',
        endTime: '10:00',
      });
      const { input, warnings } = ok(form);
      expect(input.segments[0]?.startAtUtc).toBe('2027-11-07T05:30:00Z'); // EDT, the first 01:30
      expect(warnings[0]).toMatch(/happens twice.*EDT/);
    });
    it('does not warn for ordinary times', () => {
      expect(ok(flightForm()).warnings).toEqual([]);
    });
  });
});

describe('normalizers and url check', () => {
  it('pads loose dates and times, leaves other text alone', () => {
    expect(normalizeDate('2027-3-5')).toBe('2027-03-05');
    expect(normalizeDate(' 2027-03-05 ')).toBe('2027-03-05');
    expect(normalizeDate('March 5')).toBe('March 5');
    expect(normalizeTime('9:30')).toBe('09:30');
    expect(normalizeTime('14:30')).toBe('14:30');
    expect(normalizeTime('930')).toBe('930');
  });
  it('only web links count', () => {
    expect(isWebUrl('https://example.com')).toBe(true);
    expect(isWebUrl('mailto:a@b.c')).toBe(false);
    expect(isWebUrl('wayfold://trip/1')).toBe(false);
  });
});

describe('suggestions', () => {
  const ctx = async () => {
    const t = createTestCtx();
    const trip = await createTrip(t.ctx, {
      title: 'T',
      startDate: '2027-03-12',
      endDate: '2027-03-17',
      homeTimezone: 'America/New_York',
    });
    return { ...t, trip };
  };

  it('suggests where you probably are: the zone of the latest segment', async () => {
    const t = await ctx();
    expect(suggestTimezone([], 'America/New_York')).toBe('America/New_York');
    await createBooking(t.ctx, t.trip.id, ok(flightForm()).input);
    const detail = (await getTripDetail(t.ctx, t.trip.id))!;
    expect(suggestTimezone(detail.items, 'America/New_York')).toBe('Asia/Tokyo');
  });

  it('ignores cancelled bookings when suggesting a zone', async () => {
    const t = await ctx();
    await createBooking(t.ctx, t.trip.id, { ...ok(flightForm()).input, status: 'CANCELLED' });
    const detail = (await getTripDetail(t.ctx, t.trip.id))!;
    expect(suggestTimezone(detail.items, 'America/New_York')).toBe('America/New_York');
  });

  it('suggests the trip’s most-used currency, defaulting to USD', async () => {
    const t = await ctx();
    expect(suggestCurrency([])).toBe('USD');
    for (const [amount, currency] of [
      ['100', 'JPY'],
      ['200', 'JPY'],
      ['5', 'EUR'],
    ] as const) {
      await createBooking(
        t.ctx,
        t.trip.id,
        ok(flightForm({ costAmount: amount, costCurrency: currency })).input,
      );
    }
    const items: BookingWithSegments[] = (await getTripDetail(t.ctx, t.trip.id))!.items;
    expect(suggestCurrency(items)).toBe('JPY');
  });
});

describe('round trip through the database and back into the form', () => {
  async function roundTrip(form: BookingFormState) {
    const t = createTestCtx();
    const trip = await createTrip(t.ctx, {
      title: 'T',
      startDate: '2027-03-12',
      endDate: '2027-03-17',
      homeTimezone: 'America/New_York',
    });
    const saved = await createBooking(t.ctx, trip.id, ok(form).input);
    const detail = (await getBooking(t.ctx, saved.id))!;
    const reloaded = bookingToForm(detail);
    return { reloaded, again: ok(reloaded).input, detail };
  }

  it('a flight comes back exactly as typed, and re-saving is a no-op', async () => {
    const form = flightForm({
      costAmount: '1284.50',
      originalUrl: 'https://example.com/manage/ABC123',
      confirmationNumber: 'ABC123',
    });
    const { reloaded, again, detail } = await roundTrip(form);
    expect(reloaded).toMatchObject({
      type: 'TRANSPORT',
      title: 'JFK → HND',
      costAmount: '1284.50',
      costCurrency: 'USD',
      originalUrl: 'https://example.com/manage/ABC123',
    });
    expect(reloaded.segments[0]).toMatchObject({
      startDate: '2027-03-12',
      startTime: '11:00',
      startTz: 'America/New_York',
      endDate: '2027-03-13',
      endTime: '14:30',
      endTz: 'Asia/Tokyo',
      startLocationName: 'JFK',
      endLocationName: 'HND',
      flightNumber: 'EX 101',
      seat: '34A',
    });
    expect(again.segments[0]).toMatchObject({
      id: detail.segments[0]!.id,
      startAtUtc: '2027-03-12T16:00:00Z',
      endAtUtc: '2027-03-13T05:30:00Z',
    });
  });

  it('a JPY hotel stay round-trips with no decimals', async () => {
    const form = emptyBookingForm('ACCOMMODATION', { ...defaults, currency: 'JPY' });
    Object.assign(form, { title: 'Hotel', costAmount: '84000' });
    Object.assign(form.segments[0]!, {
      startDate: '2027-03-13',
      startTime: '15:00',
      startTz: 'Asia/Tokyo',
      endDate: '2027-03-17',
      endTime: '11:00',
      startLocationName: 'Example Hotel',
      room: '1204',
    });
    const { reloaded, again } = await roundTrip(form);
    expect(reloaded.costAmount).toBe('84000');
    expect(reloaded.costCurrency).toBe('JPY');
    expect(reloaded.segments[0]).toMatchObject({
      startLocationName: 'Example Hotel',
      room: '1204',
    });
    expect(again.costAmount).toBe(84000);
    expect(again.segments[0]).toMatchObject({
      startAtUtc: '2027-03-13T06:00:00Z',
      endAtUtc: '2027-03-17T02:00:00Z',
    });
  });

  it('a DST-gap time is stored shifted and stays put on re-save (no further drift)', async () => {
    const form = flightForm();
    Object.assign(form.segments[0]!, {
      startDate: '2027-03-14',
      startTime: '02:30',
      endDate: '2027-03-15',
      endTime: '10:00',
    });
    const { reloaded, again } = await roundTrip(form);
    expect(reloaded.segments[0]?.startTime).toBe('03:30'); // what was actually saved
    expect(again.segments[0]?.startAtUtc).toBe('2027-03-14T07:30:00Z');
    expect(formToBookingInput(reloaded)).toMatchObject({ ok: true, warnings: [] });
  });

  it('an optional-end activity round-trips as a zero-length event', async () => {
    const form = emptyBookingForm('ACTIVITY', defaults);
    Object.assign(form, { title: 'Walk' });
    Object.assign(form.segments[0]!, {
      startDate: '2027-03-14',
      startTime: '10:00',
      startTz: 'Asia/Tokyo',
      endDate: '',
      endTime: '',
    });
    const { reloaded, again } = await roundTrip(form);
    expect(reloaded.segments[0]).toMatchObject({ endDate: '2027-03-14', endTime: '10:00' });
    expect(again.segments[0]?.endAtUtc).toBe(again.segments[0]?.startAtUtc);
  });
});
