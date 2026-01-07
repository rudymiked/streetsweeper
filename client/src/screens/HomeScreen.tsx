import React from 'react';
import { View, Text, Button, StyleSheet, TouchableOpacity } from 'react-native';
import { useAppState } from '../state/StateContext';

export default function HomeScreen({ navigation }: any) {
  const { center, setCenter, radiusMiles, setRadiusMiles, streets } = useAppState();

  const completed = streets.filter(s => s.completed).length;
  const pct = Math.round((completed / streets.length) * 100);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Center</Text>
      <Text>{center.name}</Text>
      <View style={styles.row}>
        <Button
          title="Use current location"
          onPress={() => setCenter({ name: 'Current Location', latitude: 0, longitude: 0 })}
        />
        <Button title="Use saved home" onPress={() => setCenter({ name: 'Saved Home', latitude: 0, longitude: 0 })} />
      </View>

      <Text style={styles.title}>Radius: {radiusMiles.toFixed(1)} mi</Text>
      <View style={styles.row}>
        <TouchableOpacity onPress={() => setRadiusMiles(Math.max(0.5, +(radiusMiles - 0.5).toFixed(1)))} style={styles.btn}>
          <Text>-</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setRadiusMiles(Math.min(5, +(radiusMiles + 0.5).toFixed(1)))} style={styles.btn}>
          <Text>+</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.title}>Completion</Text>
      <Text style={styles.large}>{pct}%</Text>
      <Text>{completed} of {streets.length} streets completed</Text>

      <View style={{ marginTop: 20 }}>
        <Button title="Open Map" onPress={() => navigation.navigate('Map')} />
        <View style={{ height: 8 }} />
        <Button title="Sync" onPress={() => navigation.navigate('Sync')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontWeight: '600', marginTop: 12 },
  row: { flexDirection: 'row', gap: 8, marginTop: 8 },
  btn: { padding: 12, borderWidth: 1, borderRadius: 6, marginHorizontal: 8 },
  large: { fontSize: 32, fontWeight: '700' },
});
