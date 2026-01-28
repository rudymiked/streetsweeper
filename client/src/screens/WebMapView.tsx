import React, { useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  drawConfidenceOverlay,
  clearConfidenceOverlay,
  ensureConfidencePane
} from '../utils/debug/debugConfidenceOverlay';
import { Street } from '../state/matching/matcher_kdtree';
import { palette } from '../theme/palette';
import { PlannedRoute } from '../state/routing/routePlanner';
import { PolygonPoint } from '../state/StateContext';

interface WebMapViewProps {
  center: { latitude: number; longitude: number };
  mapZoom: number;
  streets: Street[];
  activities: Array<{
    id: number;
    coords: Array<{ latitude: number; longitude: number }>;
  }>;
  mapTheme: 'dark' | 'light';
  showStravaOverlay: boolean;
  showConfidenceOverlay: boolean;
  onToggleStreet: (id: string) => void;
  plannedRoute?: PlannedRoute | null;
  pinMode?: boolean;
  onMapClick?: (lat: number, lon: number) => void;
  isDrawingPolygon?: boolean;
  polygon?: PolygonPoint[];
  onPolygonClick?: (lat: number, lon: number) => void;
}

export default function WebMapView({
  center,
  mapZoom,
  streets,
  activities,
  mapTheme,
  showStravaOverlay,
  showConfidenceOverlay,
  onToggleStreet,
  plannedRoute,
  pinMode,
  onMapClick,
  isDrawingPolygon,
  polygon = [],
  onPolygonClick
}: WebMapViewProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  // NEW: track layers explicitly
  const streetLayersRef = useRef<L.Layer[]>([]);
  const stravaLayersRef = useRef<L.Layer[]>([]);
  const routeLayersRef = useRef<L.Layer[]>([]);
  const polygonLayersRef = useRef<L.Layer[]>([]);

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

      mapRef.current.createPane("routePane");
      mapRef.current.getPane("routePane")!.style.zIndex = "600";

      mapRef.current.createPane("polygonPane");
      mapRef.current.getPane("polygonPane")!.style.zIndex = "650";

      ensureConfidencePane(mapRef.current);
    }

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Recenter when center or zoom updates
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setView([center.latitude, center.longitude], mapZoom);
  }, [center.latitude, center.longitude, mapZoom]);

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

      layer.on('click', () => {
        // Don't toggle streets when in pin mode or drawing polygon
        if (!pinMode && !isDrawingPolygon) {
          onToggleStreet(s.id);
        }
      });

      streetLayersRef.current.push(layer);
    });
  }, [streets, onToggleStreet, pinMode, isDrawingPolygon]);

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

  // Draw planned route
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Remove old route layers
    routeLayersRef.current.forEach(l => map.removeLayer(l));
    routeLayersRef.current = [];

    if (plannedRoute && plannedRoute.path.length > 1) {
      // Draw route background (thicker, for outline effect)
      const bgLayer = L.polyline(
        plannedRoute.path.map(c => [c.latitude, c.longitude]),
        {
          color: '#000',
          weight: 10,
          opacity: 0.5,
          pane: "routePane"
        }
      ).addTo(map);
      routeLayersRef.current.push(bgLayer);

      // Draw main route line
      const routeLayer = L.polyline(
        plannedRoute.path.map(c => [c.latitude, c.longitude]),
        {
          color: palette.route || '#f97316',
          weight: 6,
          opacity: 0.9,
          pane: "routePane"
        }
      ).addTo(map);
      routeLayersRef.current.push(routeLayer);

      // Add start marker
      if (plannedRoute.path.length > 0) {
        const startCoord = plannedRoute.path[0];
        const startMarker = L.circleMarker(
          [startCoord.latitude, startCoord.longitude],
          {
            radius: 10,
            fillColor: '#22c55e',
            color: '#fff',
            weight: 3,
            fillOpacity: 1,
            pane: "routePane"
          }
        ).addTo(map);
        startMarker.bindTooltip('Start', { permanent: false, direction: 'top' });
        routeLayersRef.current.push(startMarker);
      }

      // Add end marker (if different from start)
      if (plannedRoute.path.length > 1) {
        const endCoord = plannedRoute.path[plannedRoute.path.length - 1];
        const startCoord = plannedRoute.path[0];
        const isSamePoint = 
          Math.abs(endCoord.latitude - startCoord.latitude) < 0.0001 &&
          Math.abs(endCoord.longitude - startCoord.longitude) < 0.0001;
        
        if (!isSamePoint) {
          const endMarker = L.circleMarker(
            [endCoord.latitude, endCoord.longitude],
            {
              radius: 10,
              fillColor: '#ef4444',
              color: '#fff',
              weight: 3,
              fillOpacity: 1,
              pane: "routePane"
            }
          ).addTo(map);
          endMarker.bindTooltip('End', { permanent: false, direction: 'top' });
          routeLayersRef.current.push(endMarker);
        }
      }

      // Add direction arrows along the route
      const totalPoints = plannedRoute.path.length;
      const arrowInterval = Math.max(1, Math.floor(totalPoints / 10)); // ~10 arrows
      
      for (let i = arrowInterval; i < totalPoints - 1; i += arrowInterval) {
        const current = plannedRoute.path[i];
        const next = plannedRoute.path[Math.min(i + 1, totalPoints - 1)];
        
        // Calculate bearing
        const bearing = Math.atan2(
          next.longitude - current.longitude,
          next.latitude - current.latitude
        ) * (180 / Math.PI);

        const arrowMarker = L.marker([current.latitude, current.longitude], {
          icon: L.divIcon({
            className: 'route-arrow',
            html: `<div style="
              transform: rotate(${90 - bearing}deg);
              color: ${palette.route || '#f97316'};
              font-size: 16px;
              font-weight: bold;
              text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
            ">▶</div>`,
            iconSize: [16, 16],
            iconAnchor: [8, 8]
          }),
          pane: "routePane"
        }).addTo(map);
        routeLayersRef.current.push(arrowMarker);
      }
    }
  }, [plannedRoute]);

  // Draw polygon
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear old polygon layers
    polygonLayersRef.current.forEach(l => map.removeLayer(l));
    polygonLayersRef.current = [];

    if (polygon.length === 0) return;

    // Draw polygon lines (and fill if closed) first so points render on top
    if (polygon.length >= 2) {
      const latlngs = polygon.map(p => [p.latitude, p.longitude] as [number, number]);
      
      // Close the polygon if 3+ points
      if (polygon.length >= 3) {
        latlngs.push([polygon[0].latitude, polygon[0].longitude]);
      }
      
      const polyline = L.polygon(latlngs, {
        color: palette.accent,
        weight: 2,
        fillColor: palette.accent,
        fillOpacity: polygon.length >= 3 ? 0.15 : 0,
        dashArray: polygon.length < 3 ? '5, 10' : undefined,
        pane: "polygonPane"
      }).addTo(map);
      
      polygonLayersRef.current.push(polyline);
    }

    // Draw polygon points as markers
    polygon.forEach((point) => {
      const marker = L.circleMarker([point.latitude, point.longitude], {
        radius: 7,
        color: '#fff',
        fillColor: palette.accent,
        fillOpacity: 1,
        weight: 2,
        pane: "polygonPane"
      }).addTo(map);
      
      polygonLayersRef.current.push(marker);
    });
  }, [polygon]);

  // Handle map clicks for pin placement and polygon drawing
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleClick = (e: L.LeafletMouseEvent) => {
      if (pinMode && onMapClick) {
        onMapClick(e.latlng.lat, e.latlng.lng);
      } else if (isDrawingPolygon && onPolygonClick) {
        onPolygonClick(e.latlng.lat, e.latlng.lng);
      }
    };

    map.on('click', handleClick);
    
    // Change cursor when in pin mode or drawing polygon
    const container = map.getContainer();
    if (pinMode || isDrawingPolygon) {
      container.style.cursor = 'crosshair';
    } else {
      container.style.cursor = '';
    }

    return () => {
      map.off('click', handleClick);
      container.style.cursor = '';
    };
  }, [pinMode, onMapClick, isDrawingPolygon, onPolygonClick]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
