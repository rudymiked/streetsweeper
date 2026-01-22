// Raw activity wrapper../core/geometry/geometry_strict

import { getEnv } from "../../utils/getEnv";
import { decodePolyline } from "../core/decodePolyline";
import { runMatcherAzure } from "./matcher_ai";
import { matchStreetsKDTree, Street } from "./matcher_kdtree";

// ---------------------../core/matcher_kdtree--------------------
export type RawActivity = {
  id: number;
  name: string;
  map: { summary_polyline: string | null };
};

export async function matchStreets(
  streets: Street[],
  activities: RawActivity[],
  toleranceMeters = getEnv("EXPO_PUBLIC_TOLERANCE_METERS")
) {
  const decodedActivities = activities.map(a => ({
    ...a,
    decoded: a.map.summary_polyline
      ? decodePolyline(a.map.summary_polyline)
      : []
  }));

  const result = await matchStreetsKDTree(streets, decodedActivities, toleranceMeters);

  // Normalize shape
  if (Array.isArray(result)) {
    return { streets: result.streets, debug: result.debug };
  }

  return result;
}

export async function matchStreetsAI(
  streets: Street[],
  activities: RawActivity[]
) {
  const decodedActivities = activities.map(a => ({
    ...a,
    decoded: a.map.summary_polyline
      ? decodePolyline(a.map.summary_polyline)
      : []
  }));

  const result = await runMatcherAzure(streets, decodedActivities);

  // Normalize shape
  if (Array.isArray(result)) {
    return { streets: result.streets, debug: result.debug };
  }
}