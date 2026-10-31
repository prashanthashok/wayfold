import type { BookingStatus } from './enums';

// Money is integer minor units plus an ISO 4217 code, per currency. Never assume 100: JPY has no
// minor unit (¥84,000 is 84000) and KWD has three decimals. Currencies are never converted.

/** Number of decimal places the currency uses (USD 2, JPY 0, KWD 3). */
export function minorUnitExponent(currency: string): number {
  try {
    return (
      new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions()
        .maximumFractionDigits ?? 2
    );
  } catch {
    return 2;
  }
}

export type ParsedMoney = { ok: true; minor: number } | { ok: false; error: string };

/**
 * Typed amount → integer minor units, using string arithmetic (no floating-point multiply, so
 * "19.99" is exactly 1999). Accepts "1284", "1284.5", "1,284.50". Rejects more decimal places
 * than the currency has, negatives and anything that isn't a plain number.
 */
export function parseMoney(input: string, currency: string): ParsedMoney {
  const text = input.trim();
  const exponent = minorUnitExponent(currency);
  const grouped = /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(text);
  if (!grouped && !/^\d+(\.\d+)?$/.test(text)) {
    return { ok: false, error: 'Enter an amount like 1284.50' };
  }
  const [whole = '', fraction = ''] = text.replace(/,/g, '').split('.');
  if (fraction.length > exponent) {
    return {
      ok: false,
      error:
        exponent === 0
          ? `${currency} has no decimal places`
          : `${currency} allows at most ${exponent} decimal places`,
    };
  }
  const minor = Number(whole + fraction.padEnd(exponent, '0'));
  if (!Number.isSafeInteger(minor)) return { ok: false, error: 'Amount is too large' };
  return { ok: true, minor };
}

/** Minor units → the plain text a form field edits: (128450, USD) → "1284.50", (84000, JPY) → "84000". */
export function formatMoneyInput(minor: number, currency: string): string {
  const exponent = minorUnitExponent(currency);
  if (exponent === 0) return String(minor);
  const digits = String(minor).padStart(exponent + 1, '0');
  return `${digits.slice(0, -exponent)}.${digits.slice(-exponent)}`;
}

/** Display string in the device's locale by default: (128450, USD) → "$1,284.50". */
export function formatMoney(minor: number, currency: string, locale?: string): string {
  const exponent = minorUnitExponent(currency);
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(
    minor / 10 ** exponent,
  );
}

export interface CurrencyTotal {
  currency: string;
  /** Sum in minor units of that currency. */
  minor: number;
  /** How many bookings contributed. */
  count: number;
}

interface Costed {
  costAmount: number | null;
  costCurrency: string | null;
  status: BookingStatus;
  deletedAt: string | null;
}

/**
 * Totals per currency, sorted by code. Skips bookings with no cost, soft-deleted bookings and
 * CANCELLED ones (you aren't paying for those). PENDING bookings are included.
 */
export function totalsByCurrency(bookings: readonly Costed[]): CurrencyTotal[] {
  const byCurrency = new Map<string, CurrencyTotal>();
  for (const b of bookings) {
    if (b.deletedAt !== null || b.status === 'CANCELLED') continue;
    if (b.costAmount === null || b.costCurrency === null) continue;
    const entry = byCurrency.get(b.costCurrency) ?? {
      currency: b.costCurrency,
      minor: 0,
      count: 0,
    };
    entry.minor += b.costAmount;
    entry.count += 1;
    byCurrency.set(b.costCurrency, entry);
  }
  return [...byCurrency.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}

/**
 * Applies the optional "display currency": that currency's total is shown first and the rest
 * are listed separately. Nothing is converted. A display currency with no bookings yields
 * `primary: null` and every total in `others`.
 */
export function splitByDisplayCurrency(
  totals: readonly CurrencyTotal[],
  displayCurrency: string | null,
): { primary: CurrencyTotal | null; others: CurrencyTotal[] } {
  const primary = totals.find((t) => t.currency === displayCurrency) ?? null;
  return { primary, others: totals.filter((t) => t !== primary) };
}
