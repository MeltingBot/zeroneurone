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
export function computeSpiderfyOffsets(elements: { id: string; lng: number; lat: number; tall?: boolean }[]): Map<string, [number, number]> {
  const offsets = new Map<string, [number, number]>();
  const groups = new Map<string, { id: string; tall?: boolean }[]>();

  // Group by position (rounded to ~1m precision at high zoom)
  elements.forEach(el => {
    const key = `${el.lat.toFixed(5)},${el.lng.toFixed(5)}`;
    const group = groups.get(key) || [];
    group.push(el);
    groups.set(key, group);
  });

  groups.forEach(group => {
    if (group.length <= 1) return;
    const grid = spreadAround(group.length, group.some(el => el.tall));
    group.forEach((el, i) => offsets.set(el.id, grid[i]));
  });
  return offsets;
}

// Markers sharing one spot, spread around it (pixel offsets) so that none
// overlap, labels included: on a circle up to 8, on a compact grid beyond (a
// circle wide enough for more labels would cover the whole area). A spiral
// whose radius grew with each marker drew a large "snail" of overlapping
// labels for a few dozen elements on the same cell tower.
const CELL_W = 84;
const CIRCLE_MAX = 8;

export function spreadAround(count: number, tall = false): [number, number][] {
  const cellH = tall ? 76 : 40;
  if (count <= CIRCLE_MAX) return spreadCircle(count, cellH);
  // About as wide as tall overall
  const cols = Math.max(1, Math.ceil(Math.sqrt((count * cellH) / CELL_W)));
  const rows = Math.ceil(count / cols);
  const result: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / cols);
    const inRow = row === rows - 1 ? count - row * cols : cols;
    const col = i % cols;
    result.push([(col - (inRow - 1) / 2) * CELL_W, (row - (rows - 1) / 2) * cellH]);
  }
  return result;
}

// Smallest circle (first marker on top) on which no two marker boxes overlap
function spreadCircle(count: number, cellH: number): [number, number][] {
  const place = (r: number) =>
    Array.from({ length: count }, (_, i): [number, number] => {
      const angle = -Math.PI / 2 + (2 * Math.PI * i) / count;
      return [Math.cos(angle) * r, Math.sin(angle) * r];
    });
  const overlaps = (pts: [number, number][]) =>
    pts.some((a, i) => pts.some((b, j) => j > i && Math.abs(a[0] - b[0]) < CELL_W && Math.abs(a[1] - b[1]) < cellH));
  let r = 24;
  let pts = place(r);
  while (overlaps(pts) && r < 400) {
    r += 4;
    pts = place(r);
  }
  return pts;
}
