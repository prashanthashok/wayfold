import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { searchTimezones } from '@/lib/timezones';
import { colors, spacing } from '@/theme';

import { Field } from './ui';

interface Props {
  label: string;
  value: string;
  onChange: (timezone: string) => void;
  error?: string;
}

/** Type an IANA zone ("Asia/Tokyo"); matching suggestions appear below while editing. */
export function TimezoneField({ label, value, onChange, error }: Props) {
  const [focused, setFocused] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (blurTimer.current) clearTimeout(blurTimer.current);
    },
    [],
  );
  const suggestions = focused ? searchTimezones(value).filter((z) => z !== value) : [];

  return (
    <View>
      <Field
        label={label}
        value={value}
        onChangeText={onChange}
        autoCapitalize="none"
        placeholder="Asia/Tokyo"
        error={error}
        onFocus={() => {
          if (blurTimer.current) clearTimeout(blurTimer.current);
          setFocused(true);
        }}
        // Delay hiding so a tap on a suggestion lands before the list disappears.
        onBlur={() => {
          blurTimer.current = setTimeout(() => setFocused(false), 200);
        }}
      />
      {suggestions.length > 0 && (
        <View style={styles.list}>
          {suggestions.map((zone) => (
            <Pressable
              key={zone}
              accessibilityRole="button"
              onPress={() => {
                onChange(zone);
                setFocused(false);
              }}
              style={styles.item}
            >
              <Text style={styles.itemText}>{zone.replace(/_/g, ' ')}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    marginTop: spacing.xs,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    overflow: 'hidden',
  },
  item: { paddingVertical: 10, paddingHorizontal: spacing.md },
  itemText: { fontSize: 15, color: colors.text },
});
