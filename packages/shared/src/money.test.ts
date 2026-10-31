import { describe, expect, it } from 'vitest';

import {
  formatMoney,
  formatMoneyInput,
  minorUnitExponent,
  parseMoney,
  splitByDisplayCurrency,
  totalsByCurrency,
} from './money';

const plain = (s: string) => s.replace(/\s/g, ' ');

describe('minorUnitExponent', () => {
  it.each([
    ['USD', 2],
    ['EUR', 2],
    ['JPY', 0],
    ['KRW', 0],
    ['KWD', 3],
  ])('%s has %i decimal places', (code, exp) => expect(minorUnitExponent(code)).toBe(exp));
});

describe('parseMoney', () => {
  it.each([
    ['1284.50', 'USD', 128450],
    ['1284.5', 'USD', 128450],
    ['1284', 'USD', 128400],
    ['1,284.50', 'USD', 128450],
    ['19.99', 'USD', 1999], // float math would give 1998.9999999999998
    ['0.07', 'USD', 7],
    ['  42  ', 'USD', 4200],
    ['84000', 'JPY', 84000],
    ['84,000', 'JPY', 84000],
    ['1.234', 'KWD', 1234],
    ['0', 'USD', 0],
  ])('%s %s → %i', (text, currency, minor) => {
    expect(parseMoney(text, currency)).toEqual({ ok: true, minor });
  });

  it.each([
    ['12.345', 'USD', 'at most 2 decimal places'],
    ['100.5', 'JPY', 'no decimal places'],
    ['abc', 'USD', 'Enter an amount'],
    ['', 'USD', 'Enter an amount'],
    ['-5', 'USD', 'Enter an amount'],
    ['1,23', 'USD', 'Enter an amount'],
    ['1.284,50', 'USD', 'Enter an amount'],
    ['$5', 'USD', 'Enter an amount'],
    ['9999999999999999', 'USD', 'too large'],
  ])('rejects %j (%s)', (text, currency, message) => {
    const result = parseMoney(text, currency);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(message);
  });
});

describe('formatMoneyInput / formatMoney', () => {
  it('round-trips through the form field', () => {
    for (const [minor, currency] of [
      [128450, 'USD'],
      [7, 'USD'],
      [0, 'USD'],
      [84000, 'JPY'],
      [1234, 'KWD'],
    ] as const) {
      const text = formatMoneyInput(minor, currency);
      expect(parseMoney(text, currency)).toEqual({ ok: true, minor });
    }
    expect(formatMoneyInput(128450, 'USD')).toBe('1284.50');
    expect(formatMoneyInput(7, 'USD')).toBe('0.07');
    expect(formatMoneyInput(84000, 'JPY')).toBe('84000');
  });

  it('displays JPY without dividing by 100', () => {
    expect(plain(formatMoney(84000, 'JPY', 'en-US'))).toBe('¥84,000');
    expect(plain(formatMoney(128450, 'USD', 'en-US'))).toBe('$1,284.50');
  });
});

describe('totalsByCurrency', () => {
  type Status = 'CONFIRMED' | 'PENDING' | 'CANCELLED';
  const b = (amount: number | null, currency: string | null, status: Status = 'CONFIRMED') => ({
    costAmount: amount,
    costCurrency: currency,
    status,
    deletedAt: null as string | null,
  });

  it('sums per currency and never mixes them', () => {
    expect(totalsByCurrency([b(128450, 'USD'), b(84000, 'JPY'), b(1550, 'USD')])).toEqual([
      { currency: 'JPY', minor: 84000, count: 1 },
      { currency: 'USD', minor: 130000, count: 2 },
    ]);
  });

  it('ignores free items, cancelled bookings and soft-deleted bookings; keeps pending', () => {
    const deleted = { ...b(999, 'USD'), deletedAt: '2027-01-01T00:00:00.000Z' };
    expect(
      totalsByCurrency([
        b(null, null),
        b(5000, 'USD', 'CANCELLED'),
        deleted,
        b(2500, 'USD', 'PENDING'),
      ]),
    ).toEqual([{ currency: 'USD', minor: 2500, count: 1 }]);
  });

  it('is empty when nothing costs anything', () => {
    expect(totalsByCurrency([])).toEqual([]);
    expect(totalsByCurrency([b(null, null)])).toEqual([]);
  });
});

describe('splitByDisplayCurrency', () => {
  const totals = [
    { currency: 'JPY', minor: 84000, count: 1 },
    { currency: 'USD', minor: 128450, count: 1 },
  ];
  it('puts the chosen currency first and keeps the rest separate', () => {
    expect(splitByDisplayCurrency(totals, 'USD')).toEqual({
      primary: totals[1],
      others: [totals[0]],
    });
  });
  it('treats no choice, or a currency with no bookings, as "show everything separately"', () => {
    expect(splitByDisplayCurrency(totals, null)).toEqual({ primary: null, others: totals });
    expect(splitByDisplayCurrency(totals, 'EUR')).toEqual({ primary: null, others: totals });
  });
});
