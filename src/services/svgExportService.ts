import type { Element, Link, Position, ElementSize } from '../types';

// ============================================================================
// TYPES
// ============================================================================

interface SVGExportSettings {
  linkAnchorMode: 'auto' | 'manual';
  linkCurveMode: 'straight' | 'curved' | 'orthogonal';
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
  return color;
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

function resolveAbsolutePosition(element: Element, elementsMap: Map<string, Element>): Position {
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

function getHandleDirection(handleId: string | null, type: 'source' | 'target'): { dx: number; dy: number } {
  const defaultDir = type === 'source' ? { dx: 1, dy: 0 } : { dx: -1, dy: 0 };
  if (!handleId) return defaultDir;
  const position = handleId.split('-')[1];
  switch (position) {
    case 'top': return { dx: 0, dy: -1 };
    case 'bottom': return { dx: 0, dy: 1 };
    case 'left': return { dx: -1, dy: 0 };
    case 'right': return { dx: 1, dy: 0 };
    default: return defaultDir;
  }
}

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

interface EdgeGeometry {
  path: string;
  labelX: number;
  labelY: number;
  startAngle: number;
  endAngle: number;
  sourcePoint: Position;
  targetPoint: Position;
}

function computeEdgeGeometry(
  sourcePos: Position,
  sourceDims: NodeDimensions,
  targetPos: Position,
  targetDims: NodeDimensions,
  sourceHandleId: string | null,
  targetHandleId: string | null,
  curveMode: 'straight' | 'curved' | 'orthogonal',
  parallelOffset: number,
  curveOffset: { x: number; y: number }
): EdgeGeometry {
  const srcPoint = getConnectionPoint(sourcePos, sourceDims, sourceHandleId);
  const tgtPoint = getConnectionPoint(targetPos, targetDims, targetHandleId);

  const sourceX = srcPoint.x;
  const sourceY = srcPoint.y;
  const targetX = tgtPoint.x;
  const targetY = tgtPoint.y;

  const edgeDx = targetX - sourceX;
  const edgeDy = targetY - sourceY;
  const edgeLength = Math.sqrt(edgeDx * edgeDx + edgeDy * edgeDy);
  const perpX = edgeLength > 0 ? -edgeDy / edgeLength : 0;
  const perpY = edgeLength > 0 ? edgeDx / edgeLength : 0;

  let edgePath: string;
  let labelX: number;
  let labelY: number;
  let startAngle: number;
  let endAngle: number;

  if (curveMode === 'straight') {
    const midX = (sourceX + targetX) / 2 + perpX * parallelOffset;
    const midY = (sourceY + targetY) / 2 + perpY * parallelOffset;
    labelX = midX;
    labelY = midY;
    startAngle = Math.atan2(edgeDy, edgeDx);
    endAngle = startAngle;

    const sx = sourceX + perpX * parallelOffset;
    const sy = sourceY + perpY * parallelOffset;
    const tx = targetX + perpX * parallelOffset;
    const ty = targetY + perpY * parallelOffset;
    edgePath = `M ${sx} ${sy} L ${tx} ${ty}`;
  } else if (curveMode === 'orthogonal') {
    const sourceDir = getHandleDirection(sourceHandleId, 'source');
    const targetDir = getHandleDirection(targetHandleId, 'target');
    const srcHorizontal = sourceDir.dx !== 0;
    const tgtHorizontal = targetDir.dx !== 0;
    const minSegment = 20;
    let waypoints: Position[] = [];

    if (srcHorizontal && tgtHorizontal) {
      const midX = (sourceX + targetX) / 2 + parallelOffset;
      waypoints = [{ x: midX, y: sourceY }, { x: midX, y: targetY }];
    } else if (!srcHorizontal && !tgtHorizontal) {
      const midY = (sourceY + targetY) / 2 + parallelOffset;
      waypoints = [{ x: sourceX, y: midY }, { x: targetX, y: midY }];
    } else if (srcHorizontal && !tgtHorizontal) {
      const goingRight = sourceDir.dx > 0;
      const targetLeft = targetX < sourceX;
      if ((goingRight && !targetLeft) || (!goingRight && targetLeft)) {
        waypoints = [{ x: targetX, y: sourceY + parallelOffset }];
      } else {
        const detourX = sourceX + sourceDir.dx * minSegment;
        const midY = (sourceY + targetY) / 2;
        waypoints = [
          { x: detourX, y: sourceY },
          { x: detourX, y: midY + parallelOffset },
          { x: targetX, y: midY + parallelOffset },
        ];
      }
    } else {
      const goingDown = sourceDir.dy > 0;
      const targetBelow = targetY > sourceY;
      if ((goingDown && targetBelow) || (!goingDown && !targetBelow)) {
        waypoints = [{ x: sourceX + parallelOffset, y: targetY }];
      } else {
        const detourY = sourceY + sourceDir.dy * minSegment;
        const midX = (sourceX + targetX) / 2;
        waypoints = [
          { x: sourceX, y: detourY },
          { x: midX + parallelOffset, y: detourY },
          { x: midX + parallelOffset, y: targetY },
        ];
      }
    }

    if (waypoints.length > 0) {
      startAngle = Math.atan2(waypoints[0].y - sourceY, waypoints[0].x - sourceX);
      const lastWp = waypoints[waypoints.length - 1];
      endAngle = Math.atan2(targetY - lastWp.y, targetX - lastWp.x);
    } else {
      startAngle = Math.atan2(edgeDy, edgeDx);
      endAngle = startAngle;
    }

    let pathParts = [`M ${sourceX} ${sourceY}`];
    for (const wp of waypoints) {
      pathParts.push(`L ${wp.x} ${wp.y}`);
    }
    pathParts.push(`L ${targetX} ${targetY}`);
    edgePath = pathParts.join(' ');

    if (waypoints.length >= 2) {
      const midIndex = Math.floor(waypoints.length / 2);
      const wp1 = midIndex === 0 ? { x: sourceX, y: sourceY } : waypoints[midIndex - 1];
      const wp2 = waypoints[midIndex];
      labelX = (wp1.x + wp2.x) / 2;
      labelY = (wp1.y + wp2.y) / 2;
    } else if (waypoints.length === 1) {
      labelX = (sourceX + waypoints[0].x) / 2;
      labelY = (sourceY + waypoints[0].y) / 2;
    } else {
      labelX = (sourceX + targetX) / 2;
      labelY = (sourceY + targetY) / 2;
    }
  } else {
    // Curved mode
    const hasCustomOffset = curveOffset.x !== 0 || curveOffset.y !== 0;
    const sourceDir = getHandleDirection(sourceHandleId, 'source');
    const targetDir = getHandleDirection(targetHandleId, 'target');
    const curveFactor = Math.max(40, Math.min(edgeLength * 0.3, 80));

    let cp1x: number, cp1y: number, cp2x: number, cp2y: number;

    if (hasCustomOffset) {
      const midX = (sourceX + targetX) / 2;
      const midY = (sourceY + targetY) / 2;
      const controlX = midX + curveOffset.x + perpX * parallelOffset;
      const controlY = midY + curveOffset.y + perpY * parallelOffset;
      cp1x = sourceX + (2 / 3) * (controlX - sourceX);
      cp1y = sourceY + (2 / 3) * (controlY - sourceY);
      cp2x = targetX + (2 / 3) * (controlX - targetX);
      cp2y = targetY + (2 / 3) * (controlY - targetY);
    } else {
      cp1x = sourceX + sourceDir.dx * curveFactor;
      cp1y = sourceY + sourceDir.dy * curveFactor;
      cp2x = targetX + targetDir.dx * curveFactor;
      cp2y = targetY + targetDir.dy * curveFactor;
      if (parallelOffset !== 0) {
        cp1x += perpX * parallelOffset;
        cp1y += perpY * parallelOffset;
        cp2x += perpX * parallelOffset;
        cp2y += perpY * parallelOffset;
      }
    }

    labelX = 0.125 * sourceX + 0.375 * cp1x + 0.375 * cp2x + 0.125 * targetX;
    labelY = 0.125 * sourceY + 0.375 * cp1y + 0.375 * cp2y + 0.125 * targetY;
    startAngle = Math.atan2(cp1y - sourceY, cp1x - sourceX);
    endAngle = Math.atan2(targetY - cp2y, targetX - cp2x);

    edgePath = `M ${sourceX} ${sourceY} C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${targetX} ${targetY}`;
  }

  return { path: edgePath, labelX, labelY, startAngle, endAngle, sourcePoint: srcPoint, targetPoint: tgtPoint };
}

// ============================================================================
// SVG BUILDING
// ============================================================================

function buildArrowPolygon(
  tipX: number,
  tipY: number,
  angle: number
): string {
  const arrowLength = 16;
  const arrowWidth = 12;
  const baseX = tipX - arrowLength * Math.cos(angle);
  const baseY = tipY - arrowLength * Math.sin(angle);
  const leftX = baseX - (arrowWidth / 2) * Math.sin(angle);
  const leftY = baseY + (arrowWidth / 2) * Math.cos(angle);
  const rightX = baseX + (arrowWidth / 2) * Math.sin(angle);
  const rightY = baseY - (arrowWidth / 2) * Math.cos(angle);
  return `${tipX},${tipY} ${leftX},${leftY} ${rightX},${rightY}`;
}

function buildNodeSVG(element: Element, pos: Position, dims: NodeDimensions): string {
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
  geometry: EdgeGeometry,
  hasStartArrow: boolean,
  hasEndArrow: boolean
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
    const points = buildArrowPolygon(geometry.targetPoint.x, geometry.targetPoint.y, geometry.endAngle);
    parts.push(`    <polygon points="${points}" fill="${color}"/>`);
  }
  if (hasStartArrow) {
    const reverseAngle = geometry.startAngle + Math.PI;
    const points = buildArrowPolygon(geometry.sourcePoint.x, geometry.sourcePoint.y, reverseAngle);
    parts.push(`    <polygon points="${points}" fill="${color}"/>`);
  }

  // Label
  if (link.label) {
    parts.push(`    <text x="${geometry.labelX}" y="${geometry.labelY}" text-anchor="middle" dominant-baseline="middle" font-size="12" font-weight="500" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" fill="#3d3833" stroke="#ffffff" stroke-width="3" paint-order="stroke fill">${escapeXml(link.label)}</text>`);
  }

  return `  <g id="edge-${link.id}">\n${parts.join('\n')}\n  </g>`;
}

// ============================================================================
// MAIN EXPORT FUNCTION
// ============================================================================

export function buildSVGExport(
  elements: Element[],
  links: Link[],
  settings: SVGExportSettings
): string {
  const elementsMap = new Map<string, Element>();
  for (const el of elements) elementsMap.set(el.id, el);

  // Separate elements by type, exclude dimmed/hidden (isDimmed handled at canvas level, not in data)
  const groups: Element[] = [];
  const annotations: Element[] = [];
  const normalElements: Element[] = [];

  for (const el of elements) {
    if (el.isGroup) groups.push(el);
    else if (el.isAnnotation) annotations.push(el);
    else normalElements.push(el);
  }

  // Compute absolute positions and dimensions
  const positionsMap = new Map<string, Position>();
  const dimensionsMap = new Map<string, NodeDimensions>();

  for (const el of elements) {
    const absPos = resolveAbsolutePosition(el, elementsMap);
    positionsMap.set(el.id, absPos);

    if (el.isGroup) {
      // Groups use customWidth/customHeight or defaults
      dimensionsMap.set(el.id, {
        width: el.visual.customWidth || 200,
        height: el.visual.customHeight || 150,
      });
    } else if (el.isAnnotation) {
      dimensionsMap.set(el.id, {
        width: el.visual.customWidth || 160,
        height: el.visual.customHeight || 60,
      });
    } else {
      dimensionsMap.set(el.id, computeNodeDimensions(el));
    }
  }

  // Compute parallel edge counts
  const parallelEdgesMap = new Map<string, { link: Link; index: number }[]>();
  for (const link of links) {
    const key = link.fromId < link.toId
      ? `${link.fromId}-${link.toId}`
      : `${link.toId}-${link.fromId}`;
    if (!parallelEdgesMap.has(key)) parallelEdgesMap.set(key, []);
    const entries = parallelEdgesMap.get(key)!;
    entries.push({ link, index: entries.length });
  }

  // Build edge SVGs
  const edgeSvgs: string[] = [];
  for (const link of links) {
    const sourcePos = positionsMap.get(link.fromId);
    const targetPos = positionsMap.get(link.toId);
    const sourceDims = dimensionsMap.get(link.fromId);
    const targetDims = dimensionsMap.get(link.toId);
    if (!sourcePos || !targetPos || !sourceDims || !targetDims) continue;

    // Determine handles
    let sourceHandle = link.sourceHandle;
    let targetHandle = link.targetHandle;
    if (settings.linkAnchorMode === 'auto') {
      const best = calculateBestHandles(
        { x: sourcePos.x + sourceDims.width / 2, y: sourcePos.y + sourceDims.height / 2 },
        { x: targetPos.x + targetDims.width / 2, y: targetPos.y + targetDims.height / 2 }
      );
      sourceHandle = best.sourceHandle;
      targetHandle = best.targetHandle;
    }

    // Parallel offset
    const key = link.fromId < link.toId
      ? `${link.fromId}-${link.toId}`
      : `${link.toId}-${link.fromId}`;
    const entries = parallelEdgesMap.get(key)!;
    const entry = entries.find(e => e.link === link)!;
    const parallelCount = entries.length;
    const parallelSpacing = 30;
    const parallelOffset = parallelCount > 1
      ? (entry.index - (parallelCount - 1) / 2) * parallelSpacing
      : 0;

    const geometry = computeEdgeGeometry(
      sourcePos, sourceDims,
      targetPos, targetDims,
      sourceHandle, targetHandle,
      settings.linkCurveMode,
      parallelOffset,
      link.curveOffset ?? { x: 0, y: 0 }
    );

    // Direction → arrows
    const direction = link.direction ?? (link.directed ? 'forward' : 'none');
    const hasEndArrow = direction === 'forward' || direction === 'both';
    const hasStartArrow = direction === 'backward' || direction === 'both';

    edgeSvgs.push(buildEdgeSVG(link, geometry, hasStartArrow, hasEndArrow));
  }

  // Build node SVGs
  const groupSvgs = groups.map(g => buildGroupSVG(g, positionsMap.get(g.id)!, dimensionsMap.get(g.id)!));
  const nodeSvgs = normalElements.map(el => buildNodeSVG(el, positionsMap.get(el.id)!, dimensionsMap.get(el.id)!));
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
