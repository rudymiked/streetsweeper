import React, { createContext, useContext, useState, ReactNode } from 'react';
import { sleep } from '../utils/utils';

export type StravaActivity = {
  id: number;
  name: string;
  type: string;
  sport_type: string;
  resource_state: number;

  distance: number;
  moving_time: number;
  elapsed_time: number;
  start_date: string;
  start_date_local: string;
  utc_offset: number;

  start_latlng: [number, number] | null;
  end_latlng: [number, number] | null;
  location_city: string | null;
  location_state: string | null;
  location_country: string | null;
  timezone: string;

  elev_high: number;
  elev_low: number;
  total_elevation_gain: number;

  has_heartrate: boolean;
  average_heartrate?: number;
  max_heartrate?: number;
  heartrate_opt_out: boolean;
  display_hide_heartrate_option: boolean;

  average_speed: number;
  max_speed: number;
  average_watts?: number;
  kilojoules?: number;
  device_watts: boolean;

  achievement_count: number;
  athlete_count: number;
  comment_count: number;
  kudos_count: number;
  photo_count: number;
  total_photo_count: number;
  pr_count: number;

  commute: boolean;
  manual: boolean;
  private: boolean;
  flagged: boolean;
  trainer: boolean;
  from_accepted_tag: boolean;
  has_kudoed: boolean;

  athlete: {
    id: number;
    resource_state: number;
  };
  gear_id: string | null;
  device_name?: string;

  map: {
    id: string;
    summary_polyline: string | null;
    resource_state: number;
  };

  polyline?: string;
  coords: Array<{ latitude: number; longitude: number }>;

  external_id: string | null;
  upload_id: number | null;
  upload_id_str: string | null;

  suffer_score?: number;
  workout_type?: number;
  visibility?: string;
};

type Center = { name: string; latitude: number; longitude: number };
type Coord = { latitude: number; longitude: number };
type Street = { id: string; name: string; completed: boolean; coords: Coord[] };

type StateContextType = {
  center: Center;
  setCenter: (c: Center) => void;
  radiusMiles: number;
  setRadiusMiles: (r: number) => void;
  streets: Street[];
  toggleStreet: (id: string) => void;
  markManyComplete: (count?: number) => void;
  activities: StravaActivity[];
  setActivities: (a: StravaActivity[]) => void;
  showCompleted: boolean;
  setShowCompleted: (v: boolean) => void;
  showUnrun: boolean;
  setShowUnrun: (v: boolean) => void;
  loadStreetsFromOSM: (center?: Center, miles?: number) => Promise<Street[]>;
  loadStreetsFromStravaActivities: (activities: StravaActivity[]) => Promise<StravaActivity[]>;
  markStreetsRunByActivitiesAsync: (
    streetsInput: Street[],
    activities: StravaActivity[],
    toleranceMeters?: number
  ) => Promise<Street[]>;
  loadAndMatchStreets: (center: Center, radiusMiles: number, activities: StravaActivity[]) => Promise<void>;
};

const ctx = createContext<StateContextType | undefined>(undefined);

const initialCenter: Center = {
  name: 'Saved Home',
  latitude: Number.parseFloat(process.env.EXPO_PUBLIC_DEFAULT_MAP_CENTER_LATITUDE || '47.667120970606'),
  longitude: Number.parseFloat(process.env.EXPO_PUBLIC_DEFAULT_MAP_CENTER_LONGITUDE || '-122.38431335074893'),
};

