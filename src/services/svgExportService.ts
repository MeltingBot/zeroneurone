import type { Element, Link, Position, ElementSize } from '../types';
import { safeColor } from '../utils/escapeHtml';
import { arrowPolygon, computeEdgeRoute, computeHandleSlots, type EdgeRoute } from '../utils/edgeRouting';
import { svgLabelTspans, wrapLabelLines } from '../utils/wrapLabel';

// ============================================================================
// TYPES
// ============================================================================

interface SVGExportSettings {
  linkAnchorMode: 'auto' | 'manual';
  linkCurveMode: 'straight' | 'curved' | 'orthogonal';
  /** Map of assetId → base64 data URL for embedding media in SVG nodes */
  assetDataUrls?: Map<string, string>;
  /** Dossier option: link labels wrap past this many characters. */
  linkLabelWrap?: number;
}

interface NodeDimensions {
  width: number;
  height: number;
}

// ============================================================================
// CSS VARIABLE RESOLUTION
// ============================================================================

const CSS_VAR_MAP: Record<string, string> = {
  '--color-bg-canvas': '#faf8f5',
  '--color-bg-primary': '#fffdf9',
  '--color-bg-secondary': '#f7f4ef',
  '--color-bg-tertiary': '#f0ece4',
  '--color-text-primary': '#3d3833',
  '--color-text-secondary': '#6b6560',
  '--color-text-tertiary': '#9a948d',
  '--color-border-default': '#e8e3db',
  '--color-border-strong': '#d4cec4',
  '--color-border-sketchy': '#b8b0a4',
  '--color-accent': '#e07a5f',
  '--color-node-yellow': '#fcd34d',
  '--color-node-pink': '#f9a8d4',
  '--color-node-blue': '#93c5fd',
  '--color-node-green': '#86efac',
  '--color-node-orange': '#fdba74',
  '--color-node-purple': '#c4b5fd',
  '--color-node-red': '#fca5a5',
  '--color-node-cyan': '#67e8f9',
  '--color-node-lime': '#bef264',
};

function resolveColor(color: string): string {
  if (!color) return '#9a948d';
  if (color.startsWith('var(')) {
    const varName = color.match(/var\((--[^)]+)\)/)?.[1];
    if (varName && CSS_VAR_MAP[varName]) return CSS_VAR_MAP[varName];
    return '#9a948d';
  }
  // Colours reach us from imported archives and collaboration peers, so they
  // cannot go straight into fill=/stroke= attributes of the exported SVG.
  return safeColor(color, '#9a948d');
}

