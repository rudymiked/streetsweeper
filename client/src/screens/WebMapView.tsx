import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  drawConfidenceOverlay,
  clearConfidenceOverlay,
  ensureConfidencePane
} from '../utils/debug/debugConfidenceOverlay';
import { Street } from '../state/matching/matcher_kdtree';
import { palette } from '../theme/palette';

interface WebMapViewProps {
  center: { latitude: number; longitude: number };
  streets: Street[];
  activities: Array<{
    id: number;
    coords: Array<{ latitude: number; longitude: number }>;
  }>;
  mapTheme: 'dark' | 'light';
  showStravaOverlay: boolean;
  showConfidenceOverlay: boolean;
  onToggleStreet: (id: string) => void;
}

export default function WebMapView({
  center,
  streets,
  activities,
  mapTheme,
  showStravaOverlay,
  showConfidenceOverlay,
  onToggleStreet
}: WebMapViewProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  // NEW: track layers explicitly
  const streetLayersRef = useRef<L.Layer[]>([]);
  const stravaLayersRef = useRef<L.Layer[]>([]);

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current) return;

    if (!mapRef.current) {
      mapRef.current = L.map(containerRef.current).setView(
        [center.latitude, center.longitude],
        14
      );

      mapRef.current.createPane("streetsPane");
      mapRef.current.getPane("streetsPane")!.style.zIndex = "400";

      mapRef.current.createPane("stravaPane");
      mapRef.current.getPane("stravaPane")!.style.zIndex = "500";

      ensureConfidencePane(mapRef.current);
    }

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Base map theme switcher
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
      tileLayerRef.current = null;
    }

    const provider = mapTheme === 'dark'
      ? {
          url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
          attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
        }
      : {
          url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
          attribution: '&copy; OpenStreetMap contributors'
        };

    tileLayerRef.current = L.tileLayer(provider.url, {
      maxZoom: 19,
      attribution: provider.attribution,
    }).addTo(map);
  }, [mapTheme]);

  // Draw base streets
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // remove old layers
    streetLayersRef.current.forEach(l => map.removeLayer(l));
    streetLayersRef.current = [];

    // add new layers
    streets.forEach(s => {
      const color = mapTheme === 'light'
        ? (s.completed ? '#16a34a' : '#ef4444')
        : (s.completed ? palette.accent : palette.muted);

      const layer = L.polyline(
        s.coords.map(c => [c.latitude, c.longitude]),
        {
          color,
          weight: s.completed ? 4 : 6,
          dashArray: s.completed ? undefined : '10,6',
          opacity: s.completed ? 0.9 : 0.85,
          pane: "streetsPane"
        }
      ).addTo(map);

      layer.on('click', () => onToggleStreet(s.id));

      streetLayersRef.current.push(layer);
    });
  }, [streets, onToggleStreet]);

  // Draw Strava overlay
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // remove old layers
    stravaLayersRef.current.forEach(l => map.removeLayer(l));
    stravaLayersRef.current = [];

    if (showStravaOverlay) {
      activities.forEach(a => {
        const layer = L.polyline(
          a.coords.map(c => [c.latitude, c.longitude]),
          {
            color: 'blue',
            weight: 3,
            opacity: 0.7,
            pane: "stravaPane"
          }
        ).addTo(map);

        stravaLayersRef.current.push(layer);
      });
    }
  }, [activities, showStravaOverlay]);

  // Confidence overlay
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    clearConfidenceOverlay(map);

    if (showConfidenceOverlay) {
      drawConfidenceOverlay(map, streets);
    }
  }, [showConfidenceOverlay, streets]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
