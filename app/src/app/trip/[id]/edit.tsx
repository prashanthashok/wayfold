import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';

import { TripForm } from '@/components/TripForm';
import { Button } from '@/components/ui';
import { appCtx } from '@/db/context';
import { deleteTrip, getTrip, updateTrip } from '@/db/repo';
import { useFocusLoad } from '@/lib/useFocusLoad';
import { colors, spacing } from '@/theme';

export default function EditTripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const load = useCallback(() => getTrip(appCtx, id), [id]);
  const { data: trip, loading } = useFocusLoad(load);

  function confirmDelete() {
    Alert.alert('Delete this trip?', 'The trip and all of its bookings will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteTrip(appCtx, id).then(
            () => router.replace('/'),
            (e: unknown) =>
              Alert.alert('Couldn’t delete', e instanceof Error ? e.message : String(e)),
          );
        },
      },
    ]);
  }

  if (loading) return <ActivityIndicator style={styles.loading} />;
  if (!trip) {
    return (
      <View style={styles.center}>
        <Text style={styles.message}>This trip no longer exists.</Text>
        <Button title="Back to trips" variant="secondary" onPress={() => router.replace('/')} />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Edit trip' }} />
      <TripForm
        initial={{
          title: trip.title,
          startDate: trip.startDate,
          endDate: trip.endDate,
          homeTimezone: trip.homeTimezone,
        }}
        submitLabel="Save changes"
        onSubmit={async (input) => {
          await updateTrip(appCtx, id, input);
          router.back();
        }}
        onDelete={confirmDelete}
      />
    </>
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
  message: { fontSize: 16, color: colors.text },
});
