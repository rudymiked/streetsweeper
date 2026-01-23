import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Switch, Platform, TouchableOpacity } from 'react-native';
import Slider from '@react-native-community/slider';
import { useAppState } from '../state/StateContext';
import { palette } from '../theme/palette';

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
    mapTheme,
    setMapTheme,
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
        customMapStyle={mapTheme === 'dark' ? darkMapStyle : lightMapStyle}
      >
        {visible.map((s) => (
          <Polyline
            key={s.id}
            coordinates={s.coords}
            strokeColor={mapTheme === 'light' ? (s.completed ? '#16a34a' : '#ef4444') : (s.completed ? palette.accent : palette.muted)}
            strokeWidth={s.completed ? 4 : 6}
            lineDashPattern={s.completed ? undefined : [10, 5]}
          />
        ))}

        {showStravaOverlay &&
          activities.map((a) => (
            <Polyline
              key={`act-${a.id}`}
              coordinates={a.coords}
              strokeColor={palette.accentStrong}
              strokeWidth={3}
              strokeOpacity={0.7}
            />
          ))}
      </MapView>

      {/* Debug Overlay */}
      <View style={styles.debugOverlay}>
        <Text style={styles.debugHeading}>Run State</Text>
        <View style={styles.debugRow}>
          <Text style={styles.debugLabel}>Streets</Text>
          <Text style={styles.debugValue}>{streets.length}</Text>
        </View>
        <View style={styles.debugRow}>
          <Text style={styles.debugLabel}>Visible</Text>
          <Text style={styles.debugValue}>{visible.length}</Text>
        </View>
        <View style={styles.debugRow}>
          <Text style={styles.debugLabel}>Activities</Text>
          <Text style={styles.debugValue}>{activities.length}</Text>
        </View>
        <View style={styles.debugRow}>
          <Text style={styles.debugLabel}>Radius</Text>
          <Text style={styles.debugValue}>{radiusMiles.toFixed(1)} mi</Text>
        </View>
      </View>

      {/* Sidebar Toggle */}
      <TouchableOpacity
        style={styles.hamburger}
        onPress={() => setSidebarOpen(!sidebarOpen)}
        activeOpacity={0.85}
      >
        <Text style={styles.hamburgerIcon}>☰</Text>
      </TouchableOpacity>

      {/* Sidebar */}
      {sidebarOpen && (
        <View style={styles.sidebar}>
          <Text style={styles.sidebarTitle}>Controls</Text>

          <View style={styles.row}>
            <Text style={styles.label}>Show Completed</Text>
            <Switch
              value={showCompleted}
              onValueChange={setShowCompleted}
              trackColor={{ false: '#1f2e45', true: palette.accent }}
              thumbColor={showCompleted ? '#0b1224' : '#0c182d'}
              ios_backgroundColor="#1f2e45"
            />
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Show Unrun</Text>
            <Switch
              value={showUnrun}
              onValueChange={setShowUnrun}
              trackColor={{ false: '#1f2e45', true: palette.accent }}
              thumbColor={showUnrun ? '#0b1224' : '#0c182d'}
              ios_backgroundColor="#1f2e45"
            />
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Strava Overlay</Text>
            <Switch
              value={showStravaOverlay}
              onValueChange={setShowStravaOverlay}
              trackColor={{ false: '#1f2e45', true: palette.accent }}
              thumbColor={showStravaOverlay ? '#0b1224' : '#0c182d'}
              ios_backgroundColor="#1f2e45"
            />
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Confidence Overlay</Text>
            <Switch
              value={showConfidenceOverlay}
              onValueChange={setShowConfidenceOverlay}
              trackColor={{ false: '#1f2e45', true: palette.accent }}
              thumbColor={showConfidenceOverlay ? '#0b1224' : '#0c182d'}
              ios_backgroundColor="#1f2e45"
            />
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Map Theme</Text>
            <Switch
              value={mapTheme === 'dark'}
              onValueChange={(val) => setMapTheme(val ? 'dark' : 'light')}
              trackColor={{ false: '#1f2e45', true: palette.accent }}
              thumbColor={mapTheme === 'dark' ? '#0b1224' : '#0c182d'}
              ios_backgroundColor="#1f2e45"
            />
          </View>

          <Text style={styles.sliderLabel}>Radius: {radiusMiles.toFixed(1)} mi</Text>
          <Slider
            minimumValue={0.5}
            maximumValue={5}
            step={0.1}
            value={radiusMiles}
            onValueChange={setRadiusMiles}
            style={{ width: '100%' }}
            minimumTrackTintColor={palette.accentStrong}
            maximumTrackTintColor="#1f2e45"
            thumbTintColor={palette.accent}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b1224' },
  map: { flex: 1 },

  debugOverlay: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    backgroundColor: palette.overlay,
    padding: 12,
    borderRadius: 10,
    zIndex: 9999,
    minWidth: 170,
    borderWidth: 1,
    borderColor: palette.panelBorder,
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  debugHeading: {
    color: palette.accent,
    fontWeight: '700',
    fontSize: 12,
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  debugRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  debugLabel: { color: palette.text, fontSize: 12 },
  debugValue: { color: palette.muted, fontSize: 12 },

  hamburger: {
    position: 'absolute',
    top: 20,
    right: 20,
    backgroundColor: palette.accent,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    elevation: 8,
    zIndex: 9999,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  hamburgerIcon: { fontSize: 18, color: '#0b1224' },

  sidebar: {
    position: 'absolute',
    top: 70,
    right: 20,
    width: 220,
    backgroundColor: palette.panel,
    padding: 14,
    borderRadius: 12,
    elevation: 10,
    zIndex: 9999,
    borderWidth: 1,
    borderColor: palette.panelBorder,
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  sidebarTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
    color: palette.text,
    letterSpacing: 0.3,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: palette.panelBorder,
  },
  label: { color: palette.text },
  sliderLabel: {
    marginTop: 12,
    fontWeight: '600',
    color: palette.muted,
  },
});

// Basic dark map style for Google Maps
const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#0b1224' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#e2e8f0' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0b1224' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#11243d' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1f2e45' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0c182d' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#0c182d' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#0c182d' }] },
];

const lightMapStyle: any[] = [];