function isLightColor(color: string): boolean {
  const hex = resolveColor(color).replace('#', '');
  if (hex.length !== 6) return true;
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 128;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ============================================================================
// NODE DIMENSIONS (replicates ElementNode.tsx logic)
// ============================================================================

const SIZE_MAP: Record<string, number> = { small: 40, medium: 56, large: 72 };

function getBaseSize(size: ElementSize): number {
  if (typeof size === 'number') return size;
  return SIZE_MAP[size] ?? 56;
}

function computeNodeDimensions(element: Element): NodeDimensions {
  if (element.visual.customWidth && element.visual.customHeight) {
    return { width: element.visual.customWidth, height: element.visual.customHeight };
  }

  const baseSize = getBaseSize(element.visual.size);
  const label = element.label || 'Sans nom';
  const estimatedTextWidth = label.length * 7 + 24;
  const shape = element.visual.shape;

  if (shape === 'rectangle') {
    const width = Math.min(Math.max(estimatedTextWidth * 1.2, 120), 280);
    const height = Math.max(baseSize * 0.5, 40);
    return { width, height };
  }
  if (shape === 'square') {
    const size = Math.max(baseSize, 60);
    return { width: size, height: size };
  }
  if (shape === 'circle') {
    const size = Math.min(Math.max(estimatedTextWidth * 0.8, baseSize, 50), 150);
    return { width: size, height: size };
  }
  if (shape === 'diamond') {
    const size = Math.min(Math.max(estimatedTextWidth * 0.9, baseSize, 60), 150);
    return { width: size, height: size };
  }
  return { width: baseSize, height: baseSize };
}

// ============================================================================
// POSITION RESOLUTION (groups → absolute positions)
// ============================================================================

export function resolveAbsolutePosition(element: Element, elementsMap: Map<string, Element>): Position {
  if (!element.parentGroupId) return element.position;
  const parent = elementsMap.get(element.parentGroupId);
  if (!parent) return element.position;
  const parentPos = resolveAbsolutePosition(parent, elementsMap);
  return {
    x: parentPos.x + element.position.x,
    y: parentPos.y + element.position.y,
  };
}

// ============================================================================
// EDGE GEOMETRY (replicates CustomEdge.tsx logic)
// ============================================================================

function calculateBestHandles(sourcePos: Position, targetPos: Position): { sourceHandle: string; targetHandle: string } {
  const dx = targetPos.x - sourcePos.x;
  const dy = targetPos.y - sourcePos.y;
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0
      ? { sourceHandle: 'source-right', targetHandle: 'target-left' }
      : { sourceHandle: 'source-left', targetHandle: 'target-right' };
  } else {
    return dy > 0
      ? { sourceHandle: 'source-bottom', targetHandle: 'target-top' }
      : { sourceHandle: 'source-top', targetHandle: 'target-bottom' };
  }
}

function getConnectionPoint(
  pos: Position,
  dims: NodeDimensions,
  handleId: string | null
): Position {
  const cx = pos.x + dims.width / 2;
  const cy = pos.y + dims.height / 2;
  if (!handleId) return { x: cx, y: cy };
  const position = handleId.split('-')[1];
  switch (position) {
    case 'top': return { x: cx, y: pos.y };
    case 'bottom': return { x: cx, y: pos.y + dims.height };
    case 'left': return { x: pos.x, y: cy };
    case 'right': return { x: pos.x + dims.width, y: cy };
    default: return { x: cx, y: cy };
  }
}

function getStrokeDasharray(style: string, thickness: number): string | undefined {
  switch (style) {
    case 'dashed': return `${thickness * 4} ${thickness * 2}`;
    case 'dotted': return `${thickness} ${thickness * 2}`;
    default: return undefined;
  }
}

// ============================================================================
// SVG BUILDING
// ============================================================================

function buildNodeSVG(element: Element, pos: Position, dims: NodeDimensions, imageDataUrl?: string): string {
  const color = resolveColor(element.visual.color);
  const borderColor = resolveColor(element.visual.borderColor);
  const borderWidth = element.visual.borderWidth ?? 2;
  const borderStyle = element.visual.borderStyle ?? 'solid';
  const label = element.label || 'Sans nom';
  const textColor = isLightColor(color) ? '#111827' : '#ffffff';

  let dashArray = '';
  if (borderStyle === 'dashed') dashArray = ` stroke-dasharray="${borderWidth * 4} ${borderWidth * 2}"`;
  else if (borderStyle === 'dotted') dashArray = ` stroke-dasharray="${borderWidth} ${borderWidth * 2}"`;

  const cx = pos.x + dims.width / 2;
  const cy = pos.y + dims.height / 2;

  // If element has an image, render with embedded media
  if (imageDataUrl) {
    return buildMediaNodeSVG(element, pos, dims, cx, cy, borderColor, borderWidth, dashArray, imageDataUrl);
  }

  let shapeSvg = '';

  switch (element.visual.shape) {
    case 'circle': {
      const rx = dims.width / 2;
      const ry = dims.height / 2;
      shapeSvg = `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${color}" stroke="${borderColor}" stroke-width="${borderWidth}"${dashArray}/>`;
      break;
    }
    case 'square':
    case 'rectangle': {
      shapeSvg = `<rect x="${pos.x}" y="${pos.y}" width="${dims.width}" height="${dims.height}" rx="3" fill="${color}" stroke="${borderColor}" stroke-width="${borderWidth}"${dashArray}/>`;
      break;
    }
    case 'diamond': {
      // Rotated rect (draw as polygon for cleaner SVG)
      const top = { x: cx, y: pos.y };
      const right = { x: pos.x + dims.width, y: cy };
      const bottom = { x: cx, y: pos.y + dims.height };
      const left = { x: pos.x, y: cy };
      shapeSvg = `<polygon points="${top.x},${top.y} ${right.x},${right.y} ${bottom.x},${bottom.y} ${left.x},${left.y}" fill="${color}" stroke="${borderColor}" stroke-width="${borderWidth}"${dashArray}/>`;
      break;
    }
  }

  // Truncate long labels for display
  const maxChars = Math.floor(dims.width / 7);
  const displayLabel = label.length > maxChars ? label.slice(0, maxChars - 1) + '\u2026' : label;

  const textSvg = `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" font-size="12" font-weight="500" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" fill="${textColor}">${escapeXml(displayLabel)}</text>`;

  return `  <g id="node-${element.id}">\n    ${shapeSvg}\n    ${textSvg}\n  </g>`;
}

