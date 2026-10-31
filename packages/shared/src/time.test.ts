import { describe, expect, it } from 'vitest';

import {
  addDays,
  daysBetween,
  formatCalendarDate,
  isValidCalendarDate,
  formatLocalTimeWithZone,
  tzAbbreviation,
  tzOffsetMinutes,
  utcToZoned,
  zonedTimeToUtc,
} from './time';

const NY = 'America/New_York';
const TOKYO = 'Asia/Tokyo';
const SYDNEY = 'Australia/Sydney';

// ICU may put a narrow no-break space before AM/PM; compare with plain spaces.
const plain = (s: string) => s.replace(/\s/g, ' ');

describe('tzOffsetMinutes', () => {
  it.each([
    ['New York in winter', '2027-01-15T12:00:00Z', NY, -300],
    ['New York in summer', '2027-07-15T12:00:00Z', NY, -240],
    ['Tokyo (no DST)', '2027-07-15T12:00:00Z', TOKYO, 540],
    ['Kolkata (half hour)', '2027-07-15T12:00:00Z', 'Asia/Kolkata', 330],
    ['Kathmandu (45 min)', '2027-07-15T12:00:00Z', 'Asia/Kathmandu', 345],
    ['Sydney in January (DST)', '2027-01-15T12:00:00Z', SYDNEY, 660],
    ['Sydney in July', '2027-07-15T12:00:00Z', SYDNEY, 600],
    ['UTC', '2027-07-15T12:00:00Z', 'UTC', 0],
  ])('%s', (_n, utc, tz, expected) => {
    expect(tzOffsetMinutes(Date.parse(utc), tz)).toBe(expected);
  });
});

describe('utcToZoned', () => {
  it('shows the seed flight in each zone', () => {
    expect(utcToZoned('2027-03-12T16:00:00Z', NY)).toEqual({ date: '2027-03-12', time: '11:00' });
    expect(utcToZoned('2027-03-13T05:30:00Z', TOKYO)).toEqual({
      date: '2027-03-13',
      time: '14:30',
    });
  });
  it('can land on a different calendar date than UTC', () => {
    expect(utcToZoned('2027-03-12T16:00:00Z', TOKYO)).toEqual({
      date: '2027-03-13',
      time: '01:00',
    });
    expect(utcToZoned('2027-03-12T16:00:00Z', 'Pacific/Kiritimati')).toEqual({
      date: '2027-03-13',
      time: '06:00',
    });
    expect(utcToZoned('2027-03-12T03:00:00Z', 'Pacific/Pago_Pago')).toEqual({
      date: '2027-03-11',
      time: '16:00',
    });
  });
  it('renders midnight as 00:00, never 24:00', () => {
    expect(utcToZoned('2027-03-13T00:00:00Z', 'UTC')).toEqual({
      date: '2027-03-13',
      time: '00:00',
    });
    expect(utcToZoned('2027-03-13T05:00:00Z', NY)).toEqual({ date: '2027-03-13', time: '00:00' });
  });
});

