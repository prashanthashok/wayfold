import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';

import { db } from '@/db/client';
import { seedSampleTrip } from '@/db/seed';
import { colors } from '@/theme';
import migrations from '../../drizzle/migrations';

export default function RootLayout() {
  const migration = useMigrations(db, migrations);
  const [seedError, setSeedError] = useState<Error | null>(null);
  const [seeded, setSeeded] = useState(!__DEV__);

  useEffect(() => {
    if (!migration.success || seeded) return;
    // Sample trip is for development only; release builds start empty.
    seedSampleTrip(db)
      .then(() => setSeeded(true))
      .catch(setSeedError);
  }, [migration.success, seeded]);

  const error = migration.error ?? seedError;
  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Database error</Text>
        <Text selectable style={styles.errorBody}>
          {error.message}
        </Text>
      </View>
    );
  }
  if (!migration.success || !seeded) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <>
      <Stack
        screenOptions={{
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: colors.background },
        }}
      />
      <StatusBar style="auto" />
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  errorTitle: { fontSize: 18, fontWeight: '600', color: colors.danger },
  errorBody: { fontSize: 13, color: '#444' },
});
