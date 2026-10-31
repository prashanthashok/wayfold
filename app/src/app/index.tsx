import { count, isNull } from 'drizzle-orm';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { db, sqliteVersion } from '@/db/client';
import { bookings, segments, trips } from '@/db/schema';

interface Counts {
  trips: number;
  bookings: number;
  segments: number;
}

// Live (not soft-deleted) rows only.
async function loadCounts(): Promise<Counts> {
  const [t] = await db.select({ n: count() }).from(trips).where(isNull(trips.deletedAt));
  const [b] = await db.select({ n: count() }).from(bookings).where(isNull(bookings.deletedAt));
  const [s] = await db.select({ n: count() }).from(segments).where(isNull(segments.deletedAt));
  return { trips: t?.n ?? 0, bookings: b?.n ?? 0, segments: s?.n ?? 0 };
}

export default function HomeScreen() {
  const [counts, setCounts] = useState<Counts | null>(null);

  useEffect(() => {
    loadCounts().then(setCounts);
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Wayfold</Text>
      <Text style={styles.subtitle}>Your trips will appear here.</Text>
      <Text style={styles.meta}>Local database ready · SQLite {sqliteVersion()}</Text>
      {counts && (
        <Text style={styles.meta}>
          {counts.trips} trips · {counts.bookings} bookings · {counts.segments} segments
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  title: { fontSize: 28, fontWeight: '600' },
  subtitle: { fontSize: 16, color: '#555' },
  meta: { fontSize: 12, color: '#888' },
});