describe('zonedTimeToUtc', () => {
  it.each([
    ['New York winter (EST)', '2027-03-12', '11:00', NY, '2027-03-12T16:00:00Z'],
    ['New York summer (EDT)', '2027-07-01', '09:00', NY, '2027-07-01T13:00:00Z'],
    ['Tokyo', '2027-03-13', '14:30', TOKYO, '2027-03-13T05:30:00Z'],
    ['Kolkata', '2027-03-13', '10:30', 'Asia/Kolkata', '2027-03-13T05:00:00Z'],
    ['UTC', '2027-03-13', '10:30', 'UTC', '2027-03-13T10:30:00Z'],
  ])('%s', (_n, date, time, tz, utc) => {
    expect(zonedTimeToUtc(date, time, tz)).toEqual({ utc, resolution: 'exact' });
  });

  describe('US spring forward (2027-03-14, 02:00 EST → 03:00 EDT)', () => {
    it('the minute before the jump is EST', () => {
      expect(zonedTimeToUtc('2027-03-14', '01:59', NY)).toEqual({
        utc: '2027-03-14T06:59:00Z',
        resolution: 'exact',
      });
    });
    it('a time inside the skipped hour does not exist and moves forward by the gap', () => {
      // 02:30 EST would be 07:30Z, which is 03:30 EDT.
      expect(zonedTimeToUtc('2027-03-14', '02:30', NY)).toEqual({
        utc: '2027-03-14T07:30:00Z',
        resolution: 'gap',
      });
      expect(utcToZoned('2027-03-14T07:30:00Z', NY).time).toBe('03:30');
    });
    it('the first minute after the jump is EDT', () => {
      expect(zonedTimeToUtc('2027-03-14', '03:00', NY)).toEqual({
        utc: '2027-03-14T07:00:00Z',
        resolution: 'exact',
      });
    });
  });

  describe('US fall back (2027-11-07, 02:00 EDT → 01:00 EST)', () => {
    it('before the repeated hour is EDT', () => {
      expect(zonedTimeToUtc('2027-11-07', '00:59', NY)).toEqual({
        utc: '2027-11-07T04:59:00Z',
        resolution: 'exact',
      });
    });
    it('a time in the repeated hour is ambiguous and takes the earlier (EDT) instant', () => {
      expect(zonedTimeToUtc('2027-11-07', '01:30', NY)).toEqual({
        utc: '2027-11-07T05:30:00Z',
        resolution: 'ambiguous',
      });
      // The later instant, 06:30Z, shows the same wall time.
      expect(utcToZoned('2027-11-07T06:30:00Z', NY).time).toBe('01:30');
    });
    it('after the repeated hour is EST', () => {
      expect(zonedTimeToUtc('2027-11-07', '02:00', NY)).toEqual({
        utc: '2027-11-07T07:00:00Z',
        resolution: 'exact',
      });
    });
  });

  describe('Sydney (southern hemisphere: DST is the other way round)', () => {
    it('fall back 2027-04-04: 02:30 happens twice, earlier (AEDT +11) wins', () => {
      expect(zonedTimeToUtc('2027-04-04', '02:30', SYDNEY)).toEqual({
        utc: '2027-04-03T15:30:00Z',
        resolution: 'ambiguous',
      });
    });
    it('spring forward 2027-10-03: 02:30 does not exist', () => {
      expect(zonedTimeToUtc('2027-10-03', '02:30', SYDNEY)).toEqual({
        utc: '2027-10-02T16:30:00Z',
        resolution: 'gap',
      });
      expect(utcToZoned('2027-10-02T16:30:00Z', SYDNEY).time).toBe('03:30');
    });
  });

  it('round-trips every hour around the transitions in several zones', () => {
    const cases: [string[], string][] = [
      [['2027-03-13', '2027-03-14', '2027-03-15', '2027-11-06', '2027-11-07', '2027-11-08'], NY],
      [['2027-04-03', '2027-04-04', '2027-10-02', '2027-10-03'], SYDNEY],
      [['2027-03-13', '2027-10-31'], 'Europe/London'],
      [['2027-06-15'], 'Asia/Kolkata'],
    ];
    for (const [dates, tz] of cases) {
      for (const date of dates) {
        for (let h = 0; h < 24; h++) {
          for (const m of [0, 30]) {
            const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
            const { utc, resolution } = zonedTimeToUtc(date, time, tz);
            if (resolution === 'exact' || resolution === 'ambiguous') {
              expect(utcToZoned(utc, tz), `${date} ${time} ${tz}`).toEqual({ date, time });
            } else {
              // A skipped time must land strictly later, never earlier.
              const back = utcToZoned(utc, tz);
              expect(`${back.date} ${back.time}` > `${date} ${time}`, `${date} ${time} ${tz}`).toBe(
                true,
              );
            }
          }
        }
      }
    }
  });

  it('rejects malformed or impossible input', () => {
    expect(() => zonedTimeToUtc('2027-02-30', '10:00', NY)).toThrow();
    expect(() => zonedTimeToUtc('2027-03-12', '24:00', NY)).toThrow();
    expect(() => zonedTimeToUtc('2027-03-12', '9:00', NY)).toThrow();
    expect(() => zonedTimeToUtc('2027-3-12', '09:00', NY)).toThrow();
    expect(() => zonedTimeToUtc('2027-03-12', '09:00', 'Mars/Olympus')).toThrow(RangeError);
  });
});

describe('labels', () => {
  it('abbreviates US zones and falls back to GMT offsets elsewhere', () => {
    expect(tzAbbreviation('2027-01-15T12:00:00Z', NY)).toBe('EST');
    expect(tzAbbreviation('2027-07-15T12:00:00Z', NY)).toBe('EDT');
    expect(tzAbbreviation('2027-07-15T12:00:00Z', TOKYO)).toBe('GMT+9');
  });
  it('picks the abbreviation in force at that instant, not today’s', () => {
    expect(tzAbbreviation('2027-03-14T06:59:00Z', NY)).toBe('EST');
    expect(tzAbbreviation('2027-03-14T07:00:00Z', NY)).toBe('EDT');
  });
  it('formats a local time with its zone', () => {
    expect(plain(formatLocalTimeWithZone('2027-03-12T16:00:00Z', NY, 'en-US'))).toBe(
      '11:00 AM EST',
    );
    expect(plain(formatLocalTimeWithZone('2027-03-13T05:30:00Z', TOKYO, 'en-US'))).toBe(
      '2:30 PM GMT+9',
    );
  });
});

describe('calendar dates', () => {
  it('adds days across month, year and leap-day boundaries', () => {
    expect(addDays('2027-03-12', 5)).toBe('2027-03-17');
    expect(addDays('2027-12-31', 1)).toBe('2028-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
    expect(addDays('2027-03-01', -1)).toBe('2027-02-28');
  });
  it('counts calendar days, unaffected by DST', () => {
    expect(daysBetween('2027-03-12', '2027-03-17')).toBe(5);
    expect(daysBetween('2027-03-13', '2027-03-15')).toBe(2);
    expect(daysBetween('2027-03-17', '2027-03-12')).toBe(-5);
  });
  it('formats a heading without shifting the date', () => {
    expect(formatCalendarDate('2027-03-12', 'en-US')).toBe('Fri, Mar 12');
    expect(formatCalendarDate('2027-12-31', 'en-US', { year: true })).toBe('Dec 31, 2027');
  });
  it('validates calendar dates', () => {
    for (const ok of ['2027-03-12', '2028-02-29', '2027-12-31']) {
      expect(isValidCalendarDate(ok), ok).toBe(true);
    }
    for (const bad of [
      '2027-02-29',
      '2027-02-30',
      '2027-13-01',
      '2027-00-10',
      '2027-3-5',
      '',
      'x',
    ]) {
      expect(isValidCalendarDate(bad), bad).toBe(false);
    }
  });
});
