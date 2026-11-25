/**
 * The map drawn as a standalone SVG (export): the basemap as an embedded
 * image, then zones, links, markers, clusters and link labels as vectors.
 * Pure: everything comes in screen pixels (see mapSvgCapture.ts).
 */

import { escapeXml } from '../../utils/escapeHtml';

type Point = [number, number];

/** A box on screen: left, top, width, height in px */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MapSvgZone {
  rings: Point[][];
  fill: string;
  stroke: string;
  fillOpacity: number;
  strokeWidth: number;
  strokeOpacity: number;
}

export interface MapSvgLine {
  points: Point[];
  color: string;
  width: number;
  opacity: number;
  style: 'solid' | 'dashed' | 'dotted';
  /** White outline under the line */
  halo: boolean;
}

export interface MapSvgArrow {
  x: number;
  y: number;
  /** Clockwise, degrees */
  rotate: number;
  color: string;
  opacity: number;
}

/** A label pill: its box and text */
export interface MapSvgLabel {
  box: Box;
  text: string;
}

export type MapSvgMarker =
  | { kind: 'dot'; dot: Box; fill: string; stroke: string; opacity: number; label: MapSvgLabel | null }
  | { kind: 'card'; card: Box; image: string | null; stroke: string; opacity: number; label: MapSvgLabel | null }
  | { kind: 'breadcrumb'; dot: Box; fill: string; stroke: string; opacity: number };

export interface MapSvgCluster {
  box: Box;
  count: string;
  opacity: number;
}

export interface MapSvgInput {
  width: number;
  height: number;
  /** Basemap as a data URL (null: could not be read, a plain fill stands for it) */
  background: string | null;
  zones: MapSvgZone[];
  lines: MapSvgLine[];
  arrows: MapSvgArrow[];
  markers: MapSvgMarker[];
  clusters: MapSvgCluster[];
  linkLabels: MapSvgLabel[];
  /** Basemap credits, written in a corner (required by the tile providers) */
  attribution?: string;
  /** Anonymous mode: grey blocks stand for the labels */
  anonymous: boolean;
}

const FONT = `font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"`;
const TEXT = '#3d3833';
const BORDER = '#e8e3db';
const BORDER_STRONG = '#d4cec4';
const ACCENT = '#e07a5f';
const DASHES = { dashed: [10, 6], dotted: [3, 6] } as const;

/** Numbers kept short in the file */
const n = (v: number) => Math.round(v * 100) / 100;
/** Attribute value: colours read from the page are rgb()/hex, escaped all the same */
const attr = (v: string) => escapeXml(v);
const opacityAttr = (o: number) => (o < 1 ? ` opacity="${n(o)}"` : '');

function pillSvg(label: MapSvgLabel, fontSize: number, anonymous: boolean, stroke = BORDER, weight = 500): string {
  const { box, text } = label;
  const rect = `<rect x="${n(box.x)}" y="${n(box.y)}" width="${n(box.w)}" height="${n(box.h)}" rx="3" fill="#ffffff" stroke="${stroke}" stroke-width="1"/>`;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  if (anonymous || !text) {
    const w = Math.min(box.w - 8, 28);
    return `${rect}<rect x="${n(cx - w / 2)}" y="${n(cy - 4)}" width="${n(w)}" height="8" rx="2" fill="${TEXT}"/>`;
  }
  return `${rect}<text x="${n(cx)}" y="${n(cy)}" text-anchor="middle" dominant-baseline="central" font-size="${fontSize}" font-weight="${weight}" ${FONT} fill="${TEXT}">${escapeXml(text)}</text>`;
}

function zoneSvg(zone: MapSvgZone): string {
  const d = zone.rings
    .map((ring) => `M${ring.map(([x, y]) => `${n(x)},${n(y)}`).join(' L')} Z`)
    .join(' ');
  return `<path d="${d}" fill="${attr(zone.fill)}" fill-opacity="${n(zone.fillOpacity)}" stroke="${attr(zone.stroke)}" stroke-width="${n(zone.strokeWidth)}" stroke-opacity="${n(zone.strokeOpacity)}" fill-rule="evenodd"/>`;
}

function lineSvg(line: MapSvgLine): string {
  const points = line.points.map(([x, y]) => `${n(x)},${n(y)}`).join(' ');
  const parts: string[] = [];
  if (line.halo) {
    parts.push(`<polyline points="${points}" fill="none" stroke="#ffffff" stroke-width="${n(line.width + 4)}" stroke-opacity="${n(0.9 * line.opacity)}" stroke-linecap="round" stroke-linejoin="round"/>`);
  }
  // MapLibre dashes are in line widths
  const dash = line.style === 'solid' ? '' : ` stroke-dasharray="${DASHES[line.style].map((v) => n(v * line.width)).join(' ')}"`;
  parts.push(`<polyline points="${points}" fill="none" stroke="${attr(line.color)}" stroke-width="${n(line.width)}" stroke-opacity="${n(line.opacity)}" stroke-linecap="round" stroke-linejoin="round"${dash}/>`);
  return parts.join('');
}

/** The arrow drawn on the map (same path as its icon), centred on its point */
function arrowSvg(arrow: MapSvgArrow): string {
  return `<g transform="translate(${n(arrow.x)} ${n(arrow.y)}) rotate(${n(arrow.rotate)})"${opacityAttr(arrow.opacity)}><path d="M10 2 L18 18 L10 13 L2 18 Z" transform="translate(-10 -10)" fill="${attr(arrow.color)}" stroke="#ffffff" stroke-width="2" stroke-linejoin="round"/></g>`;
}

