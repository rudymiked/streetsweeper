import React, { createContext, useContext, useState, ReactNode } from 'react';
import { sleep } from '../utils/utils';

export type StravaActivity = {
  id: number;
  name: string;
  map: { id: string; summary_polyline: string | null };
  coords: Array<{ latitude: number; longitude: number }>;
  [key: string]: any;
};

type Center = { name: string; latitude: number; longitude: number };
type Coord = { latitude: number; longitude: number };
type Street = { id: string; name: string; completed: boolean; coords: Coord[] };

type StateContextType = {
  center: Center;
  setCenter: (c: Center) => void;
  radiusMiles: number;
  setRadiusMiles: (r: number) => void;
  showCompleted: boolean;
  setShowCompleted: (b: boolean) => void;
  showUnrun: boolean;
  setShowUnrun: (b: boolean) => void;
  toggleStreet: (id: string) => void;
  streets: Street[];
  activities: StravaActivity[];
  loadStreetsFromOSM: (center?: Center, miles?: number) => Promise<Street[]>;
  loadStreetsFromStravaActivities: (activities: StravaActivity[]) => Promise<StravaActivity[]>;
  markStreetsRunByActivitiesAsync: (
    streetsInput: Street[],
    activities: StravaActivity[],
    toleranceMeters?: number
  ) => Promise<Street[]>;
  loadAndMatchStreets: (center: Center, radiusMiles: number, activities: StravaActivity[]) => Promise<void>;

  progress: number;
  progressMessage: string | null;
  setProgress: (n: number) => void;
  setProgressMessage: (s: string | null) => void;
};

const ctx = createContext<StateContextType | undefined>(undefined);

const initialCenter: Center = {
  name: 'Saved Home',
  latitude: Number.parseFloat(process.env.EXPO_PUBLIC_DEFAULT_MAP_CENTER_LATITUDE || '47.667120970606'),
  longitude: Number.parseFloat(process.env.EXPO_PUBLIC_DEFAULT_MAP_CENTER_LONGITUDE || '-122.38431335074893'),
};

