import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { Street } from './matching/matcher_kdtree';
import { PlannedRoute } from './routing/routePlanner';
import {
  Center,
  ManualEdit,
  initialCenter,
  createToggleStreet,
  createExportManualEdits,
  loadStreetsFromOSM as loadOSM,
  loadStreetsFromStravaActivities as loadStrava,
  loadAndMatchStreetsKD,
  loadAndMatchStreetsAI,
} from './actions';

export type StravaActivity = {
  id: number;
  name: string;
  map: { id: string; summary_polyline: string | null };
  coords: Array<{ latitude: number; longitude: number }>;
  [key: string]: any;
};

// Polygon boundary type
export type PolygonPoint = { latitude: number; longitude: number };

// Filter mode type
export type FilterMode = 'radius' | 'polygon';

type StateContextType = {
  center: Center;
  setCenter: (c: Center) => void;
  mapZoom: number;
  setMapZoom: (z: number) => void;
  radiusMiles: number;
  setRadiusMiles: (r: number) => void;
  filterMode: FilterMode;
  setFilterMode: (m: FilterMode) => void;
  polygon: PolygonPoint[];
  setPolygon: (p: PolygonPoint[]) => void;
  addPolygonPoint: (p: PolygonPoint) => void;
  clearPolygon: () => void;
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
  // Route planning
  plannedRoute: PlannedRoute | null;
  setPlannedRoute: (route: PlannedRoute | null) => void;
  clearPlannedRoute: () => void;
};

const ctx = createContext<StateContextType | undefined>(undefined);

export const StateProvider = ({ children }: { children: ReactNode }) => {
  const [center, setCenter] = useState<Center>(initialCenter);
  const [mapZoom, setMapZoom] = useState<number>(14);
  const [radiusMiles, setRadiusMiles] = useState<number>(3);
  const [filterMode, setFilterMode] = useState<FilterMode>('radius');
  const [polygon, setPolygon] = useState<PolygonPoint[]>([]);
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
  const [plannedRoute, setPlannedRoute] = useState<PlannedRoute | null>(null);

  function addPolygonPoint(point: PolygonPoint) {
    setPolygon(prev => [...prev, point]);
  }

  function clearPolygon() {
    setPolygon([]);
  }

  function clearPlannedRoute() {
    setPlannedRoute(null);
  }

  const toggleStreet = useCallback(
    createToggleStreet(setStreets, setManualEdits),
    []
  );

  function resetProgress() {
    setTimeout(() => {
      setProgress(0);
      setProgressMessage(null);
    }, 800);
  }

  const exportManualEdits = useCallback(
    () => createExportManualEdits(manualEdits, streets, center)(),
    [manualEdits, streets, center]
  );

  async function loadStreetsFromOSM(centerParam?: Center, miles?: number, injectedOSM?: any): Promise<Street[]> {
    return loadOSM({
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
    });
  }

  async function loadStreetsFromStravaActivities(raw: StravaActivity[]): Promise<StravaActivity[]> {
    return loadStrava({
      raw,
      setProgress,
      setProgressMessage,
      setActivities,
      resetProgress,
    });
  }

  async function loadAndMatchStreets(
    centerVal: Center,
    radiusMilesVal: number,
    activitiesVal: StravaActivity[],
    useAI: boolean,
    injectedOSM?: any
  ) {
    const params = {
      center: centerVal,
      radiusMiles: radiusMilesVal,
      activities: activitiesVal,
      injectedOSM,
      filterMode,
      polygon,
      setProgress,
      setProgressMessage,
      setStreets,
      setPolygon,
      resetProgress,
    };

    if (useAI) {
      return loadAndMatchStreetsAI(params);
    } else {
      return loadAndMatchStreetsKD(params);
    }
  }

  return (
    <ctx.Provider
      value={{
        center,
        setCenter,
        mapZoom,
        setMapZoom,
        radiusMiles,
        setRadiusMiles,
        filterMode,
        setFilterMode,
        polygon,
        setPolygon,
        addPolygonPoint,
        clearPolygon,
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

        // Route planning
        plannedRoute,
        setPlannedRoute,
        clearPlannedRoute,
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