function markerSvg(marker: MapSvgMarker, anonymous: boolean, index: number): string {
  if (marker.kind === 'breadcrumb') {
    const { dot } = marker;
    return `<circle cx="${n(dot.x + dot.w / 2)}" cy="${n(dot.y + dot.h / 2)}" r="${n(dot.w / 2)}" fill="${attr(marker.fill)}" stroke="${attr(marker.stroke)}" stroke-width="1.5"${opacityAttr(marker.opacity)}/>`;
  }
  if (marker.kind === 'dot') {
    const { dot } = marker;
    const parts = [`<circle cx="${n(dot.x + dot.w / 2)}" cy="${n(dot.y + dot.h / 2)}" r="${n(dot.w / 2 - 1)}" fill="${attr(marker.fill)}" stroke="${attr(marker.stroke)}" stroke-width="2"/>`];
    if (marker.label) parts.push(pillSvg(marker.label, 9, anonymous));
    return `<g${opacityAttr(marker.opacity)}>${parts.join('')}</g>`;
  }
  // Card: the element's image on top, its label underneath
  const { card } = marker;
  const imageH = marker.label ? marker.label.box.y - card.y : card.h;
  const clipId = `mk-${index}`;
  const parts = [
    `<rect x="${n(card.x)}" y="${n(card.y)}" width="${n(card.w)}" height="${n(card.h)}" rx="4" fill="#ffffff" stroke="${attr(marker.stroke)}" stroke-width="1"/>`,
  ];
  if (marker.image) {
    parts.push(`<clipPath id="${clipId}"><rect x="${n(card.x)}" y="${n(card.y)}" width="${n(card.w)}" height="${n(imageH)}" rx="4"/></clipPath>`);
    parts.push(`<image href="${attr(marker.image)}" x="${n(card.x)}" y="${n(card.y)}" width="${n(card.w)}" height="${n(imageH)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})"/>`);
  } else {
    parts.push(`<rect x="${n(card.x + 1)}" y="${n(card.y + 1)}" width="${n(card.w - 2)}" height="${n(imageH - 1)}" rx="3" fill="#f7f4ef"/>`);
  }
  if (marker.label) {
    const { box, text } = marker.label;
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    parts.push(`<line x1="${n(card.x)}" y1="${n(box.y)}" x2="${n(card.x + card.w)}" y2="${n(box.y)}" stroke="${BORDER}" stroke-width="1"/>`);
    parts.push(anonymous || !text
      ? `<rect x="${n(cx - 14)}" y="${n(cy - 4)}" width="28" height="8" rx="2" fill="${TEXT}"/>`
      : `<text x="${n(cx)}" y="${n(cy)}" text-anchor="middle" dominant-baseline="central" font-size="9" font-weight="500" ${FONT} fill="${TEXT}">${escapeXml(text)}</text>`);
  }
  return `<g${opacityAttr(marker.opacity)}>${parts.join('')}</g>`;
}

function clusterSvg(cluster: MapSvgCluster): string {
  const { box } = cluster;
  const r = box.w / 2;
  const cx = box.x + r;
  const cy = box.y + box.h / 2;
  const size = box.w >= 44 ? 14 : box.w >= 36 ? 13 : 12;
  return `<g${opacityAttr(cluster.opacity)}><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r - 1)}" fill="${ACCENT}" stroke="#ffffff" stroke-width="2"/><text x="${n(cx)}" y="${n(cy)}" text-anchor="middle" dominant-baseline="central" font-size="${size}" font-weight="600" ${FONT} fill="#ffffff">${escapeXml(cluster.count)}</text></g>`;
}

/** The map as drawn on screen, in a standalone SVG */
export function buildMapSVG(input: MapSvgInput): string {
  const { width, height, anonymous } = input;
  const attribution = input.attribution?.trim()
    ? `<text x="${width - 6}" y="${height - 6}" text-anchor="end" font-size="9" ${FONT} fill="${TEXT}" stroke="#ffffff" stroke-width="3" paint-order="stroke fill">${escapeXml(input.attribution.trim())}</text>`
    : '';
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<defs><clipPath id="map-frame"><rect x="0" y="0" width="${width}" height="${height}"/></clipPath></defs>`,
    `<g clip-path="url(#map-frame)">`,
    input.background
      ? `<image href="${attr(input.background)}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none"/>`
      : `<rect x="0" y="0" width="${width}" height="${height}" fill="#e5e3df"/>`,
    `<g id="zones">${input.zones.map(zoneSvg).join('')}</g>`,
    `<g id="links">${input.lines.map(lineSvg).join('')}${input.arrows.map(arrowSvg).join('')}</g>`,
    `<g id="link-labels">${input.linkLabels.map((l) => pillSvg(l, 10, anonymous, BORDER_STRONG)).join('')}</g>`,
    `<g id="markers">${input.markers.map((m, i) => markerSvg(m, anonymous, i)).join('')}</g>`,
    `<g id="clusters">${input.clusters.map(clusterSvg).join('')}</g>`,
    attribution,
    '</g>',
    '</svg>',
  ].join('\n');
}
