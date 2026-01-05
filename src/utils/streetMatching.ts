import * as turf from '@turf/turf';

export function streetWasRun(
  streetCoords: any[],
  activityCoords: any[],
  toleranceMeters = 15
) {
  if (!streetCoords?.length || !activityCoords?.length) return false;

  // Convert to LineStrings
  const streetLine = turf.lineString(
    streetCoords.map(c => [c.longitude, c.latitude])
  );

  const activityLine = turf.lineString(
    activityCoords.map(c => [c.longitude, c.latitude])
  );

  // 1. Quick bounding-box check (fast skip)
  const streetBbox = turf.bbox(streetLine);
  const activityBbox = turf.bbox(activityLine);

  const streetPoly = turf.bboxPolygon(streetBbox);
  const activityPoly = turf.bboxPolygon(activityBbox);

  if (turf.booleanDisjoint(streetPoly, activityPoly)) {
    return false; // no overlap at all → skip expensive work
  }

  // 2. Simplify both lines (huge performance win)
  const simplifiedStreet = turf.simplify(streetLine, {
    tolerance: 0.00005,
    highQuality: false,
  });

  const simplifiedActivity = turf.simplify(activityLine, {
    tolerance: 0.0001,
    highQuality: false,
  });

  // 3. Sample points along the street every 30 meters
  const streetLength = turf.length(simplifiedStreet, { units: 'meters' });
  const step = 30; // ← increased from 10m to 30m

  for (let dist = 0; dist <= streetLength; dist += step) {
    const pt = turf.along(simplifiedStreet, dist, { units: 'meters' });

    // 4. Find nearest point on activity line
    const snapped = turf.nearestPointOnLine(simplifiedActivity, pt);
    const distanceMeters = snapped.properties.dist * 1000; // km → m

    // 5. Early exit if within tolerance
    if (distanceMeters < toleranceMeters) {
      return true;
    }
  }

  return false;
}