export const StateProvider = ({ children }: { children: ReactNode }) => {
  const [center, setCenter] = useState<Center>(initialCenter);
  const [radiusMiles, setRadiusMiles] = useState<number>(2);
  const [streets, setStreets] = useState<Street[]>([]);
  const [activities, setActivities] = useState<StravaActivity[]>([]);
  const [showCompleted, setShowCompleted] = useState<boolean>(true);
  const [showUnrun, setShowUnrun] = useState<boolean>(true);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);

  function toggleStreet(id: string) {
    setStreets(s =>
      s.map(st =>
        st.id === id ? { ...st, completed: !st.completed } : st
      )
    );
  }

  function resetProgress() {
    setTimeout(() => {
      setProgress(0);
      setProgressMessage(null);
    }, 800);
  }

  function milesToBBox(lat: number, lon: number, radiusMiles: number) {
    const R = 6371e3;
    const d = radiusMiles * 1609.344;

    const latDelta = (d / R) * (180 / Math.PI);
    const lonDelta = (d / (R * Math.cos((lat * Math.PI) / 180))) * (180 / Math.PI);

    return {
      minLat: lat - latDelta,
      maxLat: lat + latDelta,
      minLon: lon - lonDelta,
      maxLon: lon + lonDelta,
    };
  }

  async function loadStreetsFromOSM(centerParam?: Center, miles?: number): Promise<Street[]> {
    const mirrors = [
      "https://streetsweeper-overpass-hjbthgeffjdqe0hf.westus2-01.azurewebsites.net/api/overpass",
      `${process.env.EXPO_PUBLIC_OSM_OVERPASS_API_URL}`,
      `${process.env.EXPO_PUBLIC_OSM_OVERPASS_API_URL_TWO}`,
      `${process.env.EXPO_PUBLIC_OSM_OVERPASS_API_URL_THREE}`,
    ];

    const c = centerParam || initialCenter;
    const rMiles = typeof miles === "number" ? miles : radiusMiles;

    const bbox = milesToBBox(c.latitude, c.longitude, rMiles);

    const query = `
      [out:json][timeout:25];
      (
        way["highway"~"^(residential|tertiary|secondary)$"]
          (${bbox.minLat},${bbox.minLon},${bbox.maxLat},${bbox.maxLon});
      );
      out geom;
    `;

    setProgressMessage("Loading OSM streets...");
    setProgress(0);

    for (let attempt = 0; attempt < mirrors.length; attempt++) {
      try {
        const mirror = mirrors[attempt];
        const url = `${mirror}?data=${encodeURIComponent(query)}`;

        const res = await fetch(url);
        if (!res.ok) {
          if (attempt < mirrors.length - 1) continue;
          throw new Error(`Overpass failed: ${res.status}`);
        }

        const json = await res.json();
        const elems = json.elements || [];

        const ways: Street[] = elems
          .filter((e: any) => e.type === "way" && e.geometry?.length)
          .map((w: any) => ({
            id: String(w.id),
            name: w.tags?.name || w.tags?.ref || `OSM ${w.id}`,
            completed: false,
            coords: w.geometry.map((g: any) => ({ latitude: g.lat, longitude: g.lon })),
          }));

        setProgress(100);
        setProgressMessage("OSM streets loaded");

        setStreets(ways);
        return ways;
      } catch (err) {
        if (attempt === mirrors.length - 1) throw err;
      }
    }

    return [];
  }

  function decodePolyline(polylineStr: string) {
    const coords: Coord[] = [];
    let index = 0, lat = 0, lng = 0;

    while (index < polylineStr.length) {
      let result = 0, shift = 0, byte = 0;

      do {
        byte = polylineStr.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);

      lat += (result & 1) ? ~(result >> 1) : result >> 1;

      result = 0; shift = 0;
      do {
        byte = polylineStr.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);

      lng += (result & 1) ? ~(result >> 1) : result >> 1;

      coords.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
    }

    return coords;
  }

  function degToMeters(p: Coord, refLat = p.latitude) {
    const latRad = (refLat * Math.PI) / 180;
    return {
      x: p.longitude * Math.cos(latRad) * 111320,
      y: p.latitude * 111320,
    };
  }

  function pointToSegmentDistanceMeters(pt: any, v: any, w: any) {
    const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2;
    if (l2 === 0) return Math.hypot(pt.x - v.x, pt.y - v.y);
    const t = Math.max(0, Math.min(1, ((pt.x - v.x) * (w.x - v.x) + (pt.y - v.y) * (w.y - v.y)) / l2));
    const proj = { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) };
    return Math.hypot(pt.x - proj.x, pt.y - proj.y);
  }

  function segmentsIntersect(a1: any, a2: any, b1: any, b2: any) {
    function orient(a: any, b: any, c: any) {
      return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    }
    const o1 = orient(a1, a2, b1);
    const o2 = orient(a1, a2, b2);
    const o3 = orient(b1, b2, a1);
    const o4 = orient(b1, b2, a2);
    return o1 * o2 <= 0 && o3 * o4 <= 0;
  }

  function streetWasRun(streetCoords: Coord[], activityCoords: Coord[], toleranceMeters = 20) {
    if (!streetCoords.length || !activityCoords.length) return false;

    for (let i = 0; i < streetCoords.length - 1; i++) {
      const a1 = streetCoords[i];
      const a2 = streetCoords[i + 1];

      for (let j = 0; j < activityCoords.length - 1; j++) {
        const b1 = activityCoords[j];
        const b2 = activityCoords[j + 1];

        const meanLat = (a1.latitude + a2.latitude + b1.latitude + b2.latitude) / 4;

        const A1 = degToMeters(a1, meanLat);
        const A2 = degToMeters(a2, meanLat);
        const B1 = degToMeters(b1, meanLat);
        const B2 = degToMeters(b2, meanLat);

        if (segmentsIntersect(A1, A2, B1, B2)) return true;

        const d1 = pointToSegmentDistanceMeters(A1, B1, B2);
        const d2 = pointToSegmentDistanceMeters(A2, B1, B2);
        const d3 = pointToSegmentDistanceMeters(B1, A1, A2);
        const d4 = pointToSegmentDistanceMeters(B2, A1, A2);

        if (Math.min(d1, d2, d3, d4) < toleranceMeters) return true;
      }
    }

    return false;
  }

  async function markStreetsRunByActivitiesAsync(
    streetsInput: Street[],
    activities: StravaActivity[],
    toleranceMeters = 20
  ): Promise<Street[]> {
    const updated: Street[] = [];
    const chunkSize = 50;
    const total = streetsInput.length;

    setProgressMessage("Matching streets...");
    setProgress(0);

    for (let i = 0; i < streetsInput.length; i += chunkSize) {
      const chunk = streetsInput.slice(i, i + chunkSize);

      for (const street of chunk) {
        const wasRun = activities.some(act => {
          if (!act.map.summary_polyline) return false;
          const coords = decodePolyline(act.map.summary_polyline);
          return streetWasRun(street.coords, coords, toleranceMeters);
        });

        updated.push({ ...street, completed: wasRun });
      }

      setProgress(Math.round((updated.length / total) * 100));
      await sleep(0);
    }

    setProgressMessage("Matching complete");
    resetProgress();

    return updated;
  }

  async function loadStreetsFromStravaActivities(raw: StravaActivity[]): Promise<StravaActivity[]> {
    const enriched: StravaActivity[] = [];
    const chunkSize = 50;
    const total = raw.length;

    setProgressMessage("Decoding Strava activities...");
    setProgress(0);

    for (let i = 0; i < raw.length; i += chunkSize) {
      const chunk = raw.slice(i, i + chunkSize);

      for (const a of chunk) {
        let coords: Coord[] = [];
        if (a.map.summary_polyline) {
          try {
            coords = decodePolyline(a.map.summary_polyline);
          } catch { }
        }

        enriched.push({ ...a, coords });
      }

      setProgress(Math.round((enriched.length / total) * 100));
      await sleep(0);
    }

    setProgressMessage("Strava processing complete");
    resetProgress();

    setActivities(enriched);
    return enriched;
  }

  async function loadAndMatchStreets(center: Center, radiusMiles: number, activitiesForMatch: StravaActivity[]) {
    const base = await loadStreetsFromOSM(center, radiusMiles);
    if (!base.length) {
      setStreets([]);
      return;
    }

    const updated = await markStreetsRunByActivitiesAsync(base, activitiesForMatch, 20);
    setStreets(updated);
    resetProgress();
  }

  return (
    <ctx.Provider
      value={{
        center,
        setCenter,
        radiusMiles,
        setRadiusMiles,
        streets,
        activities,
        loadStreetsFromOSM,
        loadStreetsFromStravaActivities,
        markStreetsRunByActivitiesAsync,
        loadAndMatchStreets,

        // Progress system
        progress,
        progressMessage,
        setProgress,
        setProgressMessage,

        // Visibility filters
        showCompleted,
        setShowCompleted,
        showUnrun,
        setShowUnrun,

        // Manual toggling
        toggleStreet,
      }}
    >

      {children}
    </ctx.Provider>
  );
};

export function useAppState() {
  const v = useContext(ctx);
  if (!v) throw new Error('useAppState must be used within StateProvider');
  return v;
}
