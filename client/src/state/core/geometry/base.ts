// geometry/base.ts

export type Coord = { latitude: number; longitude: number };

// Earth radius in meters (WGS84)
const R = 6378137;

// ---------------------------------------------------------
// Convert lat/lon to Web Mercator meters
// ---------------------------------------------------------
export function degToMeters(p: Coord) {
  const x = (p.longitude * Math.PI * R) / 180;
  const y =
    Math.log(Math.tan(Math.PI / 4 + (p.latitude * Math.PI) / 360)) * R;
  return { x, y };
}

// ---------------------------------------------------------
// Convert Web Mercator meters back to lat/lon
// ---------------------------------------------------------
export function metersToDeg(x: number, y: number): Coord {
  const lon = (x / R) * (180 / Math.PI);
  const lat =
    (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * (180 / Math.PI);
  return { latitude: lat, longitude: lon };
}

// ---------------------------------------------------------
// Bearing between two coords (radians)
// ---------------------------------------------------------
export function bearingRadians(a: Coord, b: Coord) {
  const A = degToMeters(a);
  const B = degToMeters(b);
  return Math.atan2(B.x - A.x, B.y - A.y);
}

// ---------------------------------------------------------
// Point-to-segment distance in meters
// ---------------------------------------------------------
export function pointToSegmentDistanceMeters(pt: any, v: any, w: any) {
  const vx = w.x - v.x;
  const vy = w.y - v.y;
  const l2 = vx * vx + vy * vy;

  if (l2 === 0) return Math.hypot(pt.x - v.x, pt.y - v.y);

  const t =
    ((pt.x - v.x) * vx + (pt.y - v.y) * vy) / l2;

  const clamped = Math.max(0, Math.min(1, t));

  const proj = {
    x: v.x + clamped * vx,
    y: v.y + clamped * vy,
  };

  return Math.hypot(pt.x - proj.x, pt.y - proj.y);
}

// ---------------------------------------------------------
// Robust segment intersection (handles collinearity)
// ---------------------------------------------------------
export function segmentsIntersect(a1: any, a2: any, b1: any, b2: any) {
  const eps = 1e-9;

  function orient(a: any, b: any, c: any) {
    return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  }

  const o1 = orient(a1, a2, b1);
  const o2 = orient(a1, a2, b2);
  const o3 = orient(b1, b2, a1);
  const o4 = orient(b1, b2, a2);

  // General case
  if (o1 * o2 < -eps && o3 * o4 < -eps) return true;

  // Collinear overlap
  const col = Math.abs(o1) < eps && Math.abs(o2) < eps && Math.abs(o3) < eps && Math.abs(o4) < eps;
  if (col) {
    const minA = Math.min(a1.x, a2.x) - eps;
    const maxA = Math.max(a1.x, a2.x) + eps;
    const minB = Math.min(b1.x, b2.x) - eps;
    const maxB = Math.max(b1.x, b2.x) + eps;
    return !(maxA < minB || maxB < minA);
  }

  return false;
}
