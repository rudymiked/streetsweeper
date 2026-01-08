import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Switch, Platform, TouchableOpacity } from 'react-native';
import Slider from '@react-native-community/slider';
import { useAppState } from '../state/StateContext';

let MapView: any = null;
let PROVIDER_GOOGLE: any = null;
let Polyline: any = null;

const isWeb = Platform.OS === 'web';
if (!isWeb) {
  const mapsModule = require('react-native-maps');
  MapView = mapsModule.default;
  PROVIDER_GOOGLE = mapsModule.PROVIDER_GOOGLE;
  Polyline = mapsModule.Polyline;
}

export default function MapScreen() {
  const {
    streets,
    center,
    activities,
    showCompleted,
    setShowCompleted,
    showUnrun,
    setShowUnrun,
    showStravaOverlay,
    setShowStravaOverlay,
    showConfidenceOverlay,
    setShowConfidenceOverlay,
    radiusMiles,
    setRadiusMiles,
  } = useAppState();

  const [sidebarOpen, setSidebarOpen] = useState(false);

  const defaultRegion = {
    latitude: center.latitude,
    longitude: center.longitude,
    latitudeDelta: 0.02,
    longitudeDelta: 0.02,
  };

  function haversineMiles(a: any, b: any) {
    const toRad = (v: number) => (v * Math.PI) / 180;
    const R = 6371e3;
    const φ1 = toRad(a.latitude);
    const φ2 = toRad(b.latitude);
    const Δφ = toRad(b.latitude - a.latitude);
    const Δλ = toRad(b.longitude - a.longitude);

    const aa =
      Math.sin(Δφ / 2) ** 2 +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;

    const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
    return (R * c) / 1609.344;
  }

  const streetPolylines = useMemo(() => {
    return streets.map((s) => {
      const coords = s.coords;
      const centroid = coords.reduce(
        (acc, c) => ({
          latitude: acc.latitude + c.latitude,
          longitude: acc.longitude + c.longitude,
        }),
        { latitude: 0, longitude: 0 }
      );
      centroid.latitude /= coords.length;
      centroid.longitude /= coords.length;

      const distanceMiles = haversineMiles(center, centroid);

      return { ...s, coords, distanceMiles };
    });
  }, [streets, center, radiusMiles]);

  const visible = streetPolylines.filter(
    (sp) =>
      (sp.completed ? showCompleted : showUnrun) &&
      sp.distanceMiles <= radiusMiles
  );

  if (isWeb) {
    return (
      <View style={styles.container}>
        <Text>Web version uses MapScreen.web.tsx</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        style={styles.map}
        initialRegion={defaultRegion}
        showsUserLocation
      >
        {visible.map((s) => (
          <Polyline
            key={s.id}
            coordinates={s.coords}
            strokeColor={s.completed ? 'green' : '#ff9800'}
            strokeWidth={s.completed ? 4 : 6}
            lineDashPattern={s.completed ? undefined : [10, 5]}
          />
        ))}

        {showStravaOverlay &&
          activities.map((a) => (
            <Polyline
              key={`act-${a.id}`}
              coordinates={a.coords}
              strokeColor="blue"
              strokeWidth={3}
            />
          ))}
      </MapView>

      {/* Debug Overlay */}
      <View style={styles.debugOverlay}>
        <Text style={styles.debugText}>Streets: {streets.length}</Text>
        <Text style={styles.debugText}>Visible: {visible.length}</Text>
        <Text style={styles.debugText}>Activities: {activities.length}</Text>
        <Text style={styles.debugText}>Radius: {radiusMiles.toFixed(1)} mi</Text>
      </View>

      {/* Sidebar Toggle */}
      <TouchableOpacity
        style={styles.hamburger}
        onPress={() => setSidebarOpen(!sidebarOpen)}
      >
        <Text style={{ fontSize: 22 }}>☰</Text>
      </TouchableOpacity>

      {/* Sidebar */}
      {sidebarOpen && (
        <View style={styles.sidebar}>
          <Text style={styles.sidebarTitle}>Controls</Text>

          <View style={styles.row}>
            <Text>Show Completed</Text>
            <Switch value={showCompleted} onValueChange={setShowCompleted} />
          </View>

          <View style={styles.row}>
            <Text>Show Unrun</Text>
            <Switch value={showUnrun} onValueChange={setShowUnrun} />
          </View>

          <View style={styles.row}>
            <Text>Strava Overlay</Text>
            <Switch value={showStravaOverlay} onValueChange={setShowStravaOverlay} />
          </View>

          <View style={styles.row}>
            <Text>Confidence Overlay</Text>
            <Switch value={showConfidenceOverlay} onValueChange={setShowConfidenceOverlay} />
          </View>

          <Text style={styles.sliderLabel}>Radius: {radiusMiles.toFixed(1)} mi</Text>
          <Slider
            minimumValue={0.5}
            maximumValue={5}
            step={0.1}
            value={radiusMiles}
            onValueChange={setRadiusMiles}
            style={{ width: '100%' }}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },

  debugOverlay: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
    padding: 8,
    borderRadius: 6,
    zIndex: 9999,
  },
  debugText: { color: 'white', fontSize: 12 },

  hamburger: {
    position: 'absolute',
    top: 20,
    right: 20,
    backgroundColor: 'white',
    padding: 8,
    borderRadius: 6,
    elevation: 4,
    zIndex: 9999,
  },

  sidebar: {
    position: 'absolute',
    top: 70,
    right: 20,
    width: 220,
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 8,
    elevation: 6,
    zIndex: 9999,
  },
  sidebarTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 6 },
  sliderLabel: { marginTop: 12, fontWeight: '600' },
});
