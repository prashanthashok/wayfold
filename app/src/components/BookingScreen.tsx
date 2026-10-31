import { Stack, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';

import { appCtx } from '@/db/context';
import { createBooking, deleteBooking, getBooking, getTripDetail, updateBooking } from '@/db/repo';
import {
  bookingToForm,
  emptyBookingForm,
  formToBookingInput,
  suggestCurrency,
  suggestTimezone,
  type BookingFormState,
} from '@/features/booking-form';
import { colors, spacing } from '@/theme';

import { BookingFormFields } from './BookingFormFields';
import { Button, Notice, Screen } from './ui';

interface Props {
  tripId: string;
  /** Present when editing an existing booking. */
  bookingId?: string;
}

type Loaded = { form: BookingFormState } | { missing: string };

async function loadInitialForm(tripId: string, bookingId?: string): Promise<Loaded> {
  const detail = await getTripDetail(appCtx, tripId);
  if (!detail) return { missing: 'This trip no longer exists.' };
  if (bookingId) {
    const booking = await getBooking(appCtx, bookingId);
    if (!booking) return { missing: 'This booking no longer exists.' };
    return { form: bookingToForm(booking) };
  }
  return {
    form: emptyBookingForm('TRANSPORT', {
      date: detail.trip.startDate,
      timezone: suggestTimezone(detail.items, detail.trip.homeTimezone),
      currency: suggestCurrency(detail.items),
    }),
  };
}

/** Add or edit a booking. */
export function BookingScreen({ tripId, bookingId }: Props) {
  const editing = bookingId !== undefined;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [form, setForm] = useState<BookingFormState | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadInitialForm(tripId, bookingId).then(
      (result) => {
        if (cancelled) return;
        setLoaded(result);
        if ('form' in result) setForm(result.form);
      },
      (e: unknown) =>
        !cancelled && setLoaded({ missing: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      cancelled = true;
    };
  }, [tripId, bookingId]);

  const title = editing ? 'Edit booking' : 'New booking';

  if (!loaded) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title }} />
        <ActivityIndicator />
      </View>
    );
  }
  if ('missing' in loaded || !form) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title }} />
        <Text style={styles.message}>{'missing' in loaded ? loaded.missing : ''}</Text>
        <Button title="Go back" variant="secondary" onPress={() => router.back()} />
      </View>
    );
  }

  async function persist(current: BookingFormState) {
    const result = formToBookingInput(current);
    if (!result.ok) return;
    setSaving(true);
    try {
      if (bookingId) await updateBooking(appCtx, bookingId, result.input);
      else await createBooking(appCtx, tripId, result.input);
      router.back();
    } catch (e) {
      Alert.alert('Couldn’t save the booking', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function save() {
    if (!form) return;
    const result = formToBookingInput(form);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    if (result.warnings.length > 0) {
      Alert.alert('Check these times', result.warnings.join('\n\n'), [
        { text: 'Edit', style: 'cancel' },
        { text: 'Save anyway', onPress: () => void persist(form) },
      ]);
      return;
    }
    void persist(form);
  }

  function confirmDelete() {
    if (!bookingId) return;
    Alert.alert('Delete this booking?', 'It will be removed from the trip.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteBooking(appCtx, bookingId).then(
            () => router.back(),
            (e: unknown) =>
              Alert.alert('Couldn’t delete', e instanceof Error ? e.message : String(e)),
          );
        },
      },
    ]);
  }

  const errorCount = Object.keys(errors).length;

  return (
    <Screen>
      <Stack.Screen options={{ title }} />
      <BookingFormFields form={form} onChange={setForm} errors={errors} />
      {errorCount > 0 && (
        <Notice tone="error">
          {errorCount === 1
            ? 'Fix 1 field above to save.'
            : `Fix ${errorCount} fields above to save.`}
        </Notice>
      )}
      <Button
        title={saving ? 'Saving…' : editing ? 'Save changes' : 'Add booking'}
        onPress={save}
        disabled={saving}
      />
      {editing && <Button title="Delete booking" variant="danger" onPress={confirmDelete} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  message: { fontSize: 16, color: colors.text, textAlign: 'center' },
});
