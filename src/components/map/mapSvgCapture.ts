/**
 * What the map shows, gathered for the SVG export (see mapSvg.ts): the
 * basemap read from the WebGL canvas without the app's layers, links and
 * zones from their sources, markers, clusters and link labels from where the
 * page placed them.
 */

import type * as maplibregl from 'maplibre-gl';
import { LINK_LINES_SOURCE, LINK_ARROWS_SOURCE, LINK_OUTLINE_LAYER, LINK_LINE_LAYERS } from './mapLayers';
import type { Box, MapSvgArrow, MapSvgCluster, MapSvgInput, MapSvgLabel, MapSvgLine, MapSvgMarker, MapSvgZone } from './mapSvg';

const ZONE_SOURCE = 'zones-source';
/** Layers drawn again as vectors: hidden while the basemap is read */
const OVERLAY_LAYERS = [LINK_OUTLINE_LAYER, ...Object.values(LINK_LINE_LAYERS), 'link-arrows', 'zones-fill', 'zones-outline', 'zones-extrusion'];

type Point = [number, number];

export interface MapSvgCaptureRefs {
  markers: Map<string, maplibregl.Marker>;
  clusters: Map<number, maplibregl.Marker>;
  linkLabels: Map<string, maplibregl.Marker>;
}

/** Box of a node relative to the map container */
function boxOf(node: Element, frame: DOMRect): Box {
  const r = node.getBoundingClientRect();
  return { x: r.left - frame.left, y: r.top - frame.top, w: r.width, h: r.height };
}

const visible = (node: HTMLElement) => node.style.display !== 'none' && node.isConnected;

/** Basemap as an image: the app's layers hidden for one frame */
async function readBasemap(map: maplibregl.Map): Promise<string | null> {
  const hidden: { id: string; was: unknown }[] = [];
  for (const id of OVERLAY_LAYERS) {
    if (!map.getLayer(id)) continue;
    hidden.push({ id, was: map.getLayoutProperty(id, 'visibility') });
    map.setLayoutProperty(id, 'visibility', 'none');
  }
  try {
    await new Promise<void>((resolve) => {
      // Tiles still loading: wait for them, within limits
      const timer = setTimeout(resolve, 4000);
      map.once('idle', () => { clearTimeout(timer); resolve(); });
      map.triggerRepaint();
    });
    // The drawing buffer is kept (preserveDrawingBuffer): read as rendered
    return map.getCanvas().toDataURL('image/png');
  } catch (err) {
    // A tainted canvas (tile server without CORS): exported without basemap
    console.warn('Map export: basemap unreadable', err);
    return null;
  } finally {
    for (const { id, was } of hidden) {
      map.setLayoutProperty(id, 'visibility', (was as 'visible' | 'none' | undefined) ?? 'visible');
    }
  }
}

async function sourceFeatures(map: maplibregl.Map, id: string): Promise<GeoJSON.Feature[]> {
  const source = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
  if (!source) return [];
  try {
    const data = await source.getData();
    return data && 'features' in data ? (data as GeoJSON.FeatureCollection).features : [];
  } catch {
    return [];
  }
}

const project = (map: maplibregl.Map, c: GeoJSON.Position): Point => {
  const p = map.project([c[0], c[1]]);
  return [p.x, p.y];
};

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const str = (v: unknown, fallback: string) => (typeof v === 'string' && v ? v : fallback);

async function readLinks(map: maplibregl.Map): Promise<{ lines: MapSvgLine[]; arrows: MapSvgArrow[] }> {
  const lines: MapSvgLine[] = [];
  for (const f of await sourceFeatures(map, LINK_LINES_SOURCE)) {
    if (f.geometry.type !== 'LineString') continue;
    const p = f.properties ?? {};
    const style = p.style === 'dashed' || p.style === 'dotted' ? p.style : 'solid';
    lines.push({
      points: f.geometry.coordinates.map((c) => project(map, c)),
      color: str(p.color, '#6b6560'),
      width: num(p.width, 2),
      opacity: num(p.opacity, 1),
      style,
      halo: num(p.halo, 1) > 0,
    });
  }
  const arrows: MapSvgArrow[] = [];
  for (const f of await sourceFeatures(map, LINK_ARROWS_SOURCE)) {
    if (f.geometry.type !== 'Point') continue;
    const p = f.properties ?? {};
    const [x, y] = project(map, f.geometry.coordinates);
    // The icon id carries its colour: "link-arrow-#aabbcc"
    const color = str(p.icon, '').replace(/^link-arrow-/, '') || '#6b6560';
    arrows.push({ x, y, rotate: num(p.rotate, 0), color, opacity: num(p.opacity, 1) });
  }
  return { lines, arrows };
}

