import React, { useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface WebMapViewProps {
  center: { latitude: number; longitude: number };
  streets: Array<{ id: string; name: string; completed: boolean; coords: Array<{ latitude: number; longitude: number }> }>;
  activities: Array<{ id: string; name: string; coords: Array<{ latitude: number; longitude: number }> }>;
}

export default function WebMapView({ center, streets, activities }: WebMapViewProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const map = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  useEffect(() => {
    if (!mapContainer.current) return;

    // Initialize map
    if (!map.current) {
      map.current = L.map(mapContainer.current, { zoomControl: true }).setView(
        [center.latitude, center.longitude],
        13
      );

      tileLayerRef.current = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map.current);
    } else {
      // Update map center
      map.current.setView([center.latitude, center.longitude], map.current.getZoom() || 13);
    }

    // Remove existing polylines and markers
    map.current.eachLayer(layer => {
      if (layer instanceof L.Polyline && !(layer instanceof L.Marker)) {
        map.current?.removeLayer(layer);
      }
    });

    // Add street polylines
    streets.forEach(street => {
      if (street.coords && street.coords.length > 0) {
        const latlngs = street.coords.map(c => [c.latitude, c.longitude] as L.LatLngExpression);
        L.polyline(latlngs, {
          color: street.completed ? 'green' : 'red',
          weight: 4,
          opacity: 0.8,
        }).addTo(map.current!);
      }
    });

    // Add activity polylines
    activities.forEach(activity => {
      if (activity.coords && activity.coords.length > 0) {
        const latlngs = activity.coords.map(c => [c.latitude, c.longitude] as L.LatLngExpression);
        L.polyline(latlngs, {
          color: 'blue',
          weight: 3,
          opacity: 0.7,
        }).addTo(map.current!);
      }
    });

    return () => {
      // cleanup if needed
    };
  }, [center, streets, activities]);

  return <div ref={mapContainer as any} style={styles.container as any} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
});
