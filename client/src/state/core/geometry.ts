export type Coord = { latitude: number; longitude: number };

export function degToMeters(p: Coord, refLat = p.latitude) {
  const latRad = (refLat * Math.PI) / 180;
  return {
    x: p.longitude * Math.cos(latRad) * 111320,
    y: p.latitude * 111320,
  };
}

export function pointToSegmentDistanceMeters(pt: any, v: any, w: any) {
  const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2;
  if (l2 === 0) return Math.hypot(pt.x - v.x, pt.y - v.y);
  const t = Math.max(0, Math.min(1, ((pt.x - v.x) * (w.x - v.x) + (pt.y - v.y) * (w.y - v.y)) / l2));
  const proj = { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) };
  return Math.hypot(pt.x - proj.x, pt.y - proj.y);
}

export function segmentsIntersect(a1: any, a2: any, b1: any, b2: any) {
  function orient(a: any, b: any, c: any) {
    return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  }
  const o1 = orient(a1, a2, b1);
  const o2 = orient(a1, a2, b2);
  const o3 = orient(b1, b2, a1);
  const o4 = orient(b1, b2, a2);
  return o1 * o2 <= 0 && o3 * o4 <= 0;
}

export function streetWasRun(
  streetCoords: Coord[],
  activityCoords: Coord[],
  toleranceMeters = 6
) {
  if (!streetCoords.length || !activityCoords.length) return false;

  for (let i = 0; i < streetCoords.length - 1; i++) {
    const a1 = streetCoords[i];
    const a2 = streetCoords[i + 1];

    for (let j = 0; j < activityCoords.length - 1; j++) {
      const b1 = activityCoords[j];
      const b2 = activityCoords[j + 1];

      const meanLat = (a1.latitude + a2.latitude + b1.latitude + b2.latitude) / 4;

      const A1 = degToMeters(a1, meanLat);
      const A2 = degToMeters(a2, meanLat);
      const B1 = degToMeters(b1, meanLat);
      const B2 = degToMeters(b2, meanLat);

      if (segmentsIntersect(A1, A2, B1, B2)) return true;

      const d1 = pointToSegmentDistanceMeters(A1, B1, B2);
      const d2 = pointToSegmentDistanceMeters(A2, B1, B2);
      const d3 = pointToSegmentDistanceMeters(B1, A1, A2);
      const d4 = pointToSegmentDistanceMeters(B2, A1, A2);

      if (Math.min(d1, d2, d3, d4) < toleranceMeters) return true;
    }
  }

  return false;
}
