import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Switch, FlatList, TouchableOpacity, Platform } from 'react-native';
import { useAppState } from '../state/StateContext';

// Only import MapView on native platforms
let MapView: any = null;
let PROVIDER_GOOGLE: any = null;
let Polyline: any = null;
const isWeb = typeof Platform === 'undefined' || Platform?.OS === 'web';
if (!isWeb) {
  const mapsModule = require('react-native-maps');
  MapView = mapsModule.default;
  PROVIDER_GOOGLE = mapsModule.PROVIDER_GOOGLE;
  Polyline = mapsModule.Polyline;
}

export default function MapScreen({ navigation }: any) {
  const { streets, center, toggleStreet, activities, showCompleted, setShowCompleted, showUnrun, setShowUnrun, radiusMiles } = useAppState();

  // Default region (falls back when center is 0/0)
  const defaultRegion: any = {
    latitude: center.latitude || process.env.DEFAULT_MAP_CENTER_LATITUDE,
    longitude: center.longitude || process.env.DEFAULT_MAP_CENTER_LONGITUDE,
    latitudeDelta: 0.02,
    longitudeDelta: 0.02,
  };

  // Generate polylines for each street: prefer stored `s.coords`, fallback to synthetic.
  function haversineMiles(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
    const toRad = (v: number) => (v * Math.PI) / 180;
    const R = 6371e3; // meters
    const φ1 = toRad(a.latitude);
    const φ2 = toRad(b.latitude);
    const Δφ = toRad(b.latitude - a.latitude);
    const Δλ = toRad(b.longitude - a.longitude);
    const aa = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
    const meters = R * c;
    return meters / 1609.344;
  }

  const streetPolylines = useMemo(() => {
    return streets.map((s, idx) => {
      let coords: any[] = [];
      if (s.coords && s.coords.length > 0) {
        coords = s.coords;
      } else {
        const baseLat = (center.latitude || defaultRegion.latitude) + (idx * 0.001 - 0.005);
        const baseLng = (center.longitude || defaultRegion.longitude) + (idx * 0.001 - 0.005);
        coords = [
          { latitude: baseLat, longitude: baseLng },
          { latitude: baseLat + 0.0008, longitude: baseLng + 0.0012 },
        ];
      }

      // compute centroid for distance checks
      const centroid = coords.reduce(
        (acc, c) => ({ latitude: acc.latitude + c.latitude, longitude: acc.longitude + c.longitude }),
        { latitude: 0, longitude: 0 }
      );
      centroid.latitude /= coords.length;
      centroid.longitude /= coords.length;

      const distanceMiles = haversineMiles(center, centroid);

      return { id: s.id, name: s.name, completed: s.completed, coords, distanceMiles };
    });
  }, [streets, center.latitude, center.longitude, radiusMiles]);

  const visible = streetPolylines.filter(sp => (sp.completed ? showCompleted : showUnrun) && sp.distanceMiles <= (radiusMiles || 2));

  // debug logging to help verify why streets may be filtered out
  React.useEffect(() => {
    console.log('streetPolylines (sample 10):', streetPolylines.slice(0, 10));
    console.log('visible (sample 10):', visible.slice(0, 10));
  }, [streetPolylines, visible]);

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

  // Web and native share the same UI
  if (isWeb) {
    return (
      <View style={styles.container}>
        <View style={styles.mapPlaceholder}>
          <Text style={styles.mapText}>
            Map view: {visible.length} streets + {activities.length} activities
          </Text>
          <Text style={styles.centerText}>
            Center: {center.name} ({center.latitude.toFixed(4)}, {center.longitude.toFixed(4)})
          </Text>
        </View>

        {/* Controls moved into Settings screen; hidden on main map UI. */}
      </View>
    );
  }

  // Native mobile version with MapView
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
              strokeColor={!s.completed ? '#ff9800' : 'green'}
              strokeWidth={!s.completed ? 6 : 4}
              lineDashPattern={!s.completed ? [10, 5] : undefined}
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

        {/* Controls moved into Settings screen; hidden on main map UI. */}
      </View>

      {/* Settings moved to Settings screen; no inline modal here anymore. */}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  mapPlaceholder: { flex: 1, backgroundColor: '#e8f4f8', justifyContent: 'center', alignItems: 'center', padding: 16 },
  mapText: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
  centerText: { fontSize: 12, marginTop: 8, textAlign: 'center', color: '#666' },
  controls: { position: 'absolute', top: 12, left: 12, right: 12, maxHeight: '40%', backgroundColor: 'rgba(255,255,255,0.95)', padding: 12, borderRadius: 8 },
  title: { fontSize: 16, fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  item: { paddingVertical: 8, borderBottomWidth: 1, borderColor: '#eee', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modal: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: 'white', padding: 16, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  input: { borderWidth: 1, borderColor: '#ccc', padding: 10, borderRadius: 6, marginVertical: 8 },
});
