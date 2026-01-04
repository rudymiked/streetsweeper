import React, { createContext, useContext, useState, ReactNode } from 'react';

type Center = { name: string; latitude: number; longitude: number };
type Coord = { latitude: number; longitude: number };
type Street = { id: string; name: string; completed: boolean; coords: Coord[] };
type Activity = { id: string; name: string; type: string; distance: number; date: string; polyline?: string };

type StateContextType = {
  center: Center;
  setCenter: (c: Center) => void;
  radiusMiles: number;
  setRadiusMiles: (r: number) => void;
  streets: Street[];
  toggleStreet: (id: string) => void;
  markManyComplete: (count?: number) => void;
  activities: Activity[];
  setActivities: (a: Activity[]) => void;
};

const ctx = createContext<StateContextType | undefined>(undefined);

const initialCenter: Center = { name: 'Saved Home', latitude: Number.parseFloat(process.env.DEFAULT_MAP_CENTER_LATITUDE || '47.667120970606'), longitude: Number.parseFloat(process.env.DEFAULT_MAP_CENTER_LONGITUDE || '-122.38431335074893') };

export const StateProvider = ({ children }: { children: ReactNode }) => {
  const [center, setCenter] = useState<Center>(initialCenter);
  const [radiusMiles, setRadiusMiles] = useState<number>(2);
  const [streets, setStreets] = useState<Street[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);

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
    <ctx.Provider value={{ center, setCenter, radiusMiles, setRadiusMiles, streets, toggleStreet, markManyComplete, activities, setActivities }}>
      {children}
    </ctx.Provider>
  );
};

export function useAppState() {
  const v = useContext(ctx);
  if (!v) throw new Error('useAppState must be used within StateProvider');
  return v;
}
