/** Marker placement on the map: breadcrumb traces, their dot size, spreading overlapping markers */

import type { GeoData } from '../../types';
import { getGeoCenter } from '../../utils/geo';

// Trace mode: one breadcrumb per distinct position (the latest event there,
// with the number of events there), none where the element currently stands.
// Repeated events at one spot (calls on the same cell) would otherwise be
// fanned out by the spiderfy into huge spirals of dots.
export function traceBreadcrumbs<E extends { id: string; date: Date | string; geo?: GeoData }>(
  events: E[],
  current: { geo: { lat: number; lng: number }; eventId?: string } | null,
): { event: E; count: number }[] {
  const spot = (g: { lat: number; lng: number }) => `${g.lat.toFixed(5)},${g.lng.toFixed(5)}`;
  const currentSpot = current ? spot(current.geo) : null;
  const latest = new Map<string, { event: E; count: number }>();
  for (const ev of events) {
    if (!ev.geo || ev.id === current?.eventId) continue;
    const key = spot(getGeoCenter(ev.geo));
    if (key === currentSpot) continue;
    const kept = latest.get(key);
    if (!kept) latest.set(key, { event: ev, count: 1 });
    else {
      kept.count++;
      if (new Date(ev.date).getTime() >= new Date(kept.event.date).getTime()) kept.event = ev;
    }
  }
  return [...latest.values()];
}

// Breadcrumb diameter: 8px for one event, growing with the log of the count
// (about 14px at 10, 20px at 100), so frequent spots stand out without
// covering the map
export function breadcrumbSize(count: number): number {
  return Math.round(Math.min(22, 8 + 6 * Math.log10(Math.max(1, count))));
}

// Spiderfy: offset markers at the same position.
// Offsets are expressed in SCREEN PIXELS and applied via the MapLibre Marker `offset` option,
// which is added after projection — so the spread stays constant across zoom levels and does
// not distort with latitude. (A previous version perturbed lng/lat in degrees, which made
// co-located markers drift away from their true position during zoom and only snap back on
// zoomend, and corrupted the saved position when such a marker was dragged.)
export function computeSpiderfyOffsets(elements: { id: string; lng: number; lat: number }[]): Map<string, [number, number]> {
  const offsets = new Map<string, [number, number]>();
  const groups = new Map<string, string[]>();

  // Group by position (rounded to ~1m precision at high zoom)
  elements.forEach(el => {
    const key = `${el.lat.toFixed(5)},${el.lng.toFixed(5)}`;
    const group = groups.get(key) || [];
    group.push(el.id);
    groups.set(key, group);
  });

  // For groups with >1 element, apply spiral offset (in pixels)
  groups.forEach(ids => {
    if (ids.length <= 1) return;
    const radius = 25; // px
    ids.forEach((id, i) => {
      if (i === 0) return; // keep first at original position
      const angle = (2 * Math.PI * i) / ids.length;
      const spiralRadius = radius * (1 + i * 0.2);
      offsets.set(id, [
        Math.cos(angle) * spiralRadius,
        Math.sin(angle) * spiralRadius,
      ]);
    });
  });
  return offsets;
}
