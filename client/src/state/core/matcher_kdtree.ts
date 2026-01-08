import {
  Coord,
  degToMeters,
  pointToSegmentDistanceMeters,
  segmentsIntersect
} from "./geometry/base";

import {
  sampleSegmentPoints,
  boxesOverlap,
  directionallyAligned
} from "./geometry/helpers";

import { KDPoint, KDNode, buildKDTree, kdRangeSearch } from "./kdtree";
import { decodePolyline } from "./decodePolyline";

import {
  DebugOverlayData,
  DebugSegmentScore,
  DebugEvidencePoint
} from "../../utils/debugOverlay.types";

export type Street = {
  id: string;
  name: string;
  completed: boolean;
  coords: Coord[];
};

export type Activity = {
  id: number;
  name: string;
  decoded: Coord[];
};

// ---------------------------------------------------------
// Build KD-tree from activity segment midpoints
// ---------------------------------------------------------
function buildActivityKDTree(activities: Activity[]): KDNode | null {
  const points: KDPoint[] = [];

  activities.forEach((act, activityIndex) => {
    const coords = act.decoded;

    for (let i = 0; i < coords.length - 1; i++) {
      const a = coords[i];
      const b = coords[i + 1];

      const mid = {
        latitude: (a.latitude + b.latitude) / 2,
        longitude: (a.longitude + b.longitude) / 2
      };

      const m = degToMeters(mid);

      points.push({
        x: m.x,
        y: m.y,
        segIndex: i,
        activityIndex
      });
    }
  });

  return buildKDTree(points);
}

// ---------------------------------------------------------
// Main KD-tree matcher (with debug)
// ---------------------------------------------------------
export async function matchStreetsKDTree(
  streets: Street[],
  activities: Activity[],
  toleranceMeters = 8,
  strongToleranceMeters = 5,
  maxBearingDiff = Math.PI / 2,
  minScoreRatio = 0.35
): Promise<{ streets: Street[]; debug: DebugOverlayData }> {

  const tree = buildActivityKDTree(activities);
  const updated: Street[] = [];
  const debugSegments: DebugSegmentScore[] = [];

  const total = streets.length;

  for (let i = 0; i < streets.length; i++) {
    const street = streets[i];

    if (i % 100 === 0) {
      console.log(`KD matcher progress: ${i}/${total}`);
    }

    let streetScore = 0;
    let streetMaxScore = 0;

    for (let j = 0; j < street.coords.length - 1; j++) {
      const A1 = street.coords[j];
      const A2 = street.coords[j + 1];

      const samples = sampleSegmentPoints(A1, A2);
      let bestScore = 0;
      const evidence: DebugEvidencePoint[] = [];

      for (const sample of samples) {
        const m = degToMeters(sample);
        const range = toleranceMeters * 2;

        const nearby = kdRangeSearch(
          tree,
          m.x - range,
          m.x + range,
          m.y - range,
          m.y + range
        );

        for (const pt of nearby) {
          const act = activities[pt.activityIndex];
          const segIndex = pt.segIndex;

          const B1 = act.decoded[segIndex];
          const B2 = act.decoded[segIndex + 1];
          if (!B1 || !B2) continue;

          const a1 = degToMeters(A1);
          const a2 = degToMeters(A2);
          const b1 = degToMeters(B1);
          const b2 = degToMeters(B2);

          if (!boxesOverlap(a1, a2, b1, b2, toleranceMeters)) continue;

          const d1 = pointToSegmentDistanceMeters(a1, b1, b2);
          const d2 = pointToSegmentDistanceMeters(a2, b1, b2);
          const d3 = pointToSegmentDistanceMeters(b1, a1, a2);
          const d4 = pointToSegmentDistanceMeters(b2, a1, a2);
          const minD = Math.min(d1, d2, d3, d4);

          if (minD > toleranceMeters) continue;

          let score = 0;

          if (minD <= strongToleranceMeters) {
            score += 1.0;
            evidence.push({
              lat: sample.latitude,
              lon: sample.longitude,
              type: "strong",
              value: minD
            });
          } else {
            score += 0.5;
            evidence.push({
              lat: sample.latitude,
              lon: sample.longitude,
              type: "distance",
              value: minD
            });
          }

          if (segmentsIntersect(a1, a2, b1, b2)) {
            score += 0.75;
            evidence.push({
              lat: sample.latitude,
              lon: sample.longitude,
              type: "intersection"
            });
          }

          if (directionallyAligned(A1, A2, B1, B2, maxBearingDiff)) {
            score += 0.5;
            evidence.push({
              lat: sample.latitude,
              lon: sample.longitude,
              type: "bearing"
            });
          }

          if (score > bestScore) {
            bestScore = score;
          }
        }
      }

      streetScore += bestScore;
      streetMaxScore += 2.25;

      debugSegments.push({
        streetSeg: { A1, A2 },
        score: bestScore,
        maxScore: 2.25,
        evidence
      });
    }

    const ratio = streetMaxScore > 0 ? streetScore / streetMaxScore : 0;
    const matched = ratio >= minScoreRatio;

    updated.push({ ...street, completed: matched });
  }

  return {
    streets: updated,
    debug: { segments: debugSegments }
  };
}

// ---------------------------------------------------------
// Raw activity wrapper
// ---------------------------------------------------------
export type RawActivity = {
  id: number;
  name: string;
  map: { summary_polyline: string | null };
};

export async function matchStreets(
  streets: Street[],
  activities: RawActivity[],
  toleranceMeters = 8
) {
  const decodedActivities = activities.map(a => ({
    ...a,
    decoded: a.map.summary_polyline
      ? decodePolyline(a.map.summary_polyline)
      : []
  }));

  return matchStreetsKDTree(streets, decodedActivities, toleranceMeters);
}
