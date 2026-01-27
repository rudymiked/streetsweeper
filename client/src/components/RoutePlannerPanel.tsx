// RoutePlannerPanel.tsx
// UI component for planning running routes

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Coord } from '../state/core/geometry/base';
import { Street } from '../state/matching/matcher_kdtree';
import {
  planRoute,
  planRouteGreedy,
  PlannedRoute,
  getRouteStats,
} from '../state/routing/routePlanner';
import { palette } from '../theme/palette';

interface RoutePlannerPanelProps {
  center: Coord;
  streets: Street[];
  onRouteGenerated: (route: PlannedRoute) => void;
  onClose: () => void;
}

export default function RoutePlannerPanel({
  center,
  streets,
  onRouteGenerated,
  onClose,
}: RoutePlannerPanelProps) {
  // Form state
  const [startAddress, setStartAddress] = useState('');
  const [endAddress, setEndAddress] = useState('');
  const [distanceMiles, setDistanceMiles] = useState('3');
  const [useCurrentLocation, setUseCurrentLocation] = useState(true);
  const [isLoop, setIsLoop] = useState(true);
  const [algorithm, setAlgorithm] = useState<'smart' | 'greedy'>('greedy');

  // Loading/result state
  const [isPlanning, setIsPlanning] = useState(false);
  const [plannedRoute, setPlannedRoute] = useState<PlannedRoute | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Parse coordinates from address string (simple lat,lon format)
  const parseCoordinate = useCallback((input: string): Coord | null => {
    const trimmed = input.trim();
    
    // Try parsing as "lat, lon" format
    const parts = trimmed.split(',').map(s => parseFloat(s.trim()));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return { latitude: parts[0], longitude: parts[1] };
    }
    
    return null;
  }, []);

  const handlePlanRoute = useCallback(async () => {
    setError(null);
    setIsPlanning(true);
    setPlannedRoute(null);

    try {
      // Determine start point
      let startPoint: Coord;
      if (useCurrentLocation) {
        startPoint = { latitude: center.latitude, longitude: center.longitude };
      } else {
        const parsed = parseCoordinate(startAddress);
        if (!parsed) {
          throw new Error('Invalid start location. Use format: latitude, longitude');
        }
        startPoint = parsed;
      }

      // Determine end point
      let endPoint: Coord;
      if (isLoop) {
        endPoint = startPoint;
      } else {
        const parsed = parseCoordinate(endAddress);
        if (!parsed) {
          throw new Error('Invalid end location. Use format: latitude, longitude');
        }
        endPoint = parsed;
      }

      // Parse distance
      const distance = parseFloat(distanceMiles);
      if (isNaN(distance) || distance <= 0 || distance > 50) {
        throw new Error('Distance must be between 0 and 50 miles');
      }

      // Filter streets to only those within reasonable range of route
      const relevantStreets = streets.filter(s => s.coords.length >= 2);

      if (relevantStreets.length === 0) {
        throw new Error('No streets loaded. Please load street data first.');
      }

      console.log(`Planning route with ${relevantStreets.length} streets, target ${distance} miles`);

      // Run in next tick to allow UI to update
      await new Promise(resolve => setTimeout(resolve, 10));

      // Plan the route
      const route = algorithm === 'smart'
        ? planRoute({
            startPoint,
            endPoint,
            targetDistanceMiles: distance,
            streets: relevantStreets,
            preferUnrun: true,
          })
        : planRouteGreedy({
            startPoint,
            endPoint,
            targetDistanceMiles: distance,
            streets: relevantStreets,
            preferUnrun: true,
          });

      if (!route) {
        throw new Error('Could not find a valid route. Try adjusting the distance or location.');
      }

      setPlannedRoute(route);
      onRouteGenerated(route);
    } catch (err: any) {
      setError(err.message || 'Failed to plan route');
    } finally {
      setIsPlanning(false);
    }
  }, [
    center,
    streets,
    startAddress,
    endAddress,
    distanceMiles,
    useCurrentLocation,
    isLoop,
    algorithm,
    parseCoordinate,
    onRouteGenerated,
  ]);

  const stats = plannedRoute ? getRouteStats(plannedRoute) : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Plan Running Route</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Text style={styles.closeButtonText}>✕</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.subtitle}>
        Create a route that maximizes unrun street coverage
      </Text>

      {/* Start Location */}
      <View style={styles.section}>
        <Text style={styles.label}>Start Location</Text>
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[styles.toggleButton, useCurrentLocation && styles.toggleButtonActive]}
            onPress={() => setUseCurrentLocation(true)}
          >
            <Text style={[styles.toggleText, useCurrentLocation && styles.toggleTextActive]}>
              Current Center
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleButton, !useCurrentLocation && styles.toggleButtonActive]}
            onPress={() => setUseCurrentLocation(false)}
          >
            <Text style={[styles.toggleText, !useCurrentLocation && styles.toggleTextActive]}>
              Custom
            </Text>
          </TouchableOpacity>
        </View>
        {!useCurrentLocation && (
          <TextInput
            style={styles.input}
            placeholder="lat, lon (e.g., 47.667, -122.384)"
            placeholderTextColor={palette.muted}
            value={startAddress}
            onChangeText={setStartAddress}
          />
        )}
      </View>

      {/* End Location */}
      <View style={styles.section}>
        <Text style={styles.label}>End Location</Text>
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[styles.toggleButton, isLoop && styles.toggleButtonActive]}
            onPress={() => setIsLoop(true)}
          >
            <Text style={[styles.toggleText, isLoop && styles.toggleTextActive]}>
              Loop (Return to Start)
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleButton, !isLoop && styles.toggleButtonActive]}
            onPress={() => setIsLoop(false)}
          >
            <Text style={[styles.toggleText, !isLoop && styles.toggleTextActive]}>
              Point-to-Point
            </Text>
          </TouchableOpacity>
        </View>
        {!isLoop && (
          <TextInput
            style={styles.input}
            placeholder="lat, lon (e.g., 47.670, -122.380)"
            placeholderTextColor={palette.muted}
            value={endAddress}
            onChangeText={setEndAddress}
          />
        )}
      </View>

      {/* Distance */}
      <View style={styles.section}>
        <Text style={styles.label}>Target Distance (miles)</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          value={distanceMiles}
          onChangeText={setDistanceMiles}
          placeholder="3"
          placeholderTextColor={palette.muted}
        />
        <Text style={styles.hint}>
          The route will try to match this distance (±15%)
        </Text>
      </View>

      {/* Algorithm Selection */}
      <View style={styles.section}>
        <Text style={styles.label}>Planning Algorithm</Text>
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[styles.toggleButton, algorithm === 'greedy' && styles.toggleButtonActive]}
            onPress={() => setAlgorithm('greedy')}
          >
            <Text style={[styles.toggleText, algorithm === 'greedy' && styles.toggleTextActive]}>
              Fast (Greedy)
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleButton, algorithm === 'smart' && styles.toggleButtonActive]}
            onPress={() => setAlgorithm('smart')}
          >
            <Text style={[styles.toggleText, algorithm === 'smart' && styles.toggleTextActive]}>
              Thorough (A*)
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.hint}>
          {algorithm === 'greedy' 
            ? 'Quick planning, good results for most routes'
            : 'More thorough search, may take longer'}
        </Text>
      </View>

      {/* Plan Button */}
      <TouchableOpacity
        style={[styles.planButton, isPlanning && styles.planButtonDisabled]}
        onPress={handlePlanRoute}
        disabled={isPlanning}
      >
        {isPlanning ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={palette.dark} size="small" />
            <Text style={styles.planButtonText}>Planning...</Text>
          </View>
        ) : (
          <Text style={styles.planButtonText}>Plan Route</Text>
        )}
      </TouchableOpacity>

      {/* Error Message */}
      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Results */}
      {stats && (
        <View style={styles.resultsBox}>
          <Text style={styles.resultsTitle}>Route Generated!</Text>
          
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Total Distance:</Text>
            <Text style={styles.statValue}>{stats.distanceMiles.toFixed(2)} mi</Text>
          </View>
          
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Unrun Distance:</Text>
            <Text style={[styles.statValue, styles.unrunValue]}>
              {stats.unrunDistanceMiles.toFixed(2)} mi
            </Text>
          </View>
          
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Unrun Coverage:</Text>
            <Text style={[styles.statValue, styles.unrunValue]}>
              {stats.unrunPercentage.toFixed(1)}%
            </Text>
          </View>
          
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Street Segments:</Text>
            <Text style={styles.statValue}>
              {stats.unrunSegmentCount} unrun / {stats.segmentCount} total
            </Text>
          </View>

          {/* Progress bar for unrun percentage */}
          <View style={styles.progressBarContainer}>
            <View 
              style={[
                styles.progressBar, 
                { width: `${Math.min(100, stats.unrunPercentage)}%` }
              ]} 
            />
          </View>
        </View>
      )}

      {/* Instructions */}
      <View style={styles.instructionsBox}>
        <Text style={styles.instructionsTitle}>How it works</Text>
        <Text style={styles.instructionsText}>
          1. Set your starting point (uses map center by default){'\n'}
          2. Choose loop or point-to-point route{'\n'}
          3. Enter your target distance{'\n'}
          4. The algorithm will find a route that maximizes unrun streets{'\n'}
          5. The route will appear on the map in orange
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.dark,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: palette.light,
  },
  subtitle: {
    fontSize: 14,
    color: palette.muted,
    marginBottom: 20,
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    fontSize: 20,
    color: palette.muted,
  },
  section: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: palette.light,
    marginBottom: 8,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.muted,
    alignItems: 'center',
  },
  toggleButtonActive: {
    backgroundColor: palette.accent,
    borderColor: palette.accent,
  },
  toggleText: {
    fontSize: 14,
    color: palette.muted,
  },
  toggleTextActive: {
    color: palette.dark,
    fontWeight: '600',
  },
  input: {
    backgroundColor: palette.surface,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: palette.light,
    borderWidth: 1,
    borderColor: palette.muted,
  },
  hint: {
    fontSize: 12,
    color: palette.muted,
    marginTop: 4,
  },
  planButton: {
    backgroundColor: palette.accent,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  planButtonDisabled: {
    opacity: 0.7,
  },
  planButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: palette.dark,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  errorBox: {
    backgroundColor: '#4a1c1c',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 14,
  },
  resultsBox: {
    backgroundColor: palette.surface,
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: palette.accent,
  },
  resultsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: palette.accent,
    marginBottom: 12,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  statLabel: {
    fontSize: 14,
    color: palette.muted,
  },
  statValue: {
    fontSize: 14,
    color: palette.light,
    fontWeight: '600',
  },
  unrunValue: {
    color: palette.accent,
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: palette.dark,
    borderRadius: 4,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: palette.accent,
    borderRadius: 4,
  },
  instructionsBox: {
    backgroundColor: palette.surface,
    borderRadius: 8,
    padding: 16,
    marginTop: 8,
  },
  instructionsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: palette.light,
    marginBottom: 8,
  },
  instructionsText: {
    fontSize: 13,
    color: palette.muted,
    lineHeight: 20,
  },
});
