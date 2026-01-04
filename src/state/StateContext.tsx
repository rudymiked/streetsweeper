import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { StravaActivity } from '../services/Services';

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
        console.log(`Loaded ${ways.length} streets from ${mirror}`);
        return;
      } catch (err) {
        console.error(`loadStreetsFromOSM attempt ${attempt + 1} error:`, err);
        if (attempt === mirrors.length - 1) throw err;
      }
    }
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
