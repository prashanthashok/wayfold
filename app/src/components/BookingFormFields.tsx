import { StyleSheet, Text, View } from 'react-native';
import type { BookingStatus, BookingType } from '@wayfold/shared';

import {
  DETAIL_LABELS,
  SEGMENT_LAYOUT,
  emptySegmentForm,
  type BookingFormState,
  type SegmentFormState,
} from '@/features/booking-form';
import { colors, spacing } from '@/theme';

import { TimezoneField } from './TimezoneField';
import { Button, Chip, ChipRow, Field, SectionTitle, SegmentedControl } from './ui';

const TYPES: { value: BookingType; label: string }[] = [
  { value: 'TRANSPORT', label: 'Transport' },
  { value: 'ACCOMMODATION', label: 'Stay' },
  { value: 'ACTIVITY', label: 'Activity' },
];

const STATUSES: { value: BookingStatus; label: string }[] = [
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

interface Props {
  form: BookingFormState;
  onChange: (form: BookingFormState) => void;
  errors: Record<string, string>;
}

/** The booking form body. Which fields appear depends on the booking type. */
export function BookingFormFields({ form, onChange, errors }: Props) {
  const layout = SEGMENT_LAYOUT[form.type];
  const set = (patch: Partial<BookingFormState>) => onChange({ ...form, ...patch });
  const setSegment = (index: number, patch: Partial<SegmentFormState>) =>
    set({ segments: form.segments.map((s, i) => (i === index ? { ...s, ...patch } : s)) });

  function addSegment() {
    const last = form.segments[form.segments.length - 1];
    // Continue from where the previous leg ended.
    const next = emptySegmentForm(last?.endDate || last?.startDate || '', last?.endTz || '');
    set({ segments: [...form.segments, next] });
  }

  return (
    <View style={styles.stack}>
      <SegmentedControl options={TYPES} value={form.type} onChange={(type) => set({ type })} />

      <Field
        label="Title"
        value={form.title}
        onChangeText={(title) => set({ title })}
        placeholder={
          form.type === 'TRANSPORT'
            ? 'JFK → HND'
            : form.type === 'ACCOMMODATION'
              ? 'Hotel name'
              : 'Food tour'
        }
        error={errors.title}
        autoCapitalize="sentences"
      />
      <Field
        label="Provider"
        value={form.provider}
        onChangeText={(provider) => set({ provider })}
        placeholder={form.type === 'ACCOMMODATION' ? 'Airbnb, Booking.com…' : 'United, Trainline…'}
      />
      <Field
        label="Confirmation number"
        value={form.confirmationNumber}
        onChangeText={(confirmationNumber) => set({ confirmationNumber })}
        autoCapitalize="characters"
      />
      <Field
        label="Original booking link"
        value={form.originalUrl}
        onChangeText={(originalUrl) => set({ originalUrl })}
        placeholder="https://"
        autoCapitalize="none"
        keyboardType="url"
        error={errors.originalUrl}
        hint="Opens the booking on the provider’s site."
      />

      <View style={styles.row}>
        <Field
          containerStyle={styles.amount}
          label="Cost"
          value={form.costAmount}
          onChangeText={(costAmount) => set({ costAmount })}
          placeholder="0.00"
          keyboardType="decimal-pad"
          error={errors.costAmount}
        />
        <Field
          containerStyle={styles.currency}
          label="Currency"
          value={form.costCurrency}
          onChangeText={(costCurrency) => set({ costCurrency: costCurrency.toUpperCase() })}
          placeholder="USD"
          autoCapitalize="characters"
          maxLength={3}
          error={errors.costCurrency}
        />
      </View>

      <SectionTitle>Status</SectionTitle>
      <ChipRow>
        {STATUSES.map((s) => (
          <Chip
            key={s.value}
            label={s.label}
            selected={form.status === s.value}
            onPress={() => set({ status: s.value })}
          />
        ))}
      </ChipRow>

      {form.segments.map((s, i) => {
        const key = (field: string) => `segments.${i}.${field}`;
        return (
          <View key={s.id ?? `new-${i}`} style={styles.stack}>
            <View style={styles.segmentHeader}>
              <SectionTitle>
                {form.segments.length > 1 ? `Segment ${i + 1}` : 'When & where'}
              </SectionTitle>
              {form.segments.length > 1 && (
                <Button
                  title="Remove"
                  variant="link"
                  onPress={() => set({ segments: form.segments.filter((_, j) => j !== i) })}
                />
              )}
            </View>

            <Text style={styles.subhead}>{layout.startLabel}</Text>
            <View style={styles.row}>
              <Field
                containerStyle={styles.date}
                label="Date"
                value={s.startDate}
                onChangeText={(startDate) => setSegment(i, { startDate })}
                placeholder="YYYY-MM-DD"
                keyboardType="numbers-and-punctuation"
                error={errors[key('startDate')]}
              />
              <Field
                containerStyle={styles.time}
                label="Time"
                value={s.startTime}
                onChangeText={(startTime) => setSegment(i, { startTime })}
                placeholder="14:30"
                keyboardType="numbers-and-punctuation"
                error={errors[key('startTime')]}
              />
            </View>
            <TimezoneField
              label={layout.singleTimezone ? 'Timezone' : `${layout.startLabel} timezone`}
              value={s.startTz}
              onChange={(startTz) => setSegment(i, { startTz })}
              error={errors[key('startTz')]}
            />

            <Text style={styles.subhead}>
              {layout.endLabel}
              {layout.endOptional ? ' (optional)' : ''}
            </Text>
            <View style={styles.row}>
              <Field
                containerStyle={styles.date}
                label="Date"
                value={s.endDate}
                onChangeText={(endDate) => setSegment(i, { endDate })}
                placeholder="YYYY-MM-DD"
                keyboardType="numbers-and-punctuation"
                error={errors[key('endDate')]}
              />
              <Field
                containerStyle={styles.time}
                label="Time"
                value={s.endTime}
                onChangeText={(endTime) => setSegment(i, { endTime })}
                placeholder="16:00"
                keyboardType="numbers-and-punctuation"
                error={errors[key('endTime')]}
              />
            </View>
            {!layout.singleTimezone && (
              <TimezoneField
                label={`${layout.endLabel} timezone`}
                value={s.endTz}
                onChange={(endTz) => setSegment(i, { endTz })}
                error={errors[key('endTz')]}
              />
            )}

            <Field
              label={layout.startLocationLabel}
              value={s.startLocationName}
              onChangeText={(startLocationName) => setSegment(i, { startLocationName })}
              placeholder={form.type === 'TRANSPORT' ? 'JFK Airport' : 'Name'}
            />
            {layout.singleLocation && (
              <Field
                label="Address"
                value={s.startLocationAddress}
                onChangeText={(startLocationAddress) => setSegment(i, { startLocationAddress })}
              />
            )}
            {!layout.singleLocation && (
              <Field
                label={layout.endLocationLabel}
                value={s.endLocationName}
                onChangeText={(endLocationName) => setSegment(i, { endLocationName })}
                placeholder="Haneda Airport"
              />
            )}

            {layout.details.map((field) => (
              <Field
                key={field}
                label={DETAIL_LABELS[field]}
                value={s[field]}
                onChangeText={(text) => setSegment(i, { [field]: text })}
                autoCapitalize={field === 'meetingPoint' ? 'sentences' : 'characters'}
              />
            ))}
          </View>
        );
      })}

      {errors.segments && <Text style={styles.error}>{errors.segments}</Text>}
      {form.type === 'TRANSPORT' && (
        <Button
          title="Add another leg (e.g. return flight)"
          variant="secondary"
          onPress={addSegment}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md },
  amount: { flex: 2 },
  currency: { flex: 1 },
  date: { flex: 3 },
  time: { flex: 2 },
  segmentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  subhead: { fontSize: 15, fontWeight: '600', color: colors.text, marginTop: spacing.xs },
  error: { fontSize: 12, color: colors.danger },
});
