// geometry/helpers.ts

import { Coord } from "./base";
import { bearingRadians } from "./base";

// ---------------------------------------------------------
// Sample 3 points along a segment (25%, 50%, 75%)
// ---------------------------------------------------------
export function sampleSegmentPoints(a: Coord, b: Coord): Coord[] {
  return [
    {
      latitude: a.latitude * 0.75 + b.latitude * 0.25,
      longitude: a.longitude * 0.75 + b.longitude * 0.25,
    },
    {
      latitude: (a.latitude + b.latitude) / 2,
      longitude: (a.longitude + b.longitude) / 2,
    },
    {
      latitude: a.latitude * 0.25 + b.latitude * 0.75,
      longitude: a.longitude * 0.25 + b.longitude * 0.75,
    },
  ];
}

// ---------------------------------------------------------
// Bounding box overlap with tolerance
// ---------------------------------------------------------
export function boxesOverlap(a1: any, a2: any, b1: any, b2: any, tol: number) {
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

// ---------------------------------------------------------
// Directional alignment (bearing difference)
// ---------------------------------------------------------
export function directionallyAligned(
  a1: Coord,
  a2: Coord,
  b1: Coord,
  b2: Coord,
  maxBearingDiff = Math.PI / 3 // 60 degrees
) {
  const angleA = bearingRadians(a1, a2);
  const angleB = bearingRadians(b1, b2);

  let diff = Math.abs(angleA - angleB);
  if (diff > Math.PI) diff = 2 * Math.PI - diff;

  return diff < maxBearingDiff;
}
