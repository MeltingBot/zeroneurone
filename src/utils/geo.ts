import type { GeoData, GeoPoint, GeoPolygon } from '../types';

export function isGeoPoint(geo: GeoData | null | undefined): geo is GeoPoint {
  return !!geo && geo.type === 'point';
}

export function isGeoPolygon(geo: GeoData | null | undefined): geo is GeoPolygon {
  return !!geo && geo.type === 'polygon';
}

/** Get the center coordinates for any GeoData (point position or polygon centroid) */
export function getGeoCenter(geo: GeoData): { lat: number; lng: number } {
  if (isGeoPoint(geo)) {
    return { lat: geo.lat, lng: geo.lng };
  }
  return geo.center;
}

/** Compute centroid of a polygon from its coordinate array */
export function computePolygonCenter(coordinates: [number, number][]): { lat: number; lng: number } {
  const n = coordinates.length;
  if (n === 0) return { lat: 0, lng: 0 };
  const sum = coordinates.reduce(
    (acc, [lng, lat]) => ({ lat: acc.lat + lat, lng: acc.lng + lng }),
    { lat: 0, lng: 0 }
  );
  return { lat: sum.lat / n, lng: sum.lng / n };
}

/** Approximate area in km² (Shoelace formula on equirectangular projection) */
export function computePolygonAreaKm2(coordinates: [number, number][]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const n = coordinates.length;
  if (n < 3) return 0;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const [lng1, lat1] = coordinates[i];
    const [lng2, lat2] = coordinates[j];
    area += toRad(lng2 - lng1) * (2 + Math.sin(toRad(lat1)) + Math.sin(toRad(lat2)));
  }
  area = (Math.abs(area) * 6371 * 6371) / 2;
  return Math.round(area * 100) / 100;
}

/**
 * Find the closest point on a polygon boundary to a target [lng, lat].
 * Returns [lng, lat] on the edge of the polygon.
 */
export function closestPointOnPolygon(
  coordinates: [number, number][],
  target: [number, number]
): [number, number] {
  let bestDist = Infinity;
  let best: [number, number] = coordinates[0] || target;
  const n = coordinates.length;

  for (let i = 0; i < n; i++) {
    const a = coordinates[i];
    const b = coordinates[(i + 1) % n];
    const p = closestPointOnSegment(a, b, target);
    const d = (p[0] - target[0]) ** 2 + (p[1] - target[1]) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best;
}

function closestPointOnSegment(
  a: [number, number], b: [number, number], p: [number, number]
): [number, number] {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  if (dx === 0 && dy === 0) return a;
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy);
  t = Math.max(0, Math.min(1, t));
  return [a[0] + t * dx, a[1] + t * dy];
}

/** Point-in-polygon test (ray casting algorithm). Coordinates are [lng, lat]. */
export function pointInPolygon(coordinates: [number, number][], point: [number, number]): boolean {
  const [px, py] = point;
  const n = coordinates.length;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = coordinates[i];
    const [xj, yj] = coordinates[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Generate a circle polygon approximation around a center point */
export function generateCirclePolygon(
  center: [number, number],
  radiusKm: number,
  segments = 36
): [number, number][] {
  const [cLng, cLat] = center;
  const latRad = (cLat * Math.PI) / 180;
  // 1 degree of latitude ≈ 111.32 km
  const dLat = radiusKm / 111.32;
  const dLng = radiusKm / (111.32 * Math.cos(latRad));
  const coords: [number, number][] = [];
  for (let i = 0; i < segments; i++) {
    const angle = (2 * Math.PI * i) / segments;
    coords.push([cLng + dLng * Math.cos(angle), cLat + dLat * Math.sin(angle)]);
  }
  return coords;
}

/** Generate a square polygon around a center point */
export function generateSquarePolygon(
  center: [number, number],
  halfSideKm: number
): [number, number][] {
  const [cLng, cLat] = center;
  const latRad = (cLat * Math.PI) / 180;
  const dLat = halfSideKm / 111.32;
  const dLng = halfSideKm / (111.32 * Math.cos(latRad));
  return [
    [cLng - dLng, cLat + dLat], // top-left
    [cLng + dLng, cLat + dLat], // top-right
    [cLng + dLng, cLat - dLat], // bottom-right
    [cLng - dLng, cLat - dLat], // bottom-left
  ];
}

/**
 * Normalize legacy geo format ({ lat, lng } without type) to GeoPoint.
 * Used during import and migration.
 */
export function normalizeGeo(geo: any): GeoData | null {
  if (!geo) return null;
  if (geo.type === 'point' || geo.type === 'polygon') return geo;
  // Legacy format: { lat, lng } without type discriminator
  if (typeof geo.lat === 'number' && typeof geo.lng === 'number') {
    return { type: 'point', lat: geo.lat, lng: geo.lng, ...(typeof geo.altitude === 'number' ? { altitude: geo.altitude } : {}) };
  }
  return null;
}
