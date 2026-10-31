import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { validateTripForm, type TripFormState } from '@/features/trip-form';
import type { TripInput } from '@/db/repo';
import { spacing } from '@/theme';

import { TimezoneField } from './TimezoneField';
import { Button, Field, Screen } from './ui';

interface Props {
  initial: TripFormState;
  submitLabel: string;
  onSubmit: (input: TripInput) => Promise<void>;
  /** Present when editing: shows a delete button. */
  onDelete?: () => void;
}

export function TripForm({ initial, submitLabel, onSubmit, onDelete }: Props) {
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof TripFormState, string>>>({});
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<TripFormState>) => setForm((f) => ({ ...f, ...patch }));

  async function save() {
    const result = validateTripForm(form);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await onSubmit(result.input);
    } catch (e) {
      Alert.alert('Couldn’t save the trip', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <Field
        label="Trip name"
        value={form.title}
        onChangeText={(title) => set({ title })}
        placeholder="Tokyo"
        error={errors.title}
        autoCapitalize="words"
        autoFocus={!onDelete}
      />
      <View style={styles.row}>
        <Field
          containerStyle={styles.flex}
          label="Starts"
          value={form.startDate}
          onChangeText={(startDate) => set({ startDate })}
          placeholder="YYYY-MM-DD"
          keyboardType="numbers-and-punctuation"
          error={errors.startDate}
        />
        <Field
          containerStyle={styles.flex}
          label="Ends"
          value={form.endDate}
          onChangeText={(endDate) => set({ endDate })}
          placeholder="YYYY-MM-DD"
          keyboardType="numbers-and-punctuation"
          error={errors.endDate}
        />
      </View>
      <TimezoneField
        label="Home timezone"
        value={form.homeTimezone}
        onChange={(homeTimezone) => set({ homeTimezone })}
        error={errors.homeTimezone}
      />
      <Button title={saving ? 'Saving…' : submitLabel} onPress={save} disabled={saving} />
      {onDelete && <Button title="Delete trip" variant="danger" onPress={onDelete} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
});