function buildMediaNodeSVG(
  element: Element, pos: Position, dims: NodeDimensions,
  cx: number, cy: number,
  borderColor: string, borderWidth: number, dashArray: string,
  imageDataUrl: string
): string {
  const label = element.label || 'Sans nom';
  const clipId = `clip-${element.id}`;
  const labelBarHeight = 18;
  const imageHeight = dims.height - labelBarHeight;
  const parts: string[] = [];

  // clipPath matching the shape (for clipping the image)
  let clipShape = '';
  let borderShape = '';
  switch (element.visual.shape) {
    case 'circle': {
      const rx = dims.width / 2;
      const ry = dims.height / 2;
      clipShape = `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/>`;
      borderShape = `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#f7f4ef" stroke="${borderColor}" stroke-width="${borderWidth}"${dashArray}/>`;
      break;
    }
    case 'square':
    case 'rectangle': {
      clipShape = `<rect x="${pos.x}" y="${pos.y}" width="${dims.width}" height="${dims.height}" rx="3"/>`;
      borderShape = `<rect x="${pos.x}" y="${pos.y}" width="${dims.width}" height="${dims.height}" rx="3" fill="#f7f4ef" stroke="${borderColor}" stroke-width="${borderWidth}"${dashArray}/>`;
      break;
    }
    case 'diamond': {
      const top = `${cx},${pos.y}`;
      const right = `${pos.x + dims.width},${cy}`;
      const bottom = `${cx},${pos.y + dims.height}`;
      const left = `${pos.x},${cy}`;
      clipShape = `<polygon points="${top} ${right} ${bottom} ${left}"/>`;
      borderShape = `<polygon points="${top} ${right} ${bottom} ${left}" fill="#f7f4ef" stroke="${borderColor}" stroke-width="${borderWidth}"${dashArray}/>`;
      break;
    }
  }

  // ClipPath definition
  parts.push(`    <defs><clipPath id="${clipId}">${clipShape}</clipPath></defs>`);

  // Shape background (light fill for letterbox areas)
  parts.push(`    ${borderShape}`);

  // Embedded image — clipped to shape, preserveAspectRatio for contain
  parts.push(`    <image href="${imageDataUrl}" x="${pos.x}" y="${pos.y}" width="${dims.width}" height="${imageHeight > 0 ? imageHeight : dims.height}" preserveAspectRatio="xMidYMid meet" clip-path="url(#${clipId})"/>`);

  // Label bar at bottom (only for rect/square shapes where it looks natural)
  const shape = element.visual.shape;
  if (shape === 'square' || shape === 'rectangle') {
    // Background bar
    parts.push(`    <rect x="${pos.x}" y="${pos.y + dims.height - labelBarHeight}" width="${dims.width}" height="${labelBarHeight}" fill="#f7f4ef" clip-path="url(#${clipId})"/>`);
    // Separator line
    parts.push(`    <line x1="${pos.x}" y1="${pos.y + dims.height - labelBarHeight}" x2="${pos.x + dims.width}" y2="${pos.y + dims.height - labelBarHeight}" stroke="${borderColor}" stroke-width="1"/>`);
    // Label text
    const maxChars = Math.floor(dims.width / 6);
    const displayLabel = label.length > maxChars ? label.slice(0, maxChars - 1) + '\u2026' : label;
    parts.push(`    <text x="${cx}" y="${pos.y + dims.height - labelBarHeight / 2}" text-anchor="middle" dominant-baseline="middle" font-size="10" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" fill="#3d3833">${escapeXml(displayLabel)}</text>`);
  } else {
    // For circle/diamond: label below the shape with stroke for readability
    const maxChars = Math.floor(dims.width / 6);
    const displayLabel = label.length > maxChars ? label.slice(0, maxChars - 1) + '\u2026' : label;
    parts.push(`    <text x="${cx}" y="${pos.y + dims.height + 14}" text-anchor="middle" dominant-baseline="middle" font-size="10" font-weight="500" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" fill="#3d3833" stroke="#faf8f5" stroke-width="3" paint-order="stroke fill">${escapeXml(displayLabel)}</text>`);
  }

  return `  <g id="node-${element.id}">\n${parts.join('\n')}\n  </g>`;
}

