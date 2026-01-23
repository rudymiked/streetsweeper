import React, { createContext, useContext, useState, ReactNode } from 'react';
import { sleep } from '../utils/utils';
import { decodePolyline } from './core/decodePolyline';
import { Street } from './matching/matcher_kdtree';
import { classify, computeConfidencePerStreet } from '../utils/debug/debugConfidence';
import { matchStreets, matchStreetsAI } from './matching/matcher';
import { getEnv } from '../utils/getEnv';
import { Coord } from './core/geometry/base';

export type StravaActivity = {
  id: number;
  name: string;
  map: { id: string; summary_polyline: string | null };
  coords: Array<{ latitude: number; longitude: number }>;
  [key: string]: any;
};

type Center = { name: string; latitude: number; longitude: number };

type ManualEdit = {
  id: string;
  originalCompleted: boolean;
  newCompleted: boolean;
  timestamp: number;
};

type StateContextType = {
  center: Center;
  setCenter: (c: Center) => void;
  radiusMiles: number;
  setRadiusMiles: (r: number) => void;
  mapTheme: 'dark' | 'light';
  setMapTheme: (t: 'dark' | 'light') => void;
  showCompleted: boolean;
  setShowCompleted: (b: boolean) => void;
  showUnrun: boolean;
  setShowUnrun: (b: boolean) => void;
  showStravaOverlay: boolean;
  setShowStravaOverlay: (b: boolean) => void;
  showConfidenceOverlay: boolean;
  setShowConfidenceOverlay: (b: boolean) => void;
  toggleStreet: (id: string) => void;
  streets: Street[];
  activities: StravaActivity[];
  loadStreetsFromOSM: (center?: Center, miles?: number, injectedOSM?: any) => Promise<Street[]>;
  loadStreetsFromStravaActivities: (activities: StravaActivity[]) => Promise<StravaActivity[]>;
  loadAndMatchStreets: (center: Center, radiusMiles: number, activities: StravaActivity[], useAI: boolean, injectedOSM?: any) => Promise<void>;
  progress: number;
  progressMessage: string | null;
  setProgress: (n: number) => void;
  setProgressMessage: (s: string | null) => void;
  manualEdits: ManualEdit[];
  exportManualEdits: () => void;
};

const ctx = createContext<StateContextType | undefined>(undefined);

const initialCenter: Center = {
  name: 'Saved Home',
  latitude: Number.parseFloat(getEnv("EXPO_PUBLIC_DEFAULT_MAP_CENTER_LATITUDE") || '47.667120970606'),
  longitude: Number.parseFloat(getEnv("EXPO_PUBLIC_DEFAULT_MAP_CENTER_LONGITUDE") || '-122.38431335074893'),
};