export const StateProvider = ({ children }: { children: ReactNode }) => {
  const [center, setCenter] = useState<Center>(initialCenter);
  const [radiusMiles, setRadiusMiles] = useState<number>(
    process.env.DEFAULT_RADIUS_MILES ? Number.parseFloat(process.env.DEFAULT_RADIUS_MILES) : 2
  );
  const [streets, setStreets] = useState<Street[]>([]);
  const [activities, setActivities] = useState<StravaActivity[]>([]);
  const [showCompleted, setShowCompleted] = useState<boolean>(true);
  const [showUnrun, setShowUnrun] = useState<boolean>(true);

  async function loadStreetsFromOSM(centerParam?: Center, miles?: number): Promise<Street[]> {
    const mirrors = [
      'https://streetsweeper-overpass-hjbthgeffjdqe0hf.westus2-01.azurewebsites.net/api/overpass',
      `${process.env.EXPO_PUBLIC_OSM_OVERPASS_API_URL}`,
      `${process.env.EXPO_PUBLIC_OSM_OVERPASS_API_URL_TWO}`,
      `${process.env.EXPO_PUBLIC_OSM_OVERPASS_API_URL_THREE}`,
    ];

    const c = centerParam || initialCenter;
    const rMiles = typeof miles === 'number' ? miles : radiusMiles || 2;
    const radiusMeters = Math.round(rMiles * 1609.344);

    const query = `[out:json];way["highway"~"residential|living_street|service|unclassified|tertiary|secondary"](around:${radiusMeters},${c.latitude},${c.longitude});out geom;`;

    for (let attempt = 0; attempt < mirrors.length; attempt++) {
      try {
        const mirror = mirrors[attempt];
        console.log(`Trying Overpass mirror: ${attempt + 1}/${mirrors.length}: ${mirror}`);

        const url = `${mirror}?data=${encodeURIComponent(query)}`;
        console.log(url);

        const res = await fetch(url, { method: 'GET' });

        if (!res.ok) {
          console.warn(`Mirror ${mirror} failed: ${res.status}`);
          if (attempt < mirrors.length - 1) continue;
          throw new Error(`All Overpass mirrors failed (last: ${res.status})`);
        }

        const json = await res.json();
        const elems = json.elements || [];

        const ways: Street[] = elems
          .filter((e: any) => e.type === 'way' && e.geometry && e.geometry.length > 0)
          .map(
            (w: any) =>
              ({
                id: String(w.id),
                name: (w.tags && (w.tags.name || w.tags.ref)) || `OSM ${w.id}`,
                completed: false,
                coords: w.geometry.map((g: any) => ({ latitude: g.lat, longitude: g.lon })),
              } as Street)
          );

        console.log('OSM ways count:', ways.length);
        setStreets(ways);
        return ways;
      } catch (err) {
        console.error(`loadStreetsFromOSM attempt ${attempt + 1} error:`, err);
        if (attempt === mirrors.length - 1) throw err;
      }
    }

    return [];
  }

  function decodePolyline(polylineStr: string) {
    const coords: { latitude: number; longitude: number }[] = [];
    let index = 0;
    let lat = 0;
    let lng = 0;

    while (index < polylineStr.length) {
      let result = 0;
      let shift = 0;
      let byte = 0;

      do {
        byte = polylineStr.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);

      lat += (result & 1) ? ~(result >> 1) : result >> 1;

      result = 0;
      shift = 0;
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

  function degToMeters(p: { latitude: number; longitude: number }, refLat = p.latitude) {
    const latRad = (refLat * Math.PI) / 180;
    const mPerDegLat = 111320;
    const mPerDegLon = Math.cos(latRad) * 111320;
    return { x: p.longitude * mPerDegLon, y: p.latitude * mPerDegLat };
  }

  function pointToSegmentDistanceMeters(pt: { x: number; y: number }, v: { x: number; y: number }, w: { x: number; y: number }) {
    const l2 = (w.x - v.x) * (w.x - v.x) + (w.y - v.y) * (w.y - v.y);
    if (l2 === 0) return Math.hypot(pt.x - v.x, pt.y - v.y);
    const t = Math.max(0, Math.min(1, ((pt.x - v.x) * (w.x - v.x) + (pt.y - v.y) * (w.y - v.y)) / l2));
    const proj = { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) };
    return Math.hypot(pt.x - proj.x, pt.y - proj.y);
  }

  function segmentsIntersect(a1: { x: number; y: number }, a2: { x: number; y: number }, b1: { x: number; y: number }, b2: { x: number; y: number }) {
    function orient(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) {
      return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    }
    const o1 = orient(a1, a2, b1);
    const o2 = orient(a1, a2, b2);
    const o3 = orient(b1, b2, a1);
    const o4 = orient(b1, b2, a2);
    return o1 * o2 <= 0 && o3 * o4 <= 0;
  }

  function streetWasRun(streetCoords: Coord[], activityCoords: Coord[], toleranceMeters = 20) {
    if (!streetCoords?.length || !activityCoords?.length) return false;

    for (let i = 0; i < streetCoords.length - 1; i++) {
      const a1 = streetCoords[i];
      const a2 = streetCoords[i + 1];

      for (let j = 0; j < activityCoords.length - 1; j++) {
        const b1 = activityCoords[j];
        const b2 = activityCoords[j + 1];

        const dist = segmentToSegmentDistanceMeters(a1, a2, b1, b2);
        if (dist < toleranceMeters) return true;
      }
    }

    return false;
  }

  function segmentToSegmentDistanceMeters(
    a1deg: { latitude: number; longitude: number },
    a2deg: { latitude: number; longitude: number },
    b1deg: { latitude: number; longitude: number },
    b2deg: { latitude: number; longitude: number }
  ) {
    const meanLat = (a1deg.latitude + a2deg.latitude + b1deg.latitude + b2deg.latitude) / 4;
    const a1 = degToMeters({ latitude: a1deg.latitude, longitude: a1deg.longitude }, meanLat);
    const a2 = degToMeters({ latitude: a2deg.latitude, longitude: a2deg.longitude }, meanLat);
    const b1 = degToMeters({ latitude: b1deg.latitude, longitude: b1deg.longitude }, meanLat);
    const b2 = degToMeters({ latitude: b2deg.latitude, longitude: b2deg.longitude }, meanLat);

    if (segmentsIntersect(a1, a2, b1, b2)) return 0;

    const d1 = pointToSegmentDistanceMeters(a1, b1, b2);
    const d2 = pointToSegmentDistanceMeters(a2, b1, b2);
    const d3 = pointToSegmentDistanceMeters(b1, a1, a2);
    const d4 = pointToSegmentDistanceMeters(b2, a1, a2);
    return Math.min(d1, d2, d3, d4);
  }

  async function markStreetsRunByActivitiesAsync(
    streetsInput: Street[],
    activities: StravaActivity[],
    toleranceMeters = 20
  ): Promise<Street[]> {
    console.log('▶ markStreetsRunByActivitiesAsync START', streetsInput.length, 'streets');

    const updated: Street[] = [];
    const chunkSize = 50;

    for (let i = 0; i < streetsInput.length; i += chunkSize) {
      console.log('  → Matching chunk', i, 'to', i + chunkSize);

      const chunk = streetsInput.slice(i, i + chunkSize);

      for (const street of chunk) {
        const wasRun = activities.some(act => {
          try {
            if (!act.map.summary_polyline) return false;
            const coords = decodePolyline(act.map.summary_polyline || '');
            return streetWasRun(street.coords, coords, toleranceMeters);
          } catch (err) {
            console.log('      ✗ Error matching street', street.id, err);
            return false;
          }
        });

        updated.push({ ...street, completed: wasRun });
      }

      console.log('  → Yielding to UI');
      await sleep(0);
    }

    console.log('▶ markStreetsRunByActivitiesAsync DONE');
    return updated;
  }

  async function loadStreetsFromStravaActivities(activitiesRaw: StravaActivity[]): Promise<StravaActivity[]> {
    console.log('▶ loadStreetsFromStravaActivities START', activitiesRaw.length);

    const enriched: StravaActivity[] = [];
    const chunkSize = 50;

    for (let i = 0; i < activitiesRaw.length; i += chunkSize) {
      const chunk = activitiesRaw.slice(i, i + chunkSize);

      for (const a of chunk) {
        let coords: Coord[] = [];

        if (a.map.summary_polyline) {
          try {
            const decoded = decodePolyline(a.map.summary_polyline || '');
            coords = decoded.map(p => ({ latitude: p.latitude, longitude: p.longitude }));
          } catch (err) {
            console.warn(`Failed to decode polyline for activity ${a.id}`, err);
          }
        }

        enriched.push({
          ...a,
          coords,
        });
      }

      await sleep(0);
    }

    console.log('▶ loadStreetsFromStravaActivities DONE, enriched:', enriched.length);
    setActivities(enriched);
    return enriched;
  }

  async function loadAndMatchStreets(center: Center, radiusMiles: number, activitiesForMatch: StravaActivity[]) {
    console.log('loadAndMatchStreets', center, radiusMiles, activitiesForMatch.length);

    const baseStreets = await loadStreetsFromOSM(center, radiusMiles);
    if (!baseStreets.length) {
      console.log('No OSM streets loaded; skipping matching');
      setStreets([]);
      return;
    }

    const updated = await markStreetsRunByActivitiesAsync(baseStreets, activitiesForMatch, 20);
    setStreets(updated);
  }

  function toggleStreet(id: string) {
    setStreets(s => s.map(st => (st.id === id ? { ...st, completed: !st.completed } : st)));
  }

  function markManyComplete(count = 5) {
    setStreets(s => {
      const copy = [...s];
      for (let i = 0; i < Math.min(count, copy.length); i++) {
        copy[i] = { ...copy[i], completed: true };
      }
      return copy;
    });
  }

  return (
    <ctx.Provider
      value={{
        center,
        setCenter,
        radiusMiles,
        setRadiusMiles,
        streets,
        toggleStreet,
        markManyComplete,
        activities,
        setActivities,
        showCompleted,
        setShowCompleted,
        showUnrun,
        setShowUnrun,
        loadStreetsFromOSM,
        loadStreetsFromStravaActivities,
        markStreetsRunByActivitiesAsync,
        loadAndMatchStreets,
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
