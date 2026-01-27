// Geometry utilities for polygon operations

export type Point = { latitude: number; longitude: number };

/**
 * Check if a point is inside a polygon using ray casting algorithm
 */
export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  if (polygon.length < 3) return false;
  
  let inside = false;
  const x = point.longitude;
  const y = point.latitude;
  
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].longitude;
    const yi = polygon[i].latitude;
    const xj = polygon[j].longitude;
    const yj = polygon[j].latitude;
    
    const intersect = ((yi > y) !== (yj > y)) &&
      (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    
    if (intersect) inside = !inside;
  }
  
  return inside;
}

/**
 * Check if any point of a street is inside the polygon
 */
export function streetIntersectsPolygon(streetCoords: Point[], polygon: Point[]): boolean {
  if (polygon.length < 3) return false;
  
  // Check if any street point is inside the polygon
  for (const coord of streetCoords) {
    if (pointInPolygon(coord, polygon)) {
      return true;
    }
  }
  
  // Optionally: check if any polygon edge intersects any street segment
  // For simplicity, we just check points - streets that pass through but
  // have no points inside won't be included
  
  return false;
}

/**
 * Get the bounding box of a polygon
 */
export function getPolygonBounds(polygon: Point[]): {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
} | null {
  if (polygon.length === 0) return null;
  
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  
  for (const p of polygon) {
    minLat = Math.min(minLat, p.latitude);
    maxLat = Math.max(maxLat, p.latitude);
    minLon = Math.min(minLon, p.longitude);
    maxLon = Math.max(maxLon, p.longitude);
  }
  
  return { minLat, maxLat, minLon, maxLon };
}

/**
 * Get center of polygon
 */
export function getPolygonCenter(polygon: Point[]): Point | null {
  if (polygon.length === 0) return null;
  
  let sumLat = 0;
  let sumLon = 0;
  
  for (const p of polygon) {
    sumLat += p.latitude;
    sumLon += p.longitude;
  }
  
  return {
    latitude: sumLat / polygon.length,
    longitude: sumLon / polygon.length
  };
}
