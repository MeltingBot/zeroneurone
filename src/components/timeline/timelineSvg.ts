/** The timeline drawn as a standalone vector SVG (export), as the view draws it */

import { escapeXml } from '../../utils/escapeHtml';
import { resolveExportColor } from '../../services/svgExportService';
import { computeAxisLabels, type AxisLabel } from './timelineAxis';
import { ROW_HEIGHT, ROW_GAP } from './timelineConstants';
import type { TimelineItem } from './timelineItems';
import type { LaneGroup } from './useSwimlaneGrouping';
import {
  computeSwimlaneLayout,
  SWIMLANE_LABEL_WIDTH,
  SWIMLANE_LANE_PADDING,
  SWIMLANE_LINK_HEIGHT_COMPACT,
} from './useSwimlaneLayout';

const DAY_MS = 24 * 60 * 60 * 1000;
const AXIS_HEIGHT = 28;
/** Width of a character at the label sizes (system font): text has no layout in SVG */
const CHAR_PX = { 10: 5.6, 11: 6.2, 12: 6.5 } as const;
const OUTSIDE_LABEL_GAP = 6;
const RIGHT_MARGIN = 16;
const FONT = `font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"`;

/** Theme colours of the light theme, written as values (the file leaves the app) */
const C = {
  bg: '#fffdf9',
  bgAlt: '#f7f4ef',
  text: '#3d3833',
  textSecondary: '#6b6560',
  textTertiary: '#9a948d',
  border: '#e8e3db',
  borderStrong: '#d4cec4',
  today: '#c75d5d',
};

export interface TimelineSvgInput {
  mode: 'scatter' | 'swimlane';
  /** Scatter: the items in row order (one row each) */
  items: TimelineItem[];
  /** Swimlane: the lanes in their order */
  lanes: LaneGroup[];
  collapsedLanes: Set<string>;
  /** Left edge of the drawing and its scale (px per day) */
  viewStart: Date;
  zoom: number;
  /** Width of the time span drawn, in px */
  width: number;
  language: string;
  /** Anonymous mode: no label nor letter is written, grey blocks stand for them */
  anonymous: boolean;
}

const isLinkItem = (item: TimelineItem) =>
  item.type === 'link' || (item.type === 'created' && item.id.startsWith('created-lk-'));

