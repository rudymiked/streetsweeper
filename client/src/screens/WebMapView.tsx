import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import {
  drawConfidenceOverlay,
  clearConfidenceOverlay,
  ensureConfidencePane
} from '../utils/debugConfidenceOverlay';

import { Street } from '../state/core/matcher_kdtree';

interface WebMapViewProps {
  center: { latitude: number; longitude: number };
  streets: Street[];
  activities: Array<{
    id: number;
    coords: Array<{ latitude: number; longitude: number }>;
  }>;
  showStravaOverlay: boolean;
  showConfidenceOverlay: boolean;
}

export default function WebMapView({
  center,
  streets,
  activities,
  showStravaOverlay,
  showConfidenceOverlay
}: WebMapViewProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

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

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
      }).addTo(mapRef.current);

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

  // Draw base streets
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // remove old layers
    streetLayersRef.current.forEach(l => map.removeLayer(l));
    streetLayersRef.current = [];

    // add new layers
    streets.forEach(s => {
      const layer = L.polyline(
        s.coords.map(c => [c.latitude, c.longitude]),
        {
          color: s.completed ? 'green' : '#ff9800',
          weight: s.completed ? 4 : 6,
          dashArray: s.completed ? undefined : '10,6',
          pane: "streetsPane"
        }
      ).addTo(map);

      streetLayersRef.current.push(layer);
    });
  }, [streets]);

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
