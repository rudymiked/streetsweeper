// geometry_strict.ts
import { Coord, degToMeters, pointToSegmentDistanceMeters, segmentsIntersect } from "./base";
import { sampleSegmentPoints, boxesOverlap, directionallyAligned } from "./helpers";

export function streetWasRunStrict(
  streetCoords: Coord[],
  activityCoords: Coord[],
  toleranceMeters: number,
  minConsecutive = 1,
  maxBearingDiff = Math.PI / 3 // 60 degrees
): boolean {
  if (streetCoords.length < 2 || activityCoords.length < 2) return false;

  let consecutive = 0;

  for (let i = 0; i < streetCoords.length - 1; i++) {
    const A1 = streetCoords[i];
    const A2 = streetCoords[i + 1];

    const samples = sampleSegmentPoints(A1, A2);

    for (const sample of samples) {
      const a1 = degToMeters(sample);
      const a2 = degToMeters(A2);

      for (let j = 0; j < activityCoords.length - 1; j++) {
        const B1 = activityCoords[j];
        const B2 = activityCoords[j + 1];

        const b1 = degToMeters(B1);
        const b2 = degToMeters(B2);

        // 1. Bounding box
        if (!boxesOverlap(a1, a2, b1, b2, toleranceMeters)) continue;

        // 2. Bearing alignment
        if (!directionallyAligned(A1, A2, B1, B2, maxBearingDiff)) continue;

        // 3. Intersection
        if (segmentsIntersect(a1, a2, b1, b2)) {
          if (++consecutive >= minConsecutive) return true;
          continue;
        }

        // 4. Two-way proximity
        const d1 = pointToSegmentDistanceMeters(a1, b1, b2);
        const d2 = pointToSegmentDistanceMeters(a2, b1, b2);
        const d3 = pointToSegmentDistanceMeters(b1, a1, a2);
        const d4 = pointToSegmentDistanceMeters(b2, a1, a2);

        if (Math.min(d1, d2, d3, d4) < toleranceMeters) {
          if (++consecutive >= minConsecutive) return true;
        } else {
          consecutive = 0;
        }
      }
    }
  }

  return false;
}