/** Text cut to fit `width` px at this font size, with an ellipsis */
function fitText(text: string, width: number, size: keyof typeof CHAR_PX): string {
  const max = Math.floor(width / CHAR_PX[size]);
  if (max <= 1) return '';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** A label, or the grey block standing for it in anonymous mode */
function labelSvg(text: string, x: number, y: number, size: keyof typeof CHAR_PX, fill: string, anonymous: boolean, weight = 400): string {
  if (!text) return '';
  if (anonymous) {
    const w = Math.min(48, text.length * CHAR_PX[size]);
    return `<rect x="${x}" y="${y - 5}" width="${w}" height="10" rx="2" fill="${C.text}"/>`;
  }
  return `<text x="${x}" y="${y}" dominant-baseline="middle" font-size="${size}"${weight !== 400 ? ` font-weight="${weight}"` : ''} ${FONT} fill="${fill}">${escapeXml(text)}</text>`;
}

/** Thumbnail of an item (its element's shape and initial), centred on cx, cy */
function thumbSvg(shape: TimelineItem['thumbShape'], color: string, letter: string, cx: number, cy: number, size: number, anonymous: boolean): string {
  const fill = resolveExportColor(color, '#9a948d');
  const r = size / 2;
  let shapeSvg: string;
  if (shape === 'circle') {
    shapeSvg = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`;
  } else if (shape === 'diamond') {
    shapeSvg = `<polygon points="${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}" fill="${fill}"/>`;
  } else if (shape === 'hexagon') {
    const pts = Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 3) * i;
      return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
    }).join(' ');
    shapeSvg = `<polygon points="${pts}" fill="${fill}"/>`;
  } else {
    shapeSvg = `<rect x="${cx - r}" y="${cy - r}" width="${size}" height="${size}" rx="3" fill="${fill}"/>`;
  }
  const text = anonymous ? '?' : letter.slice(0, 2);
  return `${shapeSvg}<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-size="${Math.round(size * 0.45)}" font-weight="600" ${FONT} fill="#ffffff">${escapeXml(text)}</text>`;
}

/** Ticks and labels of the axis, and the grid lines under the content */
function axisSvg(labels: AxisLabel[], left: number, right: number, bottom: number): { axis: string; grid: string } {
  const axis: string[] = [];
  const grid: string[] = [];
  for (const { x, label, isMain } of labels) {
    if (x < left || x > right) continue;
    axis.push(`<line x1="${x}" y1="${AXIS_HEIGHT - 8}" x2="${x}" y2="${AXIS_HEIGHT}" stroke="${isMain ? C.borderStrong : C.border}" stroke-width="1"/>`);
    axis.push(`<text x="${x + 2}" y="${AXIS_HEIGHT - 10}" font-size="10"${isMain ? ' font-weight="500"' : ''} ${FONT} fill="${isMain ? C.text : C.textTertiary}">${escapeXml(label)}</text>`);
    grid.push(`<line x1="${x}" y1="${AXIS_HEIGHT}" x2="${x}" y2="${bottom}" stroke="#9ca3af" stroke-opacity="${isMain ? 0.4 : 0.15}" stroke-width="0.5"/>`);
  }
  return { axis: axis.join(''), grid: grid.join('') };
}

/** Scatter mode: one row per item, a point or a period bar, its label inside or after it */
function scatterSvg(input: TimelineSvgInput, dateToX: (d: Date) => number, viewEnd: number): { body: string; height: number; right: number } {
  const { width, anonymous } = input;
  const shown = input.items.filter((item) => {
    const end = (item.end ?? item.start).getTime();
    return end >= input.viewStart.getTime() && item.start.getTime() <= viewEnd;
  });
  const parts: string[] = [];
  let right = width;
  shown.forEach((item, row) => {
    const y = AXIS_HEIGHT + ROW_GAP + row * (ROW_HEIGHT + ROW_GAP);
    const cy = y + ROW_HEIGHT / 2;
    const opacity = item.isDimmed ? ' opacity="0.3"' : '';
    const g: string[] = [];
    const startX = dateToX(item.start);
    if (!item.end) {
      // A point: the thumbnail, its label after it
      g.push(thumbSvg(item.thumbShape, item.thumbColor, item.thumbLetter, startX + ROW_HEIGHT / 2, cy, ROW_HEIGHT - 4, anonymous));
      const lx = startX + ROW_HEIGHT + OUTSIDE_LABEL_GAP;
      g.push(labelSvg(item.label, lx, cy, 12, C.text, anonymous, 500));
      right = Math.max(right, lx + Math.min(item.label.length, 80) * CHAR_PX[12]);
    } else {
      // A period: the bar, cut at the edges of the span drawn
      const x0 = Math.max(0, startX);
      const x1 = Math.min(width, Math.max(startX + 20, dateToX(item.end)));
      const w = Math.max(2, x1 - x0);
      const color = resolveExportColor(item.color, '#6b7280');
      g.push(`<rect x="${x0}" y="${y}" width="${w}" height="${ROW_HEIGHT}" rx="3" fill="${color}" fill-opacity="0.25" stroke="${color}" stroke-width="1.5"/>`);
      const link = isLinkItem(item);
      const content = 8 + 24 + 8 + Math.min(item.label.length, 80) * CHAR_PX[12] + 8 + (link ? 32 : 0);
      if (w < content) {
        // Too short: thumbnail and label after the bar (the row is free on the right)
        const tx = x0 + w + OUTSIDE_LABEL_GAP;
        g.push(thumbSvg(item.thumbShape, item.thumbColor, item.thumbLetter, tx + 12, cy, 24, anonymous));
        g.push(labelSvg(item.label, tx + 30, cy, 12, C.text, anonymous, 500));
        right = Math.max(right, tx + 30 + Math.min(item.label.length, 80) * CHAR_PX[12]);
      } else {
        g.push(thumbSvg(item.thumbShape, item.thumbColor, item.thumbLetter, x0 + 20, cy, 24, anonymous));
        const destSpace = link && item.destThumbLetter ? 32 : 0;
        g.push(labelSvg(fitText(item.label, w - 48 - destSpace, 12), x0 + 40, cy, 12, C.text, anonymous, 500));
        if (destSpace) {
          g.push(thumbSvg(item.destThumbShape || 'circle', item.destThumbColor || '#6b7280', item.destThumbLetter!, x0 + w - 20, cy, 24, anonymous));
        }
      }
    }
    parts.push(`<g${opacity}>${g.join('')}</g>`);
  });
  const height = AXIS_HEIGHT + ROW_GAP + Math.max(1, shown.length) * (ROW_HEIGHT + ROW_GAP);
  return { body: parts.join('\n'), height, right };
}

/** Swimlane mode: the lanes, their label column on the left, items packed in rows */
function swimlaneSvg(input: TimelineSvgInput, dateToX: (d: Date) => number): { body: string; height: number } {
  const { width, anonymous } = input;
  const layout = computeSwimlaneLayout(input.lanes, dateToX, input.collapsedLanes, width);
  const parts: string[] = [];
  layout.lanes.forEach((lane, index) => {
    const top = AXIS_HEIGHT + lane.yOffset;
    const bg = index % 2 === 0 ? C.bg : C.bgAlt;
    parts.push(`<rect x="0" y="${top}" width="${width}" height="${lane.height}" fill="${bg}"/>`);
    parts.push(`<line x1="0" y1="${top + lane.height}" x2="${width}" y2="${top + lane.height}" stroke="${C.border}" stroke-width="1"/>`);
    const items: string[] = [];
    for (const { item, rowY, x, width: w, itemHeight } of lane.items) {
      if (x + w < SWIMLANE_LABEL_WIDTH || x > width) continue;
      const y = top + SWIMLANE_LANE_PADDING + rowY;
      const color = resolveExportColor(item.color, '#6b7280');
      const opacity = item.isDimmed ? ' opacity="0.3"' : '';
      // The label stays in sight when the item starts under the label column
      const textX = Math.max(x, SWIMLANE_LABEL_WIDTH) + 6;
      const textWidth = x + w - textX - 6;
      if (item.type === 'link') {
        if (itemHeight <= SWIMLANE_LINK_HEIGHT_COMPACT) {
          items.push(`<rect x="${x}" y="${y}" width="${w}" height="${itemHeight}" rx="2" fill="${color}" fill-opacity="0.25"${opacity}/>`);
        } else {
          items.push(`<g${opacity}><rect x="${x}" y="${y}" width="${w}" height="${itemHeight}" rx="3" fill="${color}" fill-opacity="0.1" stroke="${color}" stroke-width="0.5" stroke-dasharray="2 2"/>${labelSvg(fitText(item.label, textWidth, 10), textX, y + itemHeight / 2, 10, C.textSecondary, anonymous)}</g>`);
        }
        continue;
      }
      items.push(`<g${opacity}><rect x="${x}" y="${y}" width="${w}" height="${itemHeight}" rx="3" fill="${color}" fill-opacity="0.25" stroke="${color}" stroke-width="1"/>${labelSvg(fitText(item.label, textWidth, 11), textX, y + itemHeight / 2, 11, C.text, anonymous)}</g>`);
    }
    parts.push(`<g clip-path="url(#tl-lanes)">${items.join('')}</g>`);
    // Label column, over the start of the span
    parts.push(`<rect x="0" y="${top}" width="${SWIMLANE_LABEL_WIDTH}" height="${lane.height}" fill="${bg}"/>`);
    parts.push(`<line x1="${SWIMLANE_LABEL_WIDTH}" y1="${top}" x2="${SWIMLANE_LABEL_WIDTH}" y2="${top + lane.height}" stroke="${C.border}" stroke-width="1"/>`);
    const count = lane.collapsed ? ` (${lane.itemCount})` : '';
    parts.push(`<text x="8" y="${top + lane.height / 2}" dominant-baseline="middle" font-size="11" font-weight="500" ${FONT} fill="${lane.collapsed ? C.textSecondary : C.text}">${escapeXml(fitText(lane.label, SWIMLANE_LABEL_WIDTH - 16 - count.length * CHAR_PX[11], 11) + count)}</text>`);
  });
  return { body: parts.join('\n'), height: AXIS_HEIGHT + Math.max(layout.totalHeight, 44) };
}

/** The timeline between `viewStart` and `viewStart + width / zoom`, as a standalone SVG */
export function buildTimelineSVG(input: TimelineSvgInput): string {
  const { viewStart, zoom, width, language } = input;
  const dateToX = (d: Date) => ((d.getTime() - viewStart.getTime()) / DAY_MS) * zoom;
  const viewEnd = viewStart.getTime() + (width / zoom) * DAY_MS;
  const labels = computeAxisLabels(viewStart, zoom, width, language);

  let body: string;
  let height: number;
  let right = width;
  let gridLeft = 0;
  if (input.mode === 'swimlane') {
    ({ body, height } = swimlaneSvg(input, dateToX));
    gridLeft = SWIMLANE_LABEL_WIDTH;
  } else {
    ({ body, height, right } = scatterSvg(input, dateToX, viewEnd));
  }
  const totalWidth = Math.ceil(right + RIGHT_MARGIN);
  const { axis, grid } = axisSvg(labels, gridLeft, width, height);

  // "Now" marker, when it falls in the span drawn
  const todayX = dateToX(new Date());
  const today = todayX >= gridLeft && todayX <= width
    ? `<line x1="${todayX}" y1="${AXIS_HEIGHT}" x2="${todayX}" y2="${height}" stroke="${C.today}" stroke-width="1.5" stroke-opacity="0.7"/>`
    : '';

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${height}" viewBox="0 0 ${totalWidth} ${height}">`,
    `<defs><clipPath id="tl-lanes"><rect x="${SWIMLANE_LABEL_WIDTH}" y="0" width="${Math.max(0, width - SWIMLANE_LABEL_WIDTH)}" height="${height}"/></clipPath></defs>`,
    `<rect x="0" y="0" width="${totalWidth}" height="${height}" fill="${C.bgAlt}"/>`,
    `<rect x="0" y="0" width="${totalWidth}" height="${AXIS_HEIGHT}" fill="${C.bg}"/>`,
    `<line x1="0" y1="${AXIS_HEIGHT}" x2="${totalWidth}" y2="${AXIS_HEIGHT}" stroke="${C.border}" stroke-width="1"/>`,
    input.mode === 'swimlane' ? body + grid : grid + body,
    today,
    axis,
    '</svg>',
  ].join('\n');
}
