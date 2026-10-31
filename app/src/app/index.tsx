import { Stack, router } from 'expo-router';
import { formatCalendarDate } from '@wayfold/shared';
import { useCallback } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Notice } from '@/components/ui';
import { appCtx } from '@/db/context';
import { sqliteVersion } from '@/db/client';
import { listTrips } from '@/db/repo';
import { useFocusLoad } from '@/lib/useFocusLoad';
import { colors, spacing } from '@/theme';

export default function TripsScreen() {
  const load = useCallback(() => listTrips(appCtx), []);
  const { data: trips, error, loading } = useFocusLoad(load);

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Trips',
          headerRight: () => (
            <Button title="New trip" variant="link" onPress={() => router.push('/trip/new')} />
          ),
        }}
      />
      {error && <Notice tone="error">{error.message}</Notice>}
      {loading && !trips ? (
        <ActivityIndicator style={styles.loading} />
      ) : (
        <FlatList
          data={trips ?? []}
          keyExtractor={(trip) => trip.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No trips yet</Text>
              <Text style={styles.emptyBody}>
                Create a trip, then add flights, stays and activities to it.
              </Text>
              <Button title="Create your first trip" onPress={() => router.push('/trip/new')} />
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={item.title}
              onPress={() => router.push(`/trip/${item.id}`)}
            >
              <Card>
                <Text style={styles.tripTitle}>{item.title}</Text>
                <Text style={styles.tripDates}>
                  {formatCalendarDate(item.startDate, undefined, { year: true })} –{' '}
                  {formatCalendarDate(item.endDate, undefined, { year: true })}
                </Text>
              </Card>
            </Pressable>
          )}
          ListFooterComponent={
            __DEV__ ? (
              <Text style={styles.devFooter}>Local database ready · SQLite {sqliteVersion()}</Text>
            ) : undefined
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, gap: spacing.md },
  loading: { marginTop: spacing.xl },
  empty: { alignItems: 'center', gap: spacing.md, paddingTop: spacing.xl * 2 },
  emptyTitle: { fontSize: 20, fontWeight: '600', color: colors.text },
  emptyBody: { fontSize: 15, color: colors.muted, textAlign: 'center' },
  tripTitle: { fontSize: 18, fontWeight: '600', color: colors.text },
  tripDates: { fontSize: 14, color: colors.muted },
  devFooter: { fontSize: 12, color: colors.faint, textAlign: 'center', marginTop: spacing.lg },
});