function buildGroupSVG(element: Element, pos: Position, dims: NodeDimensions): string {
  const borderColor = resolveColor(element.visual.borderColor || '#e5e7eb');
  const borderStyle = element.visual.borderStyle || 'dashed';
  const borderWidth = element.visual.borderWidth ?? 1;
  const bgColor = element.visual.color && element.visual.color !== '#ffffff'
    ? resolveColor(element.visual.color)
    : '#f3f4f6';

  // Low opacity fill for groups
  const bgOpacity = 0.12;

  let dashArray = '';
  if (borderStyle === 'dashed') dashArray = ` stroke-dasharray="4 2"`;
  else if (borderStyle === 'dotted') dashArray = ` stroke-dasharray="1 2"`;

  const label = element.label || 'Groupe';

  const rectSvg = `<rect x="${pos.x}" y="${pos.y}" width="${dims.width}" height="${dims.height}" rx="4" fill="${bgColor}" fill-opacity="${bgOpacity}" stroke="${borderColor}" stroke-width="${borderWidth}"${dashArray}/>`;
  const textSvg = `<text x="${pos.x + 10}" y="${pos.y + 16}" font-size="11" font-weight="500" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" fill="#6b7280">${escapeXml(label)}</text>`;

  return `  <g id="group-${element.id}">\n    ${rectSvg}\n    ${textSvg}\n  </g>`;
}

