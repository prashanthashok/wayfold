import { Stack, router, useLocalSearchParams } from 'expo-router';
import { formatCalendarDate } from '@wayfold/shared';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { TotalsCard } from '@/components/TotalsCard';
import { TripTimeline } from '@/components/TripTimeline';
import { Button, Notice, Screen, SectionTitle } from '@/components/ui';
import { appCtx } from '@/db/context';
import { getTripDetail } from '@/db/repo';
import { getDisplayCurrency, setDisplayCurrency } from '@/lib/preferences';
import { useFocusLoad } from '@/lib/useFocusLoad';
import { colors, spacing } from '@/theme';

export default function TripDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const load = useCallback(() => getTripDetail(appCtx, id), [id]);
  const { data: detail, error, loading } = useFocusLoad(load);
  const [displayCurrency, setDisplay] = useState<string | null>(() => getDisplayCurrency(id));

  if (loading && !detail) return <ActivityIndicator style={styles.loading} />;

  if (!detail) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Trip' }} />
        <Text style={styles.message}>{error ? error.message : 'This trip no longer exists.'}</Text>
        <Button title="Back to trips" variant="secondary" onPress={() => router.replace('/')} />
      </View>
    );
  }

  const { trip, items, locations } = detail;

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: trip.title,
          headerRight: () => (
            <Button title="Edit" variant="link" onPress={() => router.push(`/trip/${id}/edit`)} />
          ),
        }}
      />
      <View>
        <Text style={styles.dates}>
          {formatCalendarDate(trip.startDate, undefined, { year: true })} –{' '}
          {formatCalendarDate(trip.endDate, undefined, { year: true })}
        </Text>
        <Text style={styles.home}>Home timezone: {trip.homeTimezone.replace(/_/g, ' ')}</Text>
      </View>

      <Button title="Add booking" onPress={() => router.push(`/trip/${id}/booking/new`)} />

      <TotalsCard
        bookings={items.map((i) => i.booking)}
        displayCurrency={displayCurrency}
        onChangeDisplayCurrency={(currency) => {
          setDisplayCurrency(id, currency);
          setDisplay(currency);
        }}
      />

      <SectionTitle>Itinerary</SectionTitle>
      {items.length === 0 && (
        <Notice>No bookings yet. Tap “Add booking” to add a flight, stay or activity.</Notice>
      )}
      <TripTimeline trip={trip} items={items} locations={locations} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: spacing.xl },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
  message: { fontSize: 16, color: colors.text, textAlign: 'center' },
  dates: { fontSize: 16, fontWeight: '600', color: colors.text },
  home: { fontSize: 13, color: colors.muted, marginTop: 2 },
});
