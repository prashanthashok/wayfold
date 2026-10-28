import { StyleSheet, Text, View } from 'react-native';

import { sqliteVersion } from '@/db/client';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Wayfold</Text>
      <Text style={styles.subtitle}>Your trips will appear here.</Text>
      <Text style={styles.meta}>Local database ready · SQLite {sqliteVersion()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  title: { fontSize: 28, fontWeight: '600' },
  subtitle: { fontSize: 16, color: '#555' },
  meta: { marginTop: 16, fontSize: 12, color: '#888' },
});