export const StateProvider = ({ children }: { children: ReactNode }) => {
  const [center, setCenter] = useState<Center>(initialCenter);
  const [radiusMiles, setRadiusMiles] = useState<number>(3);
  const [mapTheme, setMapTheme] = useState<'dark' | 'light'>('dark');
  const [streets, setStreets] = useState<Street[]>([]);
  const [activities, setActivities] = useState<StravaActivity[]>([]);
  const [showCompleted, setShowCompleted] = useState<boolean>(true);
  const [showUnrun, setShowUnrun] = useState<boolean>(true);
  const [showStravaOverlay, setShowStravaOverlay] = useState<boolean>(false);
  const [showConfidenceOverlay, setShowConfidenceOverlay] = useState<boolean>(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const [manualEdits, setManualEdits] = useState<ManualEdit[]>([]);

  function toggleStreet(id: string) {
    console.log("street id:", id);
    setStreets(s => {
      const street = s.find(st => st.id === id);
      if (!street) return s;

      const newCompleted = !street.completed;
      
      // Record this manual edit
      setManualEdits(edits => {
        const existingEditIndex = edits.findIndex(e => e.id === id);
        const newEdit: ManualEdit = {
          id,
          originalCompleted: street.completed,
          newCompleted,
          timestamp: Date.now()
        };
        
        if (existingEditIndex >= 0) {
          // Update existing edit
          const updated = [...edits];
          updated[existingEditIndex] = newEdit;
          return updated;
        } else {
          // Add new edit
          return [...edits, newEdit];
        }
      });
      
      return s.map(st =>
        st.id === id ? { ...st, completed: newCompleted } : st
      );
    });
  }

  function resetProgress() {
    setTimeout(() => {
      setProgress(0);
      setProgressMessage(null);
    }, 800);
  }

  function exportManualEdits() {
    const alteredEdits = manualEdits.filter(edit => edit.originalCompleted !== edit.newCompleted);
    
    const exportData = {
      timestamp: new Date().toISOString(),
      location: center,
      editCount: alteredEdits.length,
      edits: alteredEdits.map(edit => {
        const street = streets.find(s => s.id === edit.id);
        return {
          id: edit.id,
          originalCompleted: edit.originalCompleted,
          newCompleted: edit.newCompleted,
          coords: street?.coords || [],
          timestamp: new Date(edit.timestamp).toISOString()
        };
      })
    };

    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `manual-edits-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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

  async function fetchStreetsFromOverpassAPI(mirrors: string[], query: string): Promise<any> {
    for (let attempt = 0; attempt < mirrors.length; attempt++) {
      try {
        const mirror = mirrors[attempt];
        const url = `${mirror}?data=${encodeURIComponent(query)}`;

        const res = await fetch(url);
        if (!res.ok) {
          if (attempt < mirrors.length - 1) continue;
          throw new Error(`Overpass failed: ${res.status}`);
        }

        return await res.json();

      } catch (err) {
        if (attempt === mirrors.length - 1) throw err;
      }

      return []; // Fallback empty
    }
  }

  async function loadStreetsFromOSM(centerParam?: Center, miles?: number, injectedOSM?: any): Promise<Street[]> {
    let json;

    if (injectedOSM) {
      json = injectedOSM;
    } else {
      const mirrors = [
        "https://streetsweeper-overpass-hjbthgeffjdqe0hf.westus2-01.azurewebsites.net/api/overpass",
        `${getEnv("EXPO_PUBLIC_OSM_OVERPASS_API_URL")}`,
        `${getEnv("EXPO_PUBLIC_OSM_OVERPASS_API_URL_TWO")}`,
        `${getEnv("EXPO_PUBLIC_OSM_OVERPASS_API_URL_THREE")}`,
      ];

      const c = centerParam || initialCenter;
      const rMiles = typeof miles === "number" ? miles : radiusMiles;

      const bbox = milesToBBox(c.latitude, c.longitude, rMiles);

      const query = `
      [out:json][timeout:25];
      (
        way["highway"~"^(residential|tertiary|secondary|primary)$"]
          (${bbox.minLat},${bbox.minLon},${bbox.maxLat},${bbox.maxLon});
      );
      out geom;
    `;

      setProgressMessage("Loading OSM streets...");
      setProgress(0);

      json = injectedOSM ? injectedOSM : await fetchStreetsFromOverpassAPI(mirrors, query);
    }

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

  async function loadAndMatchStreets(
    center: Center,
    radiusMiles: number,
    activities: StravaActivity[],
    useAI: boolean,
    injectedOSM?: any
  ) {
    if (useAI) {
      return loadAndMatchStreetsAI(center, radiusMiles, activities, injectedOSM);
    } else {
      return loadAndMatchStreetsKD(center, radiusMiles, activities, injectedOSM);
    }
  }

  async function loadAndMatchStreetsKD(
    center: Center,
    radiusMiles: number,
    activities: StravaActivity[],
    injectedOSM?: any
  ) {
    const base = await loadStreetsFromOSM(center, radiusMiles, injectedOSM);
    console.log("base", base);
    if (!base.length) {
      console.log("base empty");
      setStreets([]);
      return;
    }

    console.log(
      `Matching ${base.length} streets against ${activities.length} activities using matcher_kdtree...`
    );

    const updated = await matchStreets(base, activities, getEnv("EXPO_PUBLIC_TOLERANCE_METERS"));

    console.log(updated);

    const streetsWithConfidence = computeConfidencePerStreet(
      updated.streets,
      updated.debug
    ).map(street => ({
      ...street,
      classification: classify(street.confidence)
    }));

    console.log("Confidence sample:", streetsWithConfidence.slice(0, 5));

    setStreets(streetsWithConfidence);
    resetProgress();
  }

  async function loadAndMatchStreetsAI(
    center: Center,
    radiusMiles: number,
    activitiesForMatch: StravaActivity[],
    injectedOSM?: any
  ) {
    const base = await loadStreetsFromOSM(center, radiusMiles, injectedOSM);
    console.log("base", base);
    if (!base.length) {
      console.log("base empty");
      setStreets([]);
      return;
    }

    console.log(
      `Matching ${base.length} streets against ${activitiesForMatch.length} activities using matcher_ai...`
    );

    const updated = await matchStreetsAI(base, activitiesForMatch);

    console.log(updated);

    const streetsWithConfidence = computeConfidencePerStreet(
      updated!.streets,
      updated!.debug
    ).map(street => ({
      ...street,
      classification: classify(street.confidence)
    }));

    console.log("Confidence sample:", streetsWithConfidence.slice(0, 5));

    setStreets(streetsWithConfidence);
    resetProgress();
  }

  return (
    <ctx.Provider
      value={{
        center,
        setCenter,
        radiusMiles,
        setRadiusMiles,
        mapTheme,
        setMapTheme,
        streets,
        activities,
        loadStreetsFromOSM,
        loadStreetsFromStravaActivities,
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
        showStravaOverlay,
        setShowStravaOverlay,
        showConfidenceOverlay,
        setShowConfidenceOverlay,

        // Manual toggling
        toggleStreet,
        manualEdits,
        exportManualEdits,
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
