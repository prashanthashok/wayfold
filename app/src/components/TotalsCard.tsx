import {
  formatMoney,
  splitByDisplayCurrency,
  totalsByCurrency,
  type Booking,
  type CurrencyTotal,
} from '@wayfold/shared';
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '@/theme';

import { Card, Chip, ChipRow } from './ui';

interface Props {
  bookings: readonly Booking[];
  displayCurrency: string | null;
  onChangeDisplayCurrency: (currency: string | null) => void;
}

/**
 * Trip cost per currency. Nothing is converted: with several currencies you can pick one to show
 * first (the others stay listed separately).
 */
export function TotalsCard({ bookings, displayCurrency, onChangeDisplayCurrency }: Props) {
  const totals = totalsByCurrency(bookings);
  const { primary, others } = splitByDisplayCurrency(totals, displayCurrency);

  return (
    <Card>
      <Text style={styles.title}>Total cost</Text>
      {totals.length === 0 ? (
        <Text style={styles.muted}>No costs yet. Add one to a booking and it shows up here.</Text>
      ) : (
        <>
          {primary && <TotalLine total={primary} big />}
          {others.map((t) => (
            <TotalLine key={t.currency} total={t} big={!primary} />
          ))}
          {totals.length > 1 && (
            <View style={styles.picker}>
              <Text style={styles.muted}>Show first</Text>
              <ChipRow>
                <Chip
                  label="None"
                  selected={displayCurrency === null || primary === null}
                  onPress={() => onChangeDisplayCurrency(null)}
                />
                {totals.map((t) => (
                  <Chip
                    key={t.currency}
                    label={t.currency}
                    selected={primary?.currency === t.currency}
                    onPress={() => onChangeDisplayCurrency(t.currency)}
                  />
                ))}
              </ChipRow>
              <Text style={styles.footnote}>Currencies are never converted or added together.</Text>
            </View>
          )}
        </>
      )}
    </Card>
  );
}

function TotalLine({ total, big }: { total: CurrencyTotal; big?: boolean }) {
  return (
    <View style={styles.line}>
      <Text style={big ? styles.amountBig : styles.amount}>
        {formatMoney(total.minor, total.currency)}
      </Text>
      <Text style={styles.muted}>
        {total.currency} · {total.count} {total.count === 1 ? 'booking' : 'bookings'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 13, fontWeight: '600', color: colors.muted, textTransform: 'uppercase' },
  line: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  amountBig: { fontSize: 24, fontWeight: '700', color: colors.text },
  amount: { fontSize: 17, fontWeight: '600', color: colors.text },
  muted: { fontSize: 13, color: colors.muted },
  footnote: { fontSize: 12, color: colors.faint },
  picker: { gap: spacing.sm, marginTop: spacing.xs },
});
