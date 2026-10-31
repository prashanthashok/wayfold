import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { colors, spacing } from '@/theme';

/** Scrolling screen body that keeps inputs visible above the keyboard. */
export function Screen({ children, padded = true }: { children: ReactNode; padded?: boolean }) {
  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={padded ? styles.screenContent : undefined}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

interface FieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string;
  hint?: string;
  containerStyle?: StyleProp<ViewStyle>;
}

export function Field({ label, error, hint, containerStyle, ...input }: FieldProps) {
  return (
    <View style={[styles.field, containerStyle]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.faint}
        autoCorrect={false}
        {...input}
        style={[styles.input, error ? styles.inputError : null]}
        accessibilityLabel={label}
      />
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'link';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({ title, onPress, variant = 'primary', disabled, style }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'danger' && styles.buttonDanger,
        variant === 'link' && styles.buttonLink,
        (pressed || disabled) && styles.buttonDim,
        style,
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          variant === 'primary' && { color: colors.primaryText },
          variant === 'secondary' && { color: colors.text },
          variant === 'danger' && { color: colors.danger },
          variant === 'link' && { color: colors.primary },
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

export function Chip({ label, selected, onPress }: ChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  return <View style={styles.chipRow}>{children}</View>;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segmented} accessibilityRole="tablist">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, selected && styles.segmentSelected]}
          >
            <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Notice({
  children,
  tone = 'warning',
}: {
  children: ReactNode;
  tone?: 'warning' | 'error';
}) {
  return (
    <View style={[styles.notice, tone === 'error' && styles.noticeError]}>
      <Text style={[styles.noticeText, tone === 'error' && { color: colors.danger }]}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  screenContent: { padding: spacing.lg, paddingBottom: spacing.xl * 2, gap: spacing.md },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.md,
  },
  field: { gap: spacing.xs },
  label: { fontSize: 13, fontWeight: '600', color: colors.text },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 16,
    color: colors.text,
  },
  inputError: { borderColor: colors.danger },
  error: { fontSize: 12, color: colors.danger },
  hint: { fontSize: 12, color: colors.muted },
  button: {
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonPrimary: { backgroundColor: colors.primary },
  buttonSecondary: { backgroundColor: colors.chipBg },
  buttonDanger: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.danger },
  buttonLink: { paddingVertical: 6, paddingHorizontal: 0, alignItems: 'flex-start' },
  buttonDim: { opacity: 0.6 },
  buttonText: { fontSize: 16, fontWeight: '600' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: 999,
    backgroundColor: colors.chipBg,
  },
  chipSelected: { backgroundColor: colors.primary },
  chipText: { fontSize: 13, color: colors.text },
  chipTextSelected: { color: colors.primaryText, fontWeight: '600' },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.chipBg,
    borderRadius: 10,
    padding: 3,
  },
  segment: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  segmentSelected: { backgroundColor: colors.surface },
  segmentText: { fontSize: 14, color: colors.muted },
  segmentTextSelected: { color: colors.text, fontWeight: '600' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  notice: { backgroundColor: colors.warningBg, borderRadius: 8, padding: spacing.md },
  noticeError: { backgroundColor: '#fde8ec' },
  noticeText: { fontSize: 13, color: colors.warningText },
});
