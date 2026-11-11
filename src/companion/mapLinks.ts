/**
 * Link lines and direction arrows of the companion map, in the properties the
 * desktop's link layers read (components/map/mapLayers.ts ensureLinkLayers).
 * A link is drawn when both its ends are located.
 */

import type { Link } from '../types';
import { safeColor } from '../utils/escapeHtml';

export interface LinkArrow {
  coordinates: [number, number];
  color: string;
  /** Screen rotation of the arrow icon, degrees */
  rotate: number;
}

export function linkFeatures(
  links: Link[],
  positions: Map<string, [number, number]>,
): { lines: GeoJSON.FeatureCollection<GeoJSON.LineString>; arrows: LinkArrow[] } {
  const lines: GeoJSON.Feature<GeoJSON.LineString>[] = [];
  const arrows: LinkArrow[] = [];
  for (const link of links) {
    const from = positions.get(link.fromId);
    const to = positions.get(link.toId);
    if (!from || !to || (from[0] === to[0] && from[1] === to[1])) continue;
    const color = safeColor(link.visual?.color, '#6b6560');
    const style = link.visual?.style === 'dashed' || link.visual?.style === 'dotted' ? link.visual.style : 'solid';
    lines.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [from, to] },
      properties: { linkId: link.id, color, width: Math.max(2, link.visual?.thickness || 2), opacity: 1, style, halo: 1 },
    });
    const angle = Math.atan2(to[1] - from[1], to[0] - from[0]) * (180 / Math.PI);
    const at = (ratio: number): [number, number] => [from[0] + (to[0] - from[0]) * ratio, from[1] + (to[1] - from[1]) * ratio];
    const direction = link.direction || (link.directed ? 'forward' : 'none');
    if (direction === 'forward' || direction === 'both') arrows.push({ coordinates: at(0.92), color, rotate: -angle + 90 });
    if (direction === 'backward' || direction === 'both') arrows.push({ coordinates: at(0.08), color, rotate: -angle - 90 });
  }
  return { lines: { type: 'FeatureCollection', features: lines }, arrows };
}
