import { describe, expect, it } from 'vitest';

import { validateTripForm, type TripFormState } from './trip-form';

const valid: TripFormState = {
  title: ' Tokyo ',
  startDate: '2027-03-12',
  endDate: '2027-03-17',
  homeTimezone: 'America/New_York',
};

const errorsFor = (patch: Partial<TripFormState>) => {
  const result = validateTripForm({ ...valid, ...patch });
  if (result.ok) throw new Error('expected errors');
  return result.errors;
};

describe('validateTripForm', () => {
  it('accepts a valid trip and trims the title', () => {
    expect(validateTripForm(valid)).toEqual({
      ok: true,
      input: {
        title: 'Tokyo',
        startDate: '2027-03-12',
        endDate: '2027-03-17',
        homeTimezone: 'America/New_York',
      },
    });
  });

  it('pads loose dates', () => {
    const result = validateTripForm({ ...valid, startDate: '2027-3-2', endDate: '2027-3-9' });
    expect(result).toMatchObject({
      ok: true,
      input: { startDate: '2027-03-02', endDate: '2027-03-09' },
    });
  });

  it('allows a one-day trip, including across a leap day', () => {
    expect(validateTripForm({ ...valid, endDate: valid.startDate }).ok).toBe(true);
    expect(validateTripForm({ ...valid, startDate: '2028-02-29', endDate: '2028-02-29' }).ok).toBe(
      true,
    );
  });

  it('rejects a blank name, impossible dates, a reversed range and a bad timezone', () => {
    expect(errorsFor({ title: '  ' }).title).toBeDefined();
    expect(errorsFor({ startDate: '2027-02-30' }).startDate).toBeDefined();
    expect(errorsFor({ startDate: '' }).startDate).toBeDefined();
    expect(errorsFor({ endDate: 'soon' }).endDate).toBeDefined();
    expect(errorsFor({ endDate: '2027-03-11' }).endDate).toMatch(/before it starts/);
    expect(errorsFor({ homeTimezone: 'EST' }).homeTimezone).toBeDefined();
  });

  it('reports every problem at once', () => {
    expect(Object.keys(errorsFor({ title: '', startDate: 'x', homeTimezone: '' })).sort()).toEqual([
      'homeTimezone',
      'startDate',
      'title',
    ]);
  });
});