async function readZones(map: maplibregl.Map): Promise<MapSvgZone[]> {
  if (!map.getLayer('zones-fill')) return [];
  const zones: MapSvgZone[] = [];
  for (const f of await sourceFeatures(map, ZONE_SOURCE)) {
    if (f.geometry.type !== 'Polygon') continue;
    const p = f.properties ?? {};
    // Same paint as ZoneLayers
    zones.push({
      rings: f.geometry.coordinates.map((ring) => ring.map((c) => project(map, c))),
      fill: str(p.color, '#10b981'),
      stroke: str(p.borderColor, '#059669'),
      fillOpacity: p.isDimmed ? 0.05 : p.isSelected ? 0.35 : 0.2,
      strokeWidth: p.isSelected ? 3 : 2,
      strokeOpacity: p.isDimmed ? 0.3 : 1,
    });
  }
  return zones;
}

/** Label pill of a marker: its box and text (empty in anonymous mode) */
function labelOf(node: Element | null, frame: DOMRect): MapSvgLabel | null {
  if (!node) return null;
  return { box: boxOf(node, frame), text: node.textContent?.trim() ?? '' };
}

function readMarkers(markers: Map<string, maplibregl.Marker>, frame: DOMRect, hideMedia: boolean): MapSvgMarker[] {
  const out: MapSvgMarker[] = [];
  for (const marker of markers.values()) {
    const root = marker.getElement();
    if (!visible(root)) continue;
    const crumb = root.querySelector<HTMLElement>('.map-breadcrumb');
    if (crumb) {
      const cs = getComputedStyle(crumb);
      out.push({ kind: 'breadcrumb', dot: boxOf(crumb, frame), fill: cs.backgroundColor, stroke: cs.borderTopColor, opacity: Number(cs.opacity) || 1 });
      continue;
    }
    const simple = root.querySelector<HTMLElement>('.map-marker-simple');
    if (simple) {
      // The dot is the 16 px disc; the pill follows it
      const dot = Array.from(simple.children).find((c) => (c as HTMLElement).style.width === '16px') as HTMLElement | undefined;
      if (!dot) continue;
      const pill = dot.nextElementSibling;
      const cs = getComputedStyle(dot);
      out.push({
        kind: 'dot',
        dot: boxOf(dot, frame),
        fill: cs.backgroundColor,
        stroke: cs.borderTopColor,
        opacity: Number(getComputedStyle(simple).opacity) || 1,
        label: labelOf(pill, frame),
      });
      continue;
    }
    const card = root.querySelector<HTMLElement>('.map-marker-card');
    if (card) {
      const imageNode = card.querySelector<HTMLElement>('div[style*="background-image"]');
      const url = imageNode?.style.backgroundImage.match(/url\(["']?(data:image\/[^"')]+)["']?\)/)?.[1] ?? null;
      const labelNode = card.lastElementChild;
      out.push({
        kind: 'card',
        card: boxOf(card, frame),
        // Blurred on screen: not written in the file
        image: hideMedia ? null : url,
        stroke: getComputedStyle(card).borderTopColor,
        opacity: Number(getComputedStyle(card).opacity) || 1,
        label: labelOf(labelNode && labelNode !== imageNode ? labelNode : null, frame),
      });
    }
  }
  return out;
}

function readClusters(clusters: Map<number, maplibregl.Marker>, frame: DOMRect): MapSvgCluster[] {
  const out: MapSvgCluster[] = [];
  for (const marker of clusters.values()) {
    const root = marker.getElement();
    const icon = root.querySelector<HTMLElement>('.cluster-icon');
    if (!icon || !visible(root)) continue;
    out.push({ box: boxOf(icon, frame), count: icon.textContent?.trim() ?? '', opacity: Number(getComputedStyle(icon).opacity) || 1 });
  }
  return out;
}

function readLinkLabels(labels: Map<string, maplibregl.Marker>, frame: DOMRect): MapSvgLabel[] {
  const out: MapSvgLabel[] = [];
  for (const marker of labels.values()) {
    const node = marker.getElement();
    if (!visible(node)) continue;
    out.push({ box: boxOf(node, frame), text: node.textContent?.trim() ?? '' });
  }
  return out;
}

/** Everything the SVG export draws, read from the map as it is on screen */
export async function captureMapSvgInput(
  map: maplibregl.Map,
  refs: MapSvgCaptureRefs,
  options: { anonymous: boolean; hideMedia: boolean },
): Promise<MapSvgInput> {
  const container = map.getContainer();
  const frame = container.getBoundingClientRect();
  const background = await readBasemap(map);
  const [{ lines, arrows }, zones] = await Promise.all([readLinks(map), readZones(map)]);
  // In anonymous mode, link labels show blocks: their text is not written
  const linkLabels = readLinkLabels(refs.linkLabels, frame).map((l) => (options.anonymous ? { ...l, text: '' } : l));
  return {
    width: Math.round(frame.width),
    height: Math.round(frame.height),
    background,
    zones,
    lines,
    arrows,
    markers: readMarkers(refs.markers, frame, options.hideMedia),
    clusters: readClusters(refs.clusters, frame),
    linkLabels,
    attribution: container.querySelector('.maplibregl-ctrl-attrib-inner')?.textContent ?? '',
    anonymous: options.anonymous,
  };
}
