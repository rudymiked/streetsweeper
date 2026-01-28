import { sleep } from '../utils/utils';
import { decodePolyline } from './core/decodePolyline';
import { Street } from './matching/matcher_kdtree';
import { classify, computeConfidencePerStreet } from '../utils/debug/debugConfidence';
import { matchStreets, matchStreetsAI } from './matching/matcher';
import { getEnv } from '../utils/getEnv';
import { Coord } from './core/geometry/base';
import { streetIntersectsPolygon, getPolygonBounds } from '../utils/geometry';
import { StravaActivity, PolygonPoint, FilterMode } from './StateContext';

export type Center = { name: string; latitude: number; longitude: number };

export type ManualEdit = {
  id: string;
  originalCompleted: boolean;
  newCompleted: boolean;
  timestamp: number;
};

export const initialCenter: Center = {
  name: 'Saved Home',
  latitude: Number.parseFloat(getEnv("EXPO_PUBLIC_DEFAULT_MAP_CENTER_LATITUDE") || '47.667120970606'),
  longitude: Number.parseFloat(getEnv("EXPO_PUBLIC_DEFAULT_MAP_CENTER_LONGITUDE") || '-122.38431335074893'),
};

export function milesToBBox(lat: number, lon: number, radiusMiles: number) {
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

export async function fetchStreetsFromOverpassAPI(mirrors: string[], query: string): Promise<any> {
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

export function createToggleStreet(
  setStreets: React.Dispatch<React.SetStateAction<Street[]>>,
  setManualEdits: React.Dispatch<React.SetStateAction<ManualEdit[]>>
) {
  return function toggleStreet(id: string) {
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
  };
}

export function createExportManualEdits(
  manualEdits: ManualEdit[],
  streets: Street[],
  center: Center
) {
  return function exportManualEdits() {
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
  };
}

interface LoadStreetsParams {
  centerParam?: Center;
  miles?: number;
  injectedOSM?: any;
  filterMode: FilterMode;
  polygon: PolygonPoint[];
  radiusMiles: number;
  setProgress: (n: number) => void;
  setProgressMessage: (s: string | null) => void;
  setStreets: React.Dispatch<React.SetStateAction<Street[]>>;
  setPolygon: React.Dispatch<React.SetStateAction<PolygonPoint[]>>;
}

export async function loadStreetsFromOSM(params: LoadStreetsParams): Promise<Street[]> {
  const {
    centerParam,
    miles,
    injectedOSM,
    filterMode,
    polygon,
    radiusMiles,
    setProgress,
    setProgressMessage,
    setStreets,
    setPolygon,
  } = params;

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

    // Determine bbox based on filter mode
    let bbox;
    if (filterMode === 'polygon' && polygon.length >= 3) {
      // Use polygon bounds for the query
      const polygonBounds = getPolygonBounds(polygon);
      if (polygonBounds) {
        bbox = {
          minLat: polygonBounds.minLat,
          maxLat: polygonBounds.maxLat,
          minLon: polygonBounds.minLon,
          maxLon: polygonBounds.maxLon,
        };
        console.log("Loading OSM streets for polygon bbox:", bbox);
      } else {
        // Fallback to center/radius if polygon bounds fail
        const c = centerParam || initialCenter;
        const rMiles = typeof miles === "number" ? miles : radiusMiles;
        bbox = milesToBBox(c.latitude, c.longitude, rMiles);
        console.log("Loading OSM streets for radius bbox (polygon fallback):", bbox);
      }
    } else {
      // Use center/radius for the query
      const c = centerParam || initialCenter;
      const rMiles = typeof miles === "number" ? miles : radiusMiles;
      bbox = milesToBBox(c.latitude, c.longitude, rMiles);
      console.log("Loading OSM streets for radius bbox:", bbox);
    }

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

    json = await fetchStreetsFromOverpassAPI(mirrors, query);
  }

  const elems = json.elements || [];

  let ways: Street[] = elems
    .filter((e: any) => e.type === "way" && e.geometry?.length)
    .map((w: any) => ({
      id: String(w.id),
      name: w.tags?.name || w.tags?.ref || `OSM ${w.id}`,
      completed: false,
      coords: w.geometry.map((g: any) => ({ latitude: g.lat, longitude: g.lon })),
    }));

  // Filter by polygon if in polygon mode
  if (filterMode === 'polygon' && polygon.length >= 3) {
    ways = ways.filter(street => streetIntersectsPolygon(street.coords, polygon));
    // Clear polygon after loading - it's only used for loading
    setPolygon([]);
  }

  setProgress(100);
  setProgressMessage("OSM streets loaded");

  setStreets(ways);
  return ways;
}

interface LoadStravaParams {
  raw: StravaActivity[];
  setProgress: (n: number) => void;
  setProgressMessage: (s: string | null) => void;
  setActivities: React.Dispatch<React.SetStateAction<StravaActivity[]>>;
  resetProgress: () => void;
}

export async function loadStreetsFromStravaActivities(params: LoadStravaParams): Promise<StravaActivity[]> {
  const { raw, setProgress, setProgressMessage, setActivities, resetProgress } = params;
  
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

interface MatchStreetsParams {
  center: Center;
  radiusMiles: number;
  activities: StravaActivity[];
  injectedOSM?: any;
  filterMode: FilterMode;
  polygon: PolygonPoint[];
  setProgress: (n: number) => void;
  setProgressMessage: (s: string | null) => void;
  setStreets: React.Dispatch<React.SetStateAction<Street[]>>;
  setPolygon: React.Dispatch<React.SetStateAction<PolygonPoint[]>>;
  resetProgress: () => void;
}

export async function loadAndMatchStreetsKD(params: MatchStreetsParams) {
  const {
    center,
    radiusMiles,
    activities,
    injectedOSM,
    filterMode,
    polygon,
    setProgress,
    setProgressMessage,
    setStreets,
    setPolygon,
    resetProgress,
  } = params;

  const base = await loadStreetsFromOSM({
    centerParam: center,
    miles: radiusMiles,
    injectedOSM,
    filterMode,
    polygon,
    radiusMiles,
    setProgress,
    setProgressMessage,
    setStreets,
    setPolygon,
  });
  
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

export async function loadAndMatchStreetsAI(params: MatchStreetsParams) {
  const {
    center,
    radiusMiles,
    activities,
    injectedOSM,
    filterMode,
    polygon,
    setProgress,
    setProgressMessage,
    setStreets,
    setPolygon,
    resetProgress,
  } = params;

  const base = await loadStreetsFromOSM({
    centerParam: center,
    miles: radiusMiles,
    injectedOSM,
    filterMode,
    polygon,
    radiusMiles,
    setProgress,
    setProgressMessage,
    setStreets,
    setPolygon,
  });
  
  console.log("base", base);
  if (!base.length) {
    console.log("base empty");
    setStreets([]);
    return;
  }

  console.log(
    `Matching ${base.length} streets against ${activities.length} activities using matcher_ai...`
  );

  const updated = await matchStreetsAI(base, activities);

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
