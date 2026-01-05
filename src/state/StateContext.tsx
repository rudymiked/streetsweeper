import React, { createContext, useContext, useState, ReactNode } from 'react';
import { streetWasRun } from '../utils/streetMatching';

export type StravaActivity = {
  // Core identifiers
  id: number;
  name: string;
  type: string;
  sport_type: string;
  resource_state: number;

  // Timing + distance
  distance: number;
  moving_time: number;
  elapsed_time: number;
  start_date: string;
  start_date_local: string;
  utc_offset: number;

  // Location
  start_latlng: [number, number] | null;
  end_latlng: [number, number] | null;
  location_city: string | null;
  location_state: string | null;
  location_country: string | null;
  timezone: string;

  // Elevation
  elev_high: number;
  elev_low: number;
  total_elevation_gain: number;

  // Heart rate
  has_heartrate: boolean;
  average_heartrate?: number;
  max_heartrate?: number;
  heartrate_opt_out: boolean;
  display_hide_heartrate_option: boolean;

  // Speed / power
  average_speed: number;
  max_speed: number;
  average_watts?: number;
  kilojoules?: number;
  device_watts: boolean;

  // Counts
  achievement_count: number;
  athlete_count: number;
  comment_count: number;
  kudos_count: number;
  photo_count: number;
  total_photo_count: number;
  pr_count: number;

  // Flags
  commute: boolean;
  manual: boolean;
  private: boolean;
  flagged: boolean;
  trainer: boolean;
  from_accepted_tag: boolean;
  has_kudoed: boolean;

  // Athlete + gear
  athlete: {
    id: number;
    resource_state: number;
  };
  gear_id: string | null;
  device_name?: string;

  // Map + polyline
  map: {
    id: string;
    summary_polyline: string | null;
    resource_state: number;
  };
  polyline?: string; // your extracted summary polyline
  coords: Array<{ latitude: number; longitude: number }>; // decoded polyline

  // Upload metadata
  external_id: string | null;
  upload_id: number | null;
  upload_id_str: string | null;

  // Misc
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
  loadStreetsFromOSM: (center?: Center, miles?: number) => Promise<void>;
  markStreetsRunByActivities: (activities: StravaActivity[]) => void;
  loadStreetsFromStravaActivities: (activities: StravaActivity[]) => Promise<void>;
};

const ctx = createContext<StateContextType | undefined>(undefined);

const initialCenter: Center = { name: 'Saved Home', latitude: Number.parseFloat(process.env.DEFAULT_MAP_CENTER_LATITUDE || '47.667120970606'), longitude: Number.parseFloat(process.env.DEFAULT_MAP_CENTER_LONGITUDE || '-122.38431335074893') };

export const StateProvider = ({ children }: { children: ReactNode }) => {
  const [center, setCenter] = useState<Center>(initialCenter);
  const [radiusMiles, setRadiusMiles] = useState<number>(2);
  const [streets, setStreets] = useState<Street[]>([]);
  const [activities, setActivities] = useState<StravaActivity[]>([]);
  const [showCompleted, setShowCompleted] = useState<boolean>(true);
  const [showUnrun, setShowUnrun] = useState<boolean>(true);

  async function loadStreetsFromStravaActivities(activities: StravaActivity[]) {
    console.log('Loading streets from Strava activities in state...');

    const streets: Street[] = activities
      .filter(a => a.map.summary_polyline && a.map.summary_polyline.length > 0)
      .map(a => {
        let coords: { latitude: number; longitude: number }[] = [];

        try {
          const decoded = decodePolyline(a.map.summary_polyline || '');
          coords = decoded.map((point: Coord) => ({
            latitude: point.latitude,
            longitude: point.longitude,
          }));
        } catch (err) {
          console.warn(`Failed to decode polyline for activity ${a.id}`, err);
        }

        return {
          id: String(a.id),
          name: a.name || `Activity ${a.id}`,
          completed: true,
          coords,
        };
      });

    setStreets(streets);
    markStreetsRunByActivities(activities);

    console.log(`Loaded ${streets.length} streets from Strava activities`);
  }

  // Load streets from OpenStreetMap via Overpass API within radius (miles) of center.
  async function loadStreetsFromOSM(centerParam?: Center, miles?: number) {
    const mirrors = [
      'https://overpass-api.de/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter',
      'https://z.overpass-api.de/api/interpreter',
    ];

    const c = centerParam || initialCenter;
    const rMiles = typeof miles === 'number' ? miles : radiusMiles || 2;
    const radiusMeters = Math.round(rMiles * 1609.344);

    // Limit query to common residential/secondary streets to reduce server load
    const query = `[out:json][timeout:20];(way["highway"~"^(residential|tertiary|secondary)$"](around:${radiusMeters},${c.latitude},${c.longitude}););out geom;`;

    for (let attempt = 0; attempt < mirrors.length; attempt++) {
      try {
        const mirror = mirrors[attempt];
        console.log(`Trying Overpass mirror ${attempt + 1}/${mirrors.length}: ${mirror}`);

        const res = await fetch(mirror, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `data=${encodeURIComponent(query)}`,
        });

        if (!res.ok) {
          console.warn(`Mirror ${mirror} failed: ${res.status}`);
          if (attempt < mirrors.length - 1) continue;
          throw new Error(`All Overpass mirrors failed (last: ${res.status})`);
        }

        const json = await res.json();
        const elems = json.elements || [];

        const ways = elems
          .filter((e: any) => e.type === 'way' && e.geometry && e.geometry.length > 0)
          .map((w: any) => ({
            id: String(w.id),
            name: (w.tags && (w.tags.name || w.tags.ref)) || `OSM ${w.id}`,
            completed: false,
            coords: w.geometry.map((g: any) => ({ latitude: g.lat, longitude: g.lon })),
          } as Street));

        setStreets(ways);
        return;
      } catch (err) {
        console.error(`loadStreetsFromOSM attempt ${attempt + 1} error:`, err);
        if (attempt === mirrors.length - 1) throw err;
      }
    }
  }

  function pointDistanceMiles(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
    const toRad = (v: number) => (v * Math.PI) / 180;
    const R = 6371e3; // meters
    const φ1 = toRad(a.latitude);
    const φ2 = toRad(b.latitude);
    const Δφ = toRad(b.latitude - a.latitude);
    const Δλ = toRad(b.longitude - a.longitude);
    const aa = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
    const meters = R * c;
    return meters / 1609.344;
  }

  // Better matching: compute segment-to-segment minimum distance (meters) between
  // activity polylines and street polylines. If below threshold, mark street completed.
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
    const mPerDegLat = 111320; // approximate
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

  function segmentToSegmentDistanceMeters(a1deg: { latitude: number; longitude: number }, a2deg: { latitude: number; longitude: number }, b1deg: { latitude: number; longitude: number }, b2deg: { latitude: number; longitude: number }) {
    // use mean latitude as reference for local projection
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

  function markStreetsRunByActivities(activities: StravaActivity[]) {
    setStreets(prev =>
      prev.map(street => {
        const wasRun = activities.some(act => {
          const coords = decodePolyline(act.map.summary_polyline || '');
          return streetWasRun(street.coords, coords, 30);
        });

        return { ...street, completed: wasRun };
      })
    );
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
        markStreetsRunByActivities,
        loadStreetsFromStravaActivities,
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
