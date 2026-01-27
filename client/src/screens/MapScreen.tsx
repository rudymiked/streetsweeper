import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Switch, Platform, TouchableOpacity, TextInput, ScrollView, Dimensions } from 'react-native';
import Slider from '@react-native-community/slider';
import { useAppState } from '../state/StateContext';
import { palette } from '../theme/palette';
import { planRouteGreedy, getRouteStats, getRouteDirections, PlannedRoute } from '../state/routing/routePlanner';

let MapView: any = null;
let PROVIDER_GOOGLE: any = null;
let Polyline: any = null;
let Marker: any = null;

const isWeb = Platform.OS === 'web';
if (!isWeb) {
  const mapsModule = require('react-native-maps');
  MapView = mapsModule.default;
  PROVIDER_GOOGLE = mapsModule.PROVIDER_GOOGLE;
  Polyline = mapsModule.Polyline;
  Marker = mapsModule.Marker;
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

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
  const [routePlannerOpen, setRoutePlannerOpen] = useState(false);
  const [routeDetailsOpen, setRouteDetailsOpen] = useState(false);
  const mapRef = useRef<any>(null);

  // Route planner state
  const [routeDistance, setRouteDistance] = useState('3');
  const [isLoop, setIsLoop] = useState(true);
  const [isPlanning, setIsPlanning] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [useMapCenter, setUseMapCenter] = useState(true);
  const [startCoords, setStartCoords] = useState('');
  const [endCoords, setEndCoords] = useState('');
  const [plannedRoute, setPlannedRoute] = useState<PlannedRoute | null>(null);
  const [pinMode, setPinMode] = useState<'start' | 'end' | null>(null);

  const defaultRegion = {
    latitude: center.latitude,
    longitude: center.longitude,
    latitudeDelta: 0.02,
    longitudeDelta: 0.02,
  };

  // Recenter native map when center changes
  useEffect(() => {
    if (mapRef.current && center) {
      mapRef.current.animateToRegion({
        latitude: center.latitude,
        longitude: center.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      }, 300);
    }
  }, [center.latitude, center.longitude]);

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

  // Handle map press for pin placement
  const handleMapPress = useCallback((event: any) => {
    if (!pinMode) return;
    
    const { latitude, longitude } = event.nativeEvent.coordinate;
    const coords = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
    
    if (pinMode === 'start') {
      setStartCoords(coords);
      setUseMapCenter(false);
    } else if (pinMode === 'end') {
      setEndCoords(coords);
    }
    
    setPinMode(null);
  }, [pinMode]);

  // Plan route function
  const handlePlanRoute = useCallback(async () => {
    setRouteError(null);
    setIsPlanning(true);

    try {
      const distance = parseFloat(routeDistance);
      if (isNaN(distance) || distance <= 0 || distance > 50) {
        throw new Error('Distance must be between 0 and 50 miles');
      }

      const relevantStreets = streets.filter(s => s.coords.length >= 2);
      
      if (relevantStreets.length === 0) {
        throw new Error('No streets loaded');
      }

      // Parse start point
      let startPoint: { latitude: number; longitude: number };
      if (useMapCenter) {
        startPoint = { latitude: center.latitude, longitude: center.longitude };
      } else {
        const parts = startCoords.split(',').map(s => parseFloat(s.trim()));
        if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) {
          throw new Error('Invalid start location');
        }
        startPoint = { latitude: parts[0], longitude: parts[1] };
      }

      // Parse end point
      let endPoint: { latitude: number; longitude: number };
      if (isLoop) {
        endPoint = startPoint;
      } else {
        const parts = endCoords.split(',').map(s => parseFloat(s.trim()));
        if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) {
          throw new Error('Invalid end location');
        }
        endPoint = { latitude: parts[0], longitude: parts[1] };
      }

      const route = planRouteGreedy({
        startPoint,
        endPoint,
        targetDistanceMiles: distance,
        streets: relevantStreets,
        preferUnrun: true,
      });

      if (!route) {
        throw new Error('Could not find a valid route');
      }

      setPlannedRoute(route);
      setRoutePlannerOpen(false);
    } catch (err: any) {
      setRouteError(err.message || 'Failed to plan route');
    } finally {
      setIsPlanning(false);
    }
  }, [routeDistance, streets, useMapCenter, startCoords, endCoords, isLoop, center]);

  const routeStats = plannedRoute ? getRouteStats(plannedRoute) : null;

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
        ref={mapRef}
        customMapStyle={mapTheme === 'dark' ? darkMapStyle : lightMapStyle}
        onPress={handleMapPress}
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

        {/* Planned Route */}
        {plannedRoute && plannedRoute.path.length > 1 && (
          <>
            <Polyline
              coordinates={plannedRoute.path}
              strokeColor={palette.route || '#f97316'}
              strokeWidth={6}
            />
            <Marker
              coordinate={plannedRoute.path[0]}
              title="Start"
              pinColor="green"
            />
            {plannedRoute.path.length > 1 && (
              <Marker
                coordinate={plannedRoute.path[plannedRoute.path.length - 1]}
                title="End"
                pinColor="red"
              />
            )}
          </>
        )}

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

      {/* Route Planner Button */}
      <TouchableOpacity
        style={styles.routeButton}
        onPress={() => setRoutePlannerOpen(true)}
        activeOpacity={0.85}
      >
        <Text style={styles.routeButtonText}>🗺️ Plan Route</Text>
      </TouchableOpacity>

      {/* Pin Mode Indicator */}
      {pinMode && (
        <View style={styles.pinModeIndicator}>
          <Text style={styles.pinModeText}>
            Tap map to set {pinMode === 'start' ? 'START' : 'END'} point
          </Text>
          <TouchableOpacity onPress={() => setPinMode(null)}>
            <Text style={styles.pinModeCancel}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Route Stats (when route exists) */}
      {routeStats && !routePlannerOpen && (
        <View style={styles.routeStatsBar}>
          <View style={styles.routeStatsContent}>
            <Text style={styles.routeStatsText}>
              {routeStats.distanceMiles.toFixed(1)} mi • {routeStats.unrunPercentage.toFixed(0)}% new
            </Text>
            <View style={styles.routeStatsButtons}>
              <TouchableOpacity 
                style={styles.routeStatsBtn}
                onPress={() => setRouteDetailsOpen(true)}
              >
                <Text style={styles.routeStatsBtnText}>Details</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.routeStatsBtn, styles.routeStatsBtnClear]}
                onPress={() => setPlannedRoute(null)}
              >
                <Text style={styles.routeStatsBtnText}>Clear</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Route Planner Bottom Sheet */}
      {routePlannerOpen && (
        <View style={styles.bottomSheet}>
          <View style={styles.bottomSheetHandle} />
          <ScrollView style={styles.bottomSheetScroll} showsVerticalScrollIndicator={false}>
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>Route Planner</Text>
              <TouchableOpacity onPress={() => setRoutePlannerOpen(false)}>
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Start Location */}
            <Text style={styles.inputLabel}>Start Location</Text>
            <View style={styles.toggleRow}>
              <TouchableOpacity
                style={[styles.toggleBtn, useMapCenter && styles.toggleBtnActive]}
                onPress={() => { setUseMapCenter(true); setPinMode(null); }}
              >
                <Text style={[styles.toggleBtnText, useMapCenter && styles.toggleBtnTextActive]}>
                  Map Center
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleBtn, !useMapCenter && !pinMode && styles.toggleBtnActive]}
                onPress={() => { setUseMapCenter(false); setPinMode(null); }}
              >
                <Text style={[styles.toggleBtnText, !useMapCenter && !pinMode && styles.toggleBtnTextActive]}>
                  Custom
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleBtn, styles.pinBtn, pinMode === 'start' && styles.pinBtnActive]}
                onPress={() => { 
                  setPinMode(pinMode === 'start' ? null : 'start'); 
                  setUseMapCenter(false);
                  setRoutePlannerOpen(false);
                }}
              >
                <Text style={[styles.toggleBtnText, pinMode === 'start' && styles.toggleBtnTextActive]}>
                  📍 Pin
                </Text>
              </TouchableOpacity>
            </View>
            {useMapCenter ? (
              <Text style={styles.coordsDisplay}>
                {center.latitude.toFixed(5)}, {center.longitude.toFixed(5)}
              </Text>
            ) : (
              <TextInput
                style={styles.input}
                value={startCoords}
                onChangeText={setStartCoords}
                placeholder="lat, lon"
                placeholderTextColor={palette.muted}
              />
            )}

            {/* Route Type */}
            <Text style={styles.inputLabel}>Route Type</Text>
            <View style={styles.toggleRow}>
              <TouchableOpacity
                style={[styles.toggleBtn, isLoop && styles.toggleBtnActive]}
                onPress={() => setIsLoop(true)}
              >
                <Text style={[styles.toggleBtnText, isLoop && styles.toggleBtnTextActive]}>
                  Loop
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleBtn, !isLoop && styles.toggleBtnActive]}
                onPress={() => setIsLoop(false)}
              >
                <Text style={[styles.toggleBtnText, !isLoop && styles.toggleBtnTextActive]}>
                  Point-to-Point
                </Text>
              </TouchableOpacity>
            </View>

            {/* End Location (point-to-point only) */}
            {!isLoop && (
              <>
                <Text style={styles.inputLabel}>End Location</Text>
                <View style={styles.toggleRow}>
                  <TouchableOpacity
                    style={[styles.toggleBtn, styles.toggleBtnWide]}
                    onPress={() => { 
                      setPinMode(pinMode === 'end' ? null : 'end');
                      setRoutePlannerOpen(false);
                    }}
                  >
                    <Text style={[styles.toggleBtnText, pinMode === 'end' && styles.toggleBtnTextActive]}>
                      📍 {pinMode === 'end' ? 'Tap Map...' : 'Drop Pin'}
                    </Text>
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={styles.input}
                  value={endCoords}
                  onChangeText={setEndCoords}
                  placeholder="lat, lon"
                  placeholderTextColor={palette.muted}
                />
              </>
            )}

            {/* Distance */}
            <Text style={styles.inputLabel}>Target Distance (miles)</Text>
            <TextInput
              style={styles.input}
              value={routeDistance}
              onChangeText={setRouteDistance}
              keyboardType="numeric"
              placeholder="3"
              placeholderTextColor={palette.muted}
            />

            {/* Error */}
            {routeError && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{routeError}</Text>
              </View>
            )}

            {/* Generate Button */}
            <TouchableOpacity
              style={[styles.generateBtn, isPlanning && styles.generateBtnDisabled]}
              onPress={handlePlanRoute}
              disabled={isPlanning}
              activeOpacity={0.8}
            >
              <Text style={styles.generateBtnText}>
                {isPlanning ? 'Planning...' : 'Generate Route'}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}

      {/* Route Details Bottom Sheet */}
      {routeDetailsOpen && plannedRoute && (
        <View style={styles.bottomSheet}>
          <View style={styles.bottomSheetHandle} />
          <View style={styles.bottomSheetHeader}>
            <Text style={styles.bottomSheetTitle}>Route Directions</Text>
            <TouchableOpacity onPress={() => setRouteDetailsOpen(false)}>
              <Text style={styles.closeButton}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.directionsScroll}>
            {getRouteDirections(plannedRoute).map((dir) => (
              <View key={dir.step} style={styles.directionStep}>
                <View style={styles.directionStepNumber}>
                  <Text style={styles.directionStepNumberText}>{dir.step}</Text>
                </View>
                <View style={styles.directionContent}>
                  <View style={styles.directionStreetRow}>
                    <Text style={styles.directionStreet}>{dir.streetName}</Text>
                    {dir.isUnrun && (
                      <View style={styles.unrunBadge}>
                        <Text style={styles.unrunBadgeText}>NEW</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.directionDistance}>
                    {dir.distanceMiles.toFixed(2)} mi • Total: {dir.cumulativeDistanceMiles.toFixed(2)} mi
                  </Text>
                </View>
              </View>
            ))}
          </ScrollView>
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

  // Route Planner Button
  routeButton: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    backgroundColor: palette.route || '#f97316',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 12,
    elevation: 8,
    zIndex: 9998,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  routeButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },

  // Pin Mode Indicator
  pinModeIndicator: {
    position: 'absolute',
    top: 60,
    left: 20,
    right: 20,
    backgroundColor: '#ef4444',
    padding: 12,
    borderRadius: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10000,
  },
  pinModeText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  pinModeCancel: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
    textDecorationLine: 'underline',
  },

  // Route Stats Bar
  routeStatsBar: {
    position: 'absolute',
    bottom: 80,
    left: 20,
    right: 20,
    backgroundColor: palette.panel,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: palette.panelBorder,
    zIndex: 9997,
  },
  routeStatsContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  routeStatsText: {
    color: palette.accent,
    fontWeight: '600',
    fontSize: 14,
  },
  routeStatsButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  routeStatsBtn: {
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  routeStatsBtnClear: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  routeStatsBtnText: {
    color: palette.text,
    fontWeight: '600',
    fontSize: 12,
  },

  // Bottom Sheet
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: SCREEN_HEIGHT * 0.7,
    backgroundColor: palette.panel,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 30,
    zIndex: 10000,
    elevation: 20,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -10 },
  },
  bottomSheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: palette.muted,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 10,
  },
  bottomSheetScroll: {
    maxHeight: SCREEN_HEIGHT * 0.55,
  },
  bottomSheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: palette.panelBorder,
  },
  bottomSheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: palette.text,
  },
  closeButton: {
    fontSize: 20,
    color: palette.muted,
    padding: 4,
  },

  // Input styles
  inputLabel: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: palette.overlay,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    color: palette.text,
    fontSize: 14,
    borderWidth: 1,
    borderColor: palette.panelBorder,
  },
  coordsDisplay: {
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    color: palette.accent,
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },

  // Toggle buttons
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.panelBorder,
    alignItems: 'center',
  },
  toggleBtnWide: {
    flex: 1,
  },
  toggleBtnActive: {
    backgroundColor: palette.accent,
    borderColor: palette.accent,
  },
  toggleBtnText: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: '600',
  },
  toggleBtnTextActive: {
    color: '#0b1224',
  },
  pinBtn: {
    flex: 0,
    paddingHorizontal: 14,
  },
  pinBtnActive: {
    backgroundColor: '#ef4444',
    borderColor: '#ef4444',
  },

  // Error box
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 13,
  },

  // Generate button
  generateBtn: {
    backgroundColor: palette.route || '#f97316',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  generateBtnDisabled: {
    opacity: 0.6,
  },
  generateBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },

  // Directions
  directionsScroll: {
    maxHeight: SCREEN_HEIGHT * 0.5,
  },
  directionStep: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: palette.panelBorder,
    gap: 12,
  },
  directionStepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  directionStepNumberText: {
    color: '#0b1224',
    fontWeight: '700',
    fontSize: 13,
  },
  directionContent: {
    flex: 1,
  },
  directionStreetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  directionStreet: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '600',
  },
  unrunBadge: {
    backgroundColor: palette.accent,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  unrunBadgeText: {
    color: '#0b1224',
    fontSize: 10,
    fontWeight: '700',
  },
  directionDistance: {
    color: palette.muted,
    fontSize: 12,
    marginTop: 4,
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
