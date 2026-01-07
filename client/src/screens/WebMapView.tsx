import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface WebMapViewProps {
  center: { latitude: number; longitude: number };
  streets: Array<{
    id: string;
    completed: boolean;
    coords: Array<{ latitude: number; longitude: number }>;
  }>;
  activities: Array<{
    id: number;
    coords: Array<{ latitude: number; longitude: number }>;
  }>;
  showStravaOverlay: boolean;
}

export default function WebMapView({
  center,
  streets,
  activities,
  showStravaOverlay,
}: WebMapViewProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

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
    }

    mapRef.current.setView([center.latitude, center.longitude]);

    mapRef.current.eachLayer((layer) => {
      if (layer instanceof L.Polyline) mapRef.current?.removeLayer(layer);
    });

    streets.forEach((s) => {
      L.polyline(
        s.coords.map((c) => [c.latitude, c.longitude]),
        {
          color: s.completed ? 'green' : '#ff9800',
          weight: s.completed ? 4 : 6,
          dashArray: s.completed ? undefined : '10,6',
        }
      ).addTo(mapRef.current!);
    });

    if (showStravaOverlay) {
      activities.forEach((a) => {
        L.polyline(
          a.coords.map((c) => [c.latitude, c.longitude]),
          {
            color: 'blue',
            weight: 3,
            opacity: 0.7,
          }
        ).addTo(mapRef.current!);
      });
    }
  }, [center, streets, activities, showStravaOverlay]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
