// IANA timezones offered by the picker. A curated list of common travel zones comes first; if the
// engine can enumerate every zone (`Intl.supportedValuesOf`), the rest follow. Any valid IANA
// name can also be typed by hand.

const COMMON = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'America/Toronto',
  'America/Vancouver',
  'America/Halifax',
  'America/Mexico_City',
  'America/Bogota',
  'America/Lima',
  'America/Santiago',
  'America/Sao_Paulo',
  'America/Argentina/Buenos_Aires',
  'Europe/London',
  'Europe/Dublin',
  'Europe/Lisbon',
  'Europe/Madrid',
  'Europe/Paris',
  'Europe/Amsterdam',
  'Europe/Brussels',
  'Europe/Berlin',
  'Europe/Zurich',
  'Europe/Rome',
  'Europe/Vienna',
  'Europe/Prague',
  'Europe/Warsaw',
  'Europe/Stockholm',
  'Europe/Oslo',
  'Europe/Copenhagen',
  'Europe/Helsinki',
  'Europe/Athens',
  'Europe/Istanbul',
  'Europe/Moscow',
  'Africa/Casablanca',
  'Africa/Lagos',
  'Africa/Cairo',
  'Africa/Nairobi',
  'Africa/Johannesburg',
  'Asia/Dubai',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Kathmandu',
  'Asia/Dhaka',
  'Asia/Bangkok',
  'Asia/Jakarta',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Asia/Shanghai',
  'Asia/Taipei',
  'Asia/Manila',
  'Asia/Seoul',
  'Asia/Tokyo',
  'Australia/Perth',
  'Australia/Brisbane',
  'Australia/Sydney',
  'Australia/Melbourne',
  'Pacific/Fiji',
  'Pacific/Auckland',
];

function allZones(): string[] {
  try {
    const supported = Intl.supportedValuesOf('timeZone');
    return [...new Set([...COMMON, ...supported])];
  } catch {
    return COMMON;
  }
}

let cached: string[] | null = null;

export function knownTimezones(): string[] {
  cached ??= allZones();
  return cached;
}

/** The device's own timezone, or UTC if the engine can't say. */
export function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Zones matching what was typed ("tok" finds Asia/Tokyo; "new york" finds America/New_York). */
export function searchTimezones(query: string, limit = 6): string[] {
  const q = query
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '_');
  if (!q) return knownTimezones().slice(0, limit);
  const zones = knownTimezones();
  const starts = zones.filter((z) =>
    z
      .toLowerCase()
      .split('/')
      .some((part) => part.startsWith(q)),
  );
  const contains = zones.filter((z) => !starts.includes(z) && z.toLowerCase().includes(q));
  return [...starts, ...contains].slice(0, limit);
}
