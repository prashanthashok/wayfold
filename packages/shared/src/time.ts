// Time helpers. Rule: instants are UTC (`2027-03-12T16:00:00Z`) plus an IANA timezone per
// segment end. Everything here converts between that and local wall-clock time using only
// `Intl`, so it behaves the same in Node (tests) and Hermes (the app).

const formatters = new Map<string, Intl.DateTimeFormat>();

function wallClockFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function wallClockAt(utcMs: number, timeZone: string): WallClock {
  const parts = wallClockFormatter(timeZone).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    // Some engines report midnight as "24" even with h23.
    hour: get('hour') % 24,
    minute: get('minute'),
    second: get('second'),
  };
}

/** Offset of `timeZone` from UTC at an instant, in minutes (Tokyo = 540, New York in winter = -300). */
export function tzOffsetMinutes(utcMs: number, timeZone: string): number {
  const w = wallClockAt(utcMs, timeZone);
  const asIfUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return Math.round((asIfUtc - Math.floor(utcMs / 1000) * 1000) / 60_000);
}

/** The local calendar date and time at a UTC instant, in an IANA zone. */
export function utcToZoned(utc: string, timeZone: string): { date: string; time: string } {
  const w = wallClockAt(Date.parse(utc), timeZone);
  return {
    date: `${pad(w.year, 4)}-${pad(w.month)}-${pad(w.day)}`,
    time: `${pad(w.hour)}:${pad(w.minute)}`,
  };
}

export type ZonedResolution = 'exact' | 'ambiguous' | 'gap';

export interface ZonedToUtc {
  /** UTC instant, whole seconds, e.g. `2027-03-12T16:00:00Z`. */
  utc: string;
  /**
   * - `exact`: the wall-clock time happens once.
   * - `ambiguous`: clocks went back, so it happens twice; the earlier instant is used.
   * - `gap`: clocks skipped forward and the time never happens; the offset from before the jump
   *   is used, which lands the time forward by the length of the gap (02:30 becomes 03:30).
   * Same rules as Temporal's "compatible" disambiguation.
   */
  resolution: ZonedResolution;
}

const DAY_MS = 86_400_000;

function toUtcString(ms: number): string {
  return new Date(ms).toISOString().replace('.000Z', 'Z');
}

/**
 * Local wall-clock date (`YYYY-MM-DD`) and time (`HH:mm`) in an IANA zone → UTC instant.
 * Throws RangeError for an unknown zone and Error for a malformed date or time.
 */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): ZonedToUtc {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t) throw new Error(`Invalid local date/time: ${date} ${time}`);
  const [year, month, day, hour, minute] = [d[1], d[2], d[3], t[1], t[2]].map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const check = new Date(wall);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day ||
    hour > 23 ||
    minute > 59
  ) {
    throw new Error(`Invalid local date/time: ${date} ${time}`);
  }

  // Candidate offsets: the ones in force a day before and a day after (a zone changes offset at
  // most once in a 48h window). A candidate is real if it round-trips to the same wall time.
  const offsets = new Set([
    tzOffsetMinutes(wall - DAY_MS, timeZone),
    tzOffsetMinutes(wall + DAY_MS, timeZone),
  ]);
  const valid = [...offsets]
    .map((offset) => wall - offset * 60_000)
    .filter((candidate) => {
      const w = wallClockAt(candidate, timeZone);
      return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute) === wall && w.second === 0;
    })
    .sort((a, b) => a - b);

  if (valid.length === 1) return { utc: toUtcString(valid[0]!), resolution: 'exact' };
  if (valid.length > 1) return { utc: toUtcString(valid[0]!), resolution: 'ambiguous' };

  const offsetBefore = tzOffsetMinutes(wall - DAY_MS, timeZone);
  return { utc: toUtcString(wall - offsetBefore * 60_000), resolution: 'gap' };
}

/** Short zone label at an instant: "EST", "EDT", or "GMT+9" where English has no abbreviation. */
export function tzAbbreviation(utc: string, timeZone: string, locale = 'en-US'): string {
  const part = new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: 'short' })
    .formatToParts(new Date(utc))
    .find((p) => p.type === 'timeZoneName');
  return part?.value ?? timeZone;
}

/** Local clock time at an instant, in the device's style by default ("2:30 PM" or "14:30"). */
export function formatLocalTime(utc: string, timeZone: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(utc));
}

/** "11:00 AM EST" — the time in the zone it happens in, with the zone label. */
export function formatLocalTimeWithZone(utc: string, timeZone: string, locale?: string): string {
  return `${formatLocalTime(utc, timeZone, locale)} ${tzAbbreviation(utc, timeZone, locale ?? 'en-US')}`;
}

/** Calendar-date arithmetic on `YYYY-MM-DD` strings (no timezone involved). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** True for a real `YYYY-MM-DD` calendar date (rejects "2027-02-30" and "2027-2-3"). */
export function isValidCalendarDate(date: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const check = new Date(Date.UTC(y, mo - 1, d));
  return check.getUTCFullYear() === y && check.getUTCMonth() === mo - 1 && check.getUTCDate() === d;
}

/** Heading for a calendar date, e.g. "Fri, Mar 12". Date-only, so no timezone shift. */
export function formatCalendarDate(
  date: string,
  locale?: string,
  options: { year?: boolean } = {},
): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    weekday: options.year ? undefined : 'short',
    month: 'short',
    day: 'numeric',
    year: options.year ? 'numeric' : undefined,
  }).format(new Date(`${date}T00:00:00Z`));
}