function buildAnnotationSVG(element: Element, pos: Position, dims: NodeDimensions): string {
  const borderColor = resolveColor(element.visual.borderColor || '#e8e3db');
  const borderWidth = element.visual.borderWidth ?? 1;
  const borderStyle = element.visual.borderStyle || 'solid';
  const bgColor = resolveColor(element.visual.color || '#fffdf9');

  let dashArray = '';
  if (borderStyle === 'dashed') dashArray = ` stroke-dasharray="${borderWidth * 4} ${borderWidth * 2}"`;
  else if (borderStyle === 'dotted') dashArray = ` stroke-dasharray="${borderWidth} ${borderWidth * 2}"`;

  const text = element.notes || '';
  const lines = text.split('\n').filter(l => l.trim() !== '');

  const rectSvg = `<rect x="${pos.x}" y="${pos.y}" width="${dims.width}" height="${dims.height}" rx="3" fill="${bgColor}" stroke="${borderColor}" stroke-width="${borderWidth}"${dashArray}/>`;

  let textSvg = '';
  if (lines.length > 0) {
    const tspans = lines.slice(0, Math.floor((dims.height - 12) / 16)).map((line, i) => {
      // Strip markdown formatting for plain text SVG
      const clean = line.replace(/^#{1,3}\s+/, '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').replace(/^[-*]\s+/, '  \u2022 ');
      const maxChars = Math.floor((dims.width - 16) / 6.5);
      const displayLine = clean.length > maxChars ? clean.slice(0, maxChars - 1) + '\u2026' : clean;
      return `<tspan x="${pos.x + 8}" dy="${i === 0 ? 0 : 16}">${escapeXml(displayLine)}</tspan>`;
    }).join('\n      ');
    textSvg = `<text x="${pos.x + 8}" y="${pos.y + 16}" font-size="13" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" fill="#6b6560">\n      ${tspans}\n    </text>`;
  }

  return `  <g id="annotation-${element.id}">\n    ${rectSvg}\n    ${textSvg}\n  </g>`;
}

function buildEdgeSVG(
  link: Link,
  geometry: EdgeRoute,
  hasStartArrow: boolean,
  hasEndArrow: boolean,
  labelWrap?: number
): string {
  const color = resolveColor(link.visual.color);
  const thickness = link.visual.thickness ?? 2;
  const dashArray = getStrokeDasharray(link.visual.style, thickness);

  let parts: string[] = [];

  // Path
  let pathAttrs = `d="${geometry.path}" fill="none" stroke="${color}" stroke-width="${thickness}" stroke-linecap="round"`;
  if (dashArray) pathAttrs += ` stroke-dasharray="${dashArray}"`;
  parts.push(`    <path ${pathAttrs}/>`);

  // Arrows
  if (hasEndArrow) {
    const points = arrowPolygon(geometry.targetPoint.x, geometry.targetPoint.y, geometry.endAngle);
    parts.push(`    <polygon points="${points}" fill="${color}"/>`);
  }
  if (hasStartArrow) {
    const points = arrowPolygon(geometry.sourcePoint.x, geometry.sourcePoint.y, geometry.startAngle + Math.PI);
    parts.push(`    <polygon points="${points}" fill="${color}"/>`);
  }

  // Label
  if (link.label) {
    parts.push(`    <text x="${geometry.labelX}" y="${geometry.labelY}" text-anchor="middle" dominant-baseline="middle" font-size="12" font-weight="500" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" fill="#3d3833" stroke="#ffffff" stroke-width="3" paint-order="stroke fill">${svgLabelTspans(wrapLabelLines(link.label, labelWrap), geometry.labelX, geometry.labelY, 15, escapeXml)}</text>`);
  }

  return `  <g id="edge-${link.id}">\n${parts.join('\n')}\n  </g>`;
}

// ============================================================================
// LAYOUT AND LINK ROUTES (shared with the interactive report)
// ============================================================================

export interface NodeLayout {
  /** Absolute top-left corner of every element */
  positions: Map<string, Position>;
  dimensions: Map<string, NodeDimensions>;
}

/** Absolute positions (groups resolved) and drawn sizes of the elements. */
export function computeNodeLayout(elements: Element[]): NodeLayout {
  const elementsMap = new Map<string, Element>();
  for (const el of elements) elementsMap.set(el.id, el);
  const positions = new Map<string, Position>();
  const dimensions = new Map<string, NodeDimensions>();

  for (const el of elements) {
    positions.set(el.id, resolveAbsolutePosition(el, elementsMap));
    if (el.isGroup) {
      // Groups use customWidth/customHeight or defaults
      dimensions.set(el.id, { width: el.visual.customWidth || 200, height: el.visual.customHeight || 150 });
    } else if (el.isAnnotation) {
      dimensions.set(el.id, { width: el.visual.customWidth || 160, height: el.visual.customHeight || 60 });
    } else {
      dimensions.set(el.id, computeNodeDimensions(el));
    }
  }
  return { positions, dimensions };
}

export interface RoutedLink {
  link: Link;
  route: EdgeRoute;
  hasStartArrow: boolean;
  hasEndArrow: boolean;
}

/**
 * Route of every link whose ends are laid out: handles, parallel ranks, slots along shared node
 * sides, then the same routing as the canvas (utils/edgeRouting).
 */
export function computeLinkRoutes(
  links: Link[],
  layout: NodeLayout,
  settings: Pick<SVGExportSettings, 'linkAnchorMode' | 'linkCurveMode'>
): RoutedLink[] {
  const { positions, dimensions } = layout;
  const placed: { link: Link; sourceHandle: string; targetHandle: string; parallelIndex: number; parallelCount: number }[] = [];
  const pairGroups = new Map<string, Link[]>();
  for (const link of links) {
    if (!positions.has(link.fromId) || !positions.has(link.toId)) continue;
    if (!dimensions.has(link.fromId) || !dimensions.has(link.toId)) continue;
    const key = link.fromId < link.toId ? `${link.fromId}-${link.toId}` : `${link.toId}-${link.fromId}`;
    const group = pairGroups.get(key) ?? [];
    group.push(link);
    pairGroups.set(key, group);
  }
  for (const group of pairGroups.values()) {
    group.forEach((link, index) => {
      const sourcePos = positions.get(link.fromId)!;
      const targetPos = positions.get(link.toId)!;
      const sourceDims = dimensions.get(link.fromId)!;
      const targetDims = dimensions.get(link.toId)!;
      let sourceHandle = link.sourceHandle ?? 'source-right';
      let targetHandle = link.targetHandle ?? 'target-left';
      if ((link.anchorMode ?? settings.linkAnchorMode) === 'auto') {
        const best = calculateBestHandles(
          { x: sourcePos.x + sourceDims.width / 2, y: sourcePos.y + sourceDims.height / 2 },
          { x: targetPos.x + targetDims.width / 2, y: targetPos.y + targetDims.height / 2 }
        );
        sourceHandle = best.sourceHandle;
        targetHandle = best.targetHandle;
      }
      placed.push({ link, sourceHandle, targetHandle, parallelIndex: index, parallelCount: group.length });
    });
  }
  const handleSlots = computeHandleSlots(
    placed.map(r => ({
      id: r.link.id, fromId: r.link.fromId, toId: r.link.toId,
      sourceHandle: r.sourceHandle, targetHandle: r.targetHandle, tie: r.parallelIndex,
    })),
    positions
  );

  return placed.map(({ link, sourceHandle, targetHandle, parallelIndex, parallelCount }) => {
    const sourcePoint = getConnectionPoint(positions.get(link.fromId)!, dimensions.get(link.fromId)!, sourceHandle);
    const targetPoint = getConnectionPoint(positions.get(link.toId)!, dimensions.get(link.toId)!, targetHandle);
    const direction = link.direction ?? (link.directed ? 'forward' : 'none');
    const hasEndArrow = direction === 'forward' || direction === 'both';
    const hasStartArrow = direction === 'backward' || direction === 'both';
    const slots = handleSlots.get(link.id);
    const route = computeEdgeRoute({
      sourceX: sourcePoint.x,
      sourceY: sourcePoint.y,
      targetX: targetPoint.x,
      targetY: targetPoint.y,
      sourceHandleId: sourceHandle,
      targetHandleId: targetHandle,
      curveMode: settings.linkCurveMode,
      parallelIndex,
      parallelCount,
      sourceSlot: slots?.source ?? 0,
      targetSlot: slots?.target ?? 0,
      // Each route style keeps its own manual offset
      offset: (settings.linkCurveMode === 'orthogonal' ? link.orthogonalOffset : link.curveOffset) ?? { x: 0, y: 0 },
      hasStartArrow,
      hasEndArrow,
    });
    return { link, route, hasStartArrow, hasEndArrow };
  });
}

// ============================================================================
// MAIN EXPORT FUNCTION
// ============================================================================

export function buildSVGExport(
  elements: Element[],
  links: Link[],
  settings: SVGExportSettings
): string {
  // Separate elements by type, exclude dimmed/hidden (isDimmed handled at canvas level, not in data)
  const groups: Element[] = [];
  const annotations: Element[] = [];
  const normalElements: Element[] = [];

  for (const el of elements) {
    if (el.isGroup) groups.push(el);
    else if (el.isAnnotation) annotations.push(el);
    else normalElements.push(el);
  }

  const layout = computeNodeLayout(elements);
  const positionsMap = layout.positions;
  const dimensionsMap = layout.dimensions;

  // Build edge SVGs
  const edgeSvgs = computeLinkRoutes(links, layout, settings)
    .map(({ link, route, hasStartArrow, hasEndArrow }) => buildEdgeSVG(link, route, hasStartArrow, hasEndArrow, settings.linkLabelWrap));

  // Build node SVGs
  const assetDataUrls = settings.assetDataUrls;
  const groupSvgs = groups.map(g => buildGroupSVG(g, positionsMap.get(g.id)!, dimensionsMap.get(g.id)!));
  const nodeSvgs = normalElements.map(el => {
    const firstAssetId = el.assetIds?.[0];
    const imageDataUrl = firstAssetId && assetDataUrls ? assetDataUrls.get(firstAssetId) : undefined;
    return buildNodeSVG(el, positionsMap.get(el.id)!, dimensionsMap.get(el.id)!, imageDataUrl);
  });
  const annotationSvgs = annotations.map(a => buildAnnotationSVG(a, positionsMap.get(a.id)!, dimensionsMap.get(a.id)!));

  // Compute viewBox
  const padding = 50;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of elements) {
    const pos = positionsMap.get(el.id)!;
    const dims = dimensionsMap.get(el.id)!;
    minX = Math.min(minX, pos.x);
    minY = Math.min(minY, pos.y);
    maxX = Math.max(maxX, pos.x + dims.width);
    maxY = Math.max(maxY, pos.y + dims.height);
  }

  // Handle empty canvas
  if (!isFinite(minX)) {
    minX = 0; minY = 0; maxX = 800; maxY = 600;
  }

  minX -= padding;
  minY -= padding;
  const svgWidth = (maxX - minX) + padding;
  const svgHeight = (maxY - minY) + padding;

  // Assemble SVG
  const svgParts: string[] = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${svgWidth} ${svgHeight}" width="${svgWidth}" height="${svgHeight}">`,
    `  <rect x="${minX}" y="${minY}" width="${svgWidth}" height="${svgHeight}" fill="#faf8f5"/>`,
  ];

  if (groupSvgs.length > 0) {
    svgParts.push(`  <g id="groups">`);
    svgParts.push(...groupSvgs);
    svgParts.push(`  </g>`);
  }

  if (edgeSvgs.length > 0) {
    svgParts.push(`  <g id="edges">`);
    svgParts.push(...edgeSvgs);
    svgParts.push(`  </g>`);
  }

  if (nodeSvgs.length > 0) {
    svgParts.push(`  <g id="nodes">`);
    svgParts.push(...nodeSvgs);
    svgParts.push(`  </g>`);
  }

  if (annotationSvgs.length > 0) {
    svgParts.push(`  <g id="annotations">`);
    svgParts.push(...annotationSvgs);
    svgParts.push(`  </g>`);
  }

  svgParts.push(`</svg>`);

  return svgParts.join('\n');
}
