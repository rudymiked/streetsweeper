import {
  Coord,
  degToMeters,
  pointToSegmentDistanceMeters,
  segmentsIntersect
} from "../core/geometry/base";

import {
  sampleSegmentPoints,
  boxesOverlap,
  directionallyAligned
} from "../core/geometry/helpers";

import { KDPoint, KDNode, buildKDTree, kdRangeSearch } from "../core/kdtree";
import { decodePolyline } from "../core/decodePolyline";

import {
  DebugOverlayData,
  DebugSegmentScore,
  DebugEvidencePoint
} from "../../utils/debug/debugOverlay.types";
import { getEnv } from "../../utils/getEnv";
import { loadOverrides } from "../storage/overrides";

//import { saveJsonFile } from "../../utils/saveJson";

export type Street = {
  id: string;
  name: string;
  completed: boolean;
  manuallyCompleted?: boolean;
  coords: Coord[];
};

export type Activity = {
  id: number;
  name: string;
  decoded: Coord[];
};

// ---------------------------------------------------------
// KD-tree builder
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
// Adaptive helpers
// ---------------------------------------------------------
function lerp(min: number, max: number, t: number) {
  return min + (max - min) * t;
}

function adaptTolerance(conf: number, base: number) {
  return lerp(base * 0.6, base * 1.8, 1 - conf);
}

function adaptStrongTolerance(conf: number, base: number) {
  return lerp(base * 0.7, base * 1.4, 1 - conf);
}

function adaptBearing(conf: number, base: number) {
  return lerp(base * 0.5, base * 1.5, 1 - conf);
}

function adaptMinScore(conf: number, base: number) {
  return lerp(base * 1.2, base * 0.6, 1 - conf);
}

function smoothConfidence(prev: number, current: number, alpha = 0.25) {
  return prev * (1 - alpha) + current * alpha;
}

// ---------------------------------------------------------
// Main KD-tree matcher (adaptive + sidewalk-aware)
// ---------------------------------------------------------
export async function matchStreetsKDTree(
  streets: Street[],
  activities: Activity[],
  baseTolerance = getEnv("EXPO_PUBLIC_TOLERANCE_METERS"),
  baseStrongTolerance = 5,
  baseBearingDiff = Math.PI / 2,
  baseMinScoreRatio = 0.35
): Promise<{ streets: Street[]; debug: DebugOverlayData }> {

  const tree = buildActivityKDTree(activities);
  const updated: Street[] = [];
  const debugSegments: DebugSegmentScore[] = [];
  const total = streets.length;
  let rollingConfidence = 0.75; // neutral starting point

  for (let i = 0; i < streets.length; i++) {
    const street = streets[i];

    // if (i % 100 === 0) {
    //   console.log(`KD matcher progress: ${i}/${total}`);
    // }

    let streetScore = 0;
    let streetMaxScore = 0;

    for (let j = 0; j < street.coords.length - 1; j++) {
      const A1 = street.coords[j];
      const A2 = street.coords[j + 1];

      // --- Adaptive thresholds per segment ---
      let tolerance = adaptTolerance(rollingConfidence, baseTolerance);
      const strongTolerance = adaptStrongTolerance(rollingConfidence, baseStrongTolerance);
      const bearingDiff = adaptBearing(rollingConfidence, baseBearingDiff);

      // Ensure sidewalks are always within reach
      const sidewalkFloor = 10; // meters
      tolerance = Math.max(tolerance, sidewalkFloor);

      const samples = sampleSegmentPoints(A1, A2);
      let bestScore = 0;
      const evidence: DebugEvidencePoint[] = [];

      for (const sample of samples) {
        const m = degToMeters(sample);
        const range = tolerance * 2.5; // slightly expanded for sidewalks

        const nearby = kdRangeSearch(
          tree,
          m.x - range,
          m.x + range,
          m.y - range,
          m.y + range
        );

        // Candidate density adaptation (tighten when dense)
        const densityFactor = Math.min(1, nearby.length / 20);
        const densityAdjustedTolerance = tolerance * (1 + densityFactor * 0.5);

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

          if (!boxesOverlap(a1, a2, b1, b2, densityAdjustedTolerance)) continue;

          const d1 = pointToSegmentDistanceMeters(a1, b1, b2);
          const d2 = pointToSegmentDistanceMeters(a2, b1, b2);
          const d3 = pointToSegmentDistanceMeters(b1, a1, a2);
          const d4 = pointToSegmentDistanceMeters(b2, a1, a2);
          const minD = Math.min(d1, d2, d3, d4);

          if (minD > densityAdjustedTolerance) continue;

          let score = 0;

          // Distance-based scoring
          if (minD <= strongTolerance) {
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

          // Intersection bonus
          if (segmentsIntersect(a1, a2, b1, b2)) {
            score += 0.75;
            evidence.push({
              lat: sample.latitude,
              lon: sample.longitude,
              type: "intersection"
            });
          }

          const aligned = directionallyAligned(A1, A2, B1, B2, bearingDiff);

          // Bearing bonus (stronger when distance is higher but alignment is perfect)
          if (aligned) {
            const bearingBonus = minD > strongTolerance ? 0.75 : 0.5;
            score += bearingBonus;
            evidence.push({
              lat: sample.latitude,
              lon: sample.longitude,
              type: "bearing"
            });
          }

          // Sidewalk / parallel-offset detection
          const isParallelOffset =
            !segmentsIntersect(a1, a2, b1, b2) &&
            aligned &&
            minD > strongTolerance &&
            minD <= tolerance * 2;

          if (isParallelOffset) {
            // Treat like a strong geometric hint
            score += 0.75;
            evidence.push({
              lat: sample.latitude,
              lon: sample.longitude,
              type: "parallel_offset",
              value: minD
            });
          }

          if (score > bestScore) {
            bestScore = score;
          }
        }
      }

      streetScore += bestScore;
      streetMaxScore += 2.25;

      const segConf = bestScore / 2.25;
      rollingConfidence = smoothConfidence(rollingConfidence, segConf);

      debugSegments.push({
        streetSeg: { A1, A2 },
        score: bestScore,
        maxScore: 2.25,
        evidence
      });
    }

    const rawRatio = streetMaxScore > 0 ? streetScore / streetMaxScore : 0;
    let minScoreRatio = adaptMinScore(rollingConfidence, baseMinScoreRatio);

    // If we’ve seen a lot of parallel-offset evidence on this street,
    // you could optionally relax minScoreRatio further by scanning debugSegments
    // for this street and counting "parallel_offset" evidence.

    const matched = rawRatio >= minScoreRatio;

    const overrides = await loadOverrides();

    updated.push({
      ...street,
      manuallyCompleted: overrides[street.id]?.manuallyCompleted || false,
      completed: matched || overrides[street.id]?.manuallyCompleted || false,
    });
  }

  saveMatchResults(updated, { segments: debugSegments });

  return {
    streets: updated,
    debug: { segments: debugSegments }
  };
}

async function saveMatchResults(matchedStreets: Street[], debugOverlay: DebugOverlayData) {
  const results = {
    streets: matchedStreets,
    debug: debugOverlay
  };

  //const path = await saveJsonFile('matchResults.json', results);

  // if (Platform.OS !== 'web') {
  //   Alert.alert('Saved', `File saved to: ${path}`);
  // }
}
