// geometry_strict.ts

import { Coord, degToMeters, pointToSegmentDistanceMeters, segmentsIntersect } from "./geometry";

export function streetWasRunStrict(
  streetCoords: Coord[],
  activityCoords: Coord[],
  toleranceMeters: number
): boolean {
  if (streetCoords.length < 2 || activityCoords.length < 2) return false;

  for (let i = 0; i < streetCoords.length - 1; i++) {
    const A1 = streetCoords[i];
    const A2 = streetCoords[i + 1];

    const a1 = degToMeters(A1);
    const a2 = degToMeters(A2);

    for (let j = 0; j < activityCoords.length - 1; j++) {
      const B1 = activityCoords[j];
      const B2 = activityCoords[j + 1];

      const b1 = degToMeters(B1);
      const b2 = degToMeters(B2);

      // 1. Bounding box overlap
      if (!boxesOverlap(a1, a2, b1, b2, toleranceMeters)) continue;

      // 2. Directional alignment
      if (!directionallyAligned(a1, a2, b1, b2)) continue;

      // 3. Segment intersection
      if (segmentsIntersect(a1, a2, b1, b2)) return true;

      // 4. Two-way proximity
      const d1 = pointToSegmentDistanceMeters(a1, b1, b2);
      const d2 = pointToSegmentDistanceMeters(a2, b1, b2);
      const d3 = pointToSegmentDistanceMeters(b1, a1, a2);
      const d4 = pointToSegmentDistanceMeters(b2, a1, a2);

      if (Math.min(d1, d2, d3, d4) < toleranceMeters) return true;
    }
  }

  return false;
}

// ----------------------------
// Helpers
// ----------------------------

function boxesOverlap(a1: any, a2: any, b1: any, b2: any, tol: number) {
  const minAx = Math.min(a1.x, a2.x) - tol;
  const maxAx = Math.max(a1.x, a2.x) + tol;
  const minAy = Math.min(a1.y, a2.y) - tol;
  const maxAy = Math.max(a1.y, a2.y) + tol;

  const minBx = Math.min(b1.x, b2.x) - tol;
  const maxBx = Math.max(b1.x, b2.x) + tol;
  const minBy = Math.min(b1.y, b2.y) - tol;
  const maxBy = Math.max(b1.y, b2.y) + tol;

  return !(maxAx < minBx || maxBx < minAx || maxAy < minBy || maxBy < minAy);
}

function directionallyAligned(a1: any, a2: any, b1: any, b2: any) {
  const angleA = Math.atan2(a2.y - a1.y, a2.x - a1.x);
  const angleB = Math.atan2(b2.y - b1.y, b2.x - b1.x);

  let diff = Math.abs(angleA - angleB);
  if (diff > Math.PI) diff = 2 * Math.PI - diff;

  const degrees = diff * (180 / Math.PI);
  return degrees < 30; // configurable
}
