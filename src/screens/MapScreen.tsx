import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Switch, FlatList, TouchableOpacity, Platform } from 'react-native';
import MapView, { PROVIDER_GOOGLE, Polyline, LatLng, Region } from 'react-native-maps';
import { useAppState } from '../state/StateContext';

export default function MapScreen({ navigation }: any) {
  const { streets, center, toggleStreet, activities } = useAppState();
  const [showCompleted, setShowCompleted] = useState(true);
  const [showUnrun, setShowUnrun] = useState(true);

  // Default region (falls back when center is 0/0)
  const defaultRegion: Region = {
    latitude: center.latitude || 37.78825,
    longitude: center.longitude || -122.4324,
    latitudeDelta: 0.02,
    longitudeDelta: 0.02,
  };

  // Generate simple synthetic polylines for each street for MVP.
  const streetPolylines = useMemo(() => {
    return streets.map((s, idx) => {
      const baseLat = (center.latitude || defaultRegion.latitude) + (idx * 0.001 - 0.005);
      const baseLng = (center.longitude || defaultRegion.longitude) + (idx * 0.001 - 0.005);
      const coords: LatLng[] = [
        { latitude: baseLat, longitude: baseLng },
        { latitude: baseLat + 0.0008, longitude: baseLng + 0.0012 },
      ];
      return { id: s.id, name: s.name, completed: s.completed, coords };
    });
  }, [streets, center.latitude, center.longitude]);

  const visible = streetPolylines.filter(sp => (sp.completed ? showCompleted : showUnrun));

  // Decode and render activity polylines
  function decodePolyline(polylineStr: string) {
    const coords = [];
    let index = 0;
    let lat = 0;
    let lng = 0;

    while (index < polylineStr.length) {
      let result = 0;
      let shift = 0;
      let byte = 0;

      do {
        byte = polylineStr.charCodeAt(index) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
        index += 1;
      } while (byte >= 0x20);

      lat += (result & 1) ? ~(result >> 1) : result >> 1;

      result = 0;
      shift = 0;
      do {
        byte = polylineStr.charCodeAt(index) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
        index += 1;
      } while (byte >= 0x20);

      lng += (result & 1) ? ~(result >> 1) : result >> 1;

      coords.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
    }

    return coords;
  }

  const activityPolylines = activities
    .filter(a => a.polyline)
    .map((a, idx) => ({
      id: `act_${a.id}`,
      name: a.name,
      coords: decodePolyline(a.polyline || ''),
    }));

  // Settings UI moved to dedicated Settings screen; header buttons provided by App.tsx

  return (
    <>
      <View style={styles.container}>
        <MapView
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
          style={styles.map}
          initialRegion={defaultRegion}
          showsUserLocation
          showsMyLocationButton
        >
          {visible.map(s => (
            <Polyline
              key={s.id}
              coordinates={s.coords}
              strokeColor={s.completed ? 'green' : 'red'}
              strokeWidth={4}
            />
          ))}
          {activityPolylines.map(a => (
            <Polyline
              key={a.id}
              coordinates={a.coords}
              strokeColor="blue"
              strokeWidth={3}
            />
          ))}
        </MapView>

        <View style={styles.controls}>
          <Text style={styles.title}>Streets</Text>
          <View style={styles.row}>
            <Text>Show completed</Text>
            <Switch value={showCompleted} onValueChange={setShowCompleted} />
          </View>
          <View style={styles.row}>
            <Text>Show unrun</Text>
            <Switch value={showUnrun} onValueChange={setShowUnrun} />
          </View>

          <FlatList
            data={streetPolylines}
            keyExtractor={i => i.id}
            renderItem={({ item }) => (
              <TouchableOpacity onPress={() => toggleStreet(item.id)} style={styles.item}>
                <Text style={{ textDecorationLine: item.completed ? 'line-through' : 'none' }}>{item.name}</Text>
                <Text>{item.completed ? '✓' : ''}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      </View>

      {/* Settings moved to Settings screen; no inline modal here anymore. */}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  controls: { position: 'absolute', top: 12, left: 12, right: 12, backgroundColor: 'rgba(255,255,255,0.95)', padding: 12, borderRadius: 8 },
  title: { fontSize: 16, fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  item: { paddingVertical: 8, borderBottomWidth: 1, borderColor: '#eee', flexDirection: 'row', justifyContent: 'space-between' },
  modal: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: 'white', padding: 16, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  input: { borderWidth: 1, borderColor: '#ccc', padding: 10, borderRadius: 6, marginVertical: 8 },
});
