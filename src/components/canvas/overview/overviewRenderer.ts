/**
 * Draws the overview scene on a 2D canvas: every visible node and link, in a
 * handful of fill/stroke calls batched by colour and style. Behind a small
 * interface so a WebGL backend can replace it if a measurement asks for one.
 */

import { EDGE_ARROW_LENGTH, EDGE_ARROW_WIDTH } from '../../../utils/edgeRouting';
import { queryCells, DIAMOND_HALF_DIAGONAL } from './overviewHitTest';
import {
  LINK_ARROW_END, LINK_ARROW_START, LINK_DIMMED, LINK_HIGHLIGHTED, LINK_SELECTED,
  NODE_DIMMED, NODE_EMPHASIZED, NODE_GHOST, NODE_REMOTE, NODE_SELECTED,
  SHAPE_ANNOTATION, SHAPE_CIRCLE, SHAPE_DIAMOND, SHAPE_GROUP, SHAPE_HEXAGON, SHAPE_RECT,
  STYLE_DASHED, STYLE_DOTTED,
  type OverviewScene,
} from './overviewTypes';

export interface OverviewTransform {
  x: number;
  y: number;
  zoom: number;
}

export interface OverviewTheme {
  /** Selection colour (--color-accent). */
  accent: string;
  /** Theme mode: CSS variables in the scene colours are read again when it changes. */
  mode?: string;
}

export interface OverviewOverlay {
  /** Nodes inside the selection rectangle being drawn. */
  pendingIndices?: readonly number[];
}

export interface DrawStats {
  nodesDrawn: number;
  linksDrawn: number;
  ms: number;
}

export interface OverviewRenderer {
  resize(cssWidth: number, cssHeight: number, dpr: number): void;
  setScene(scene: OverviewScene | null, theme: OverviewTheme): void;
  draw(t: OverviewTransform, overlay?: OverviewOverlay): DrawStats;
  destroy(): void;
}

/** Opacity of dimmed nodes and links, as the low-detail nodes and SimpleEdge. */
const DIMMED_ALPHA = 0.15;
const DIMMED_GROUP_ALPHA = 0.3;
/** Group frames are a tint of their colour (hex alpha "12" in GroupNode). */
const GROUP_TINT_ALPHA = 0x12 / 255;
/** Below this on-screen size every node is a plain square: shapes are not discernible. */
const TINY_PX = 3;
/** Arrows are only drawn from this on-screen length. */
const MIN_ARROW_PX = 4;
/** Thinnest drawn line, in screen pixels. */
const MIN_LINE_PX = 0.5;
/** Result glow around links: extra width in screen pixels, and its opacity. */
const LINK_GLOW_PX = 6;
const LINK_GLOW_ALPHA = 0.35;
/** Link colour when none can be resolved, as SimpleEdge. */
const FALLBACK_LINK_COLOR = '#9a948d';
const CSS_VAR = /^var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)$/;

function addShape(ctx: CanvasRenderingContext2D, shape: number, x: number, y: number, w: number, h: number) {
  switch (shape) {
    case SHAPE_CIRCLE: {
      const rx = w / 2, ry = h / 2;
      ctx.moveTo(x + w, y + ry);
      ctx.ellipse(x + rx, y + ry, rx, ry, 0, 0, Math.PI * 2);
      return;
    }
    case SHAPE_DIAMOND: {
      // A square body rotated 45°: tips beyond the box
      const cx = x + w / 2, cy = y + h / 2, r = w * DIAMOND_HALF_DIAGONAL;
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r, cy);
      ctx.lineTo(cx, cy + r);
      ctx.lineTo(cx - r, cy);
      ctx.closePath();
      return;
    }
    case SHAPE_HEXAGON:
      // Same clip-path as .sketchy-hexagon
      ctx.moveTo(x + w * 0.25, y);
      ctx.lineTo(x + w * 0.75, y);
      ctx.lineTo(x + w, y + h / 2);
      ctx.lineTo(x + w * 0.75, y + h);
      ctx.lineTo(x + w * 0.25, y + h);
      ctx.lineTo(x, y + h / 2);
      ctx.closePath();
      return;
    default:
      ctx.rect(x, y, w, h);
  }
}

/** Outline of node `i` grown by `pad` (selection and presence rings). */
function addRing(ctx: CanvasRenderingContext2D, scene: OverviewScene, i: number, pad: number) {
  const x = scene.x[i], y = scene.y[i], w = scene.w[i], h = scene.h[i];
  const s = scene.shape[i];
  if (s === SHAPE_CIRCLE || s === SHAPE_DIAMOND) {
    addShape(ctx, s, x - pad, y - pad, w + 2 * pad, h + 2 * pad);
  } else {
    ctx.rect(x - pad, y - pad, w + 2 * pad, h + 2 * pad);
  }
}

function setDash(ctx: CanvasRenderingContext2D, style: number, width: number, zoom: number) {
  // Dashes keep a visible length on screen, else they blur into a solid line
  const unit = Math.max(width, 1 / zoom);
  if (style === STYLE_DASHED) ctx.setLineDash([unit * 4, unit * 2]);
  else if (style === STYLE_DOTTED) ctx.setLineDash([unit, unit * 2]);
  else ctx.setLineDash([]);
}

function pushTo(map: Map<number, number[]>, key: number, value: number) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

export class Canvas2DOverviewRenderer implements OverviewRenderer {
  private ctx: CanvasRenderingContext2D;
  private scene: OverviewScene | null = null;
  private theme: OverviewTheme = { accent: '#2563eb' };
  private cssWidth = 0;
  private cssHeight = 0;
  private dpr = 1;
  private visible: number[] = [];
  /** Scene palette with CSS variables resolved. */
  private colors: string[] = [];
  private varCache = new Map<string, string>();
  private varMode: string | undefined;
  private canvas: HTMLCanvasElement;
  /** Links only: the links layer under React Flow's nodes. */
  private linksOnly: boolean;

  constructor(canvas: HTMLCanvasElement, options: { linksOnly?: boolean } = {}) {
    this.canvas = canvas;
    this.linksOnly = options.linksOnly ?? false;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    this.ctx = ctx;
  }

  resize(cssWidth: number, cssHeight: number, dpr: number) {
    this.cssWidth = cssWidth;
    this.cssHeight = cssHeight;
    this.dpr = dpr;
    const w = Math.max(1, Math.round(cssWidth * dpr));
    const h = Math.max(1, Math.round(cssHeight * dpr));
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
  }

  setScene(scene: OverviewScene | null, theme: OverviewTheme) {
    if (theme.mode !== this.varMode) {
      this.varCache.clear();
      this.varMode = theme.mode;
    }
    this.scene = scene;
    this.theme = theme;
    this.colors = scene ? scene.palette.map((c) => this.resolveColor(c)) : [];
  }

  /** Canvas strokes cannot take `var(--x)` (the default link colour): read its value. */
  private resolveColor(color: string): string {
    const m = CSS_VAR.exec(color.trim());
    if (!m) return color;
    let value = this.varCache.get(m[1]);
    if (value === undefined) {
      value = getComputedStyle(this.canvas).getPropertyValue(m[1]).trim() || m[2]?.trim() || '';
      this.varCache.set(m[1], value);
    }
    return value;
  }

  draw(t: OverviewTransform, overlay?: OverviewOverlay): DrawStats {
    const start = performance.now();
    const { ctx, scene } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!scene || t.zoom <= 0) return { nodesDrawn: 0, linksDrawn: 0, ms: 0 };

    const zoom = t.zoom;
    const k = zoom * this.dpr;
    ctx.setTransform(k, 0, 0, k, t.x * this.dpr, t.y * this.dpr);
    const px = 1 / zoom; // one screen pixel in flow units

    // Viewport in flow units
    const vx0 = -t.x / zoom, vy0 = -t.y / zoom;
    const vx1 = (this.cssWidth - t.x) / zoom, vy1 = (this.cssHeight - t.y) / zoom;

    const { x, y, w, h, shape, flags } = scene;
    const palette = this.colors;
    const inView = (i: number) => x[i] <= vx1 && x[i] + w[i] >= vx0 && y[i] <= vy1 && y[i] + h[i] >= vy0;

    // ── 1. Groups and annotations, under everything ─────────────────────────
    let nodesDrawn = 0;
    for (const i of this.linksOnly ? [] : scene.grid.large) {
      if (!inView(i)) continue;
      nodesDrawn++;
      const dimmed = (flags[i] & NODE_DIMMED) !== 0;
      ctx.beginPath();
      addShape(ctx, shape[i] === SHAPE_GROUP || shape[i] === SHAPE_ANNOTATION ? SHAPE_RECT : shape[i], x[i], y[i], w[i], h[i]);
      const fill = palette[scene.fill[i]];
      if (fill) {
        ctx.globalAlpha = (shape[i] === SHAPE_GROUP ? GROUP_TINT_ALPHA : 1) * (dimmed ? DIMMED_GROUP_ALPHA : 1);
        ctx.fillStyle = fill;
        ctx.fill();
      }
      if (scene.borderWidth[i] * zoom >= MIN_LINE_PX) {
        ctx.globalAlpha = dimmed ? DIMMED_GROUP_ALPHA : 1;
        ctx.strokeStyle = palette[scene.stroke[i]];
        ctx.lineWidth = scene.borderWidth[i];
        setDash(ctx, scene.borderStyle[i], scene.borderWidth[i], zoom);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);

    // ── 2. Links, straight between centres ──────────────────────────────────
    const { from, to, linkColor, linkStyle, linkWidth, linkFlags } = scene;
    const linkBuckets = new Map<number, number[]>();
    const selectedLinks: number[] = [];
    const glowLinks: number[] = [];
    let linksDrawn = 0;
    for (let l = 0; l < scene.linkCount; l++) {
      const a = from[l], b = to[l];
      const ax = x[a] + w[a] / 2, ay = y[a] + h[a] / 2;
      const bx = x[b] + w[b] / 2, by = y[b] + h[b] / 2;
      if (Math.max(ax, bx) < vx0 || Math.min(ax, bx) > vx1 || Math.max(ay, by) < vy0 || Math.min(ay, by) > vy1) continue;
      linksDrawn++;
      if (linkFlags[l] & LINK_HIGHLIGHTED) glowLinks.push(l);
      if (linkFlags[l] & LINK_SELECTED) { selectedLinks.push(l); continue; }
      const widthBucket = Math.min(8, Math.max(1, Math.round(linkWidth[l])));
      const key = ((linkColor[l] * 9 + widthBucket) * 3 + linkStyle[l]) * 2 + (linkFlags[l] & LINK_DIMMED ? 1 : 0);
      pushTo(linkBuckets, key, l);
    }
    const arrows = EDGE_ARROW_LENGTH * zoom >= MIN_ARROW_PX;
    const strokeLinks = (list: number[], color: string, width: number, style: number, alpha: number) => {
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color || FALLBACK_LINK_COLOR;
      ctx.lineWidth = Math.max(width, MIN_LINE_PX * px);
      setDash(ctx, style, width, zoom);
      ctx.beginPath();
      for (const l of list) {
        const a = from[l], b = to[l];
        ctx.moveTo(x[a] + w[a] / 2, y[a] + h[a] / 2);
        ctx.lineTo(x[b] + w[b] / 2, y[b] + h[b] / 2);
      }
      ctx.stroke();
      if (!arrows) return;
      ctx.setLineDash([]);
      ctx.fillStyle = color || FALLBACK_LINK_COLOR;
      ctx.beginPath();
      for (const l of list) {
        if (linkFlags[l] & LINK_ARROW_END) addArrow(ctx, scene, from[l], to[l]);
        if (linkFlags[l] & LINK_ARROW_START) addArrow(ctx, scene, to[l], from[l]);
      }
      ctx.fill();
    };
    // Result glow under the lines: a wide, faint accent stroke (SimpleEdge's drop-shadow)
    if (glowLinks.length > 0) {
      ctx.globalAlpha = LINK_GLOW_ALPHA;
      ctx.strokeStyle = this.theme.accent;
      ctx.lineCap = 'round';
      ctx.beginPath();
      let widest = 0;
      for (const l of glowLinks) {
        const a = from[l], b = to[l];
        ctx.moveTo(x[a] + w[a] / 2, y[a] + h[a] / 2);
        ctx.lineTo(x[b] + w[b] / 2, y[b] + h[b] / 2);
        widest = Math.max(widest, linkWidth[l]);
      }
      ctx.lineWidth = Math.max(widest, MIN_LINE_PX * px) + LINK_GLOW_PX * px;
      ctx.stroke();
      ctx.lineCap = 'butt';
    }
    for (const [key, list] of linkBuckets) {
      const dimmed = key % 2;
      const style = Math.floor(key / 2) % 3;
      const widthBucket = Math.floor(key / 6) % 9;
      const color = palette[Math.floor(key / 54)];
      strokeLinks(list, color, widthBucket, style, dimmed ? DIMMED_ALPHA : 1);
    }
    if (selectedLinks.length > 0) {
      strokeLinks(selectedLinks, this.theme.accent, Math.max(2, 2 * px), 0, 1);
    }
    ctx.setLineDash([]);
    if (this.linksOnly) {
      ctx.globalAlpha = 1;
      return { nodesDrawn: 0, linksDrawn, ms: performance.now() - start };
    }

    // ── 3. Element nodes ────────────────────────────────────────────────────
    const visible = queryCells(scene.grid, vx0, vy0, vx1, vy1, this.visible);
    const glow = new Map<number, number[]>();
    const fills = new Map<number, number[]>();
    const borders = new Map<number, number[]>();
    const rings: number[] = [];
    const remotes: number[] = [];
    for (const i of visible) {
      if (!inView(i)) continue;
      nodesDrawn++;
      const f = flags[i];
      const dimmed = f & NODE_DIMMED ? 1 : 0;
      const tiny = Math.max(w[i], h[i]) * zoom < TINY_PX;
      const drawShape = tiny ? SHAPE_RECT : shape[i];
      if (f & NODE_EMPHASIZED && !dimmed) pushTo(glow, scene.fill[i], i);
      pushTo(fills, (scene.fill[i] * 8 + drawShape) * 2 + dimmed, i);
      if (!tiny && scene.borderWidth[i] * zoom >= MIN_LINE_PX) {
        pushTo(borders, (scene.stroke[i] * 3 + scene.borderStyle[i]) * 2 + dimmed, i);
      }
      if (f & NODE_SELECTED) rings.push(i);
      if (f & NODE_REMOTE && !(f & NODE_GHOST)) remotes.push(i);
    }

    // Result glow: a soft disc of constant on-screen reach (.result-glow)
    for (const [colorIdx, list] of glow) {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = palette[colorIdx] || this.theme.accent;
      ctx.beginPath();
      for (const i of list) {
        const r = Math.max(w[i], h[i]) / 2 + 11 * px;
        const cx = x[i] + w[i] / 2, cy = y[i] + h[i] / 2;
        ctx.moveTo(cx + r, cy);
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
      }
      ctx.fill();
    }

    for (const [key, list] of fills) {
      const dimmed = key % 2;
      const drawShape = Math.floor(key / 2) % 8;
      const color = palette[Math.floor(key / 16)];
      if (!color) continue;
      ctx.globalAlpha = dimmed ? DIMMED_ALPHA : 1;
      ctx.fillStyle = color;
      ctx.beginPath();
      for (const i of list) addShape(ctx, drawShape, x[i], y[i], w[i], h[i]);
      ctx.fill();
    }

    for (const [key, list] of borders) {
      const dimmed = key % 2;
      const style = Math.floor(key / 2) % 3;
      const color = palette[Math.floor(key / 6)];
      if (!color) continue;
      ctx.globalAlpha = dimmed ? DIMMED_ALPHA : 1;
      ctx.strokeStyle = color;
      // One width per bucket: the first node's (borders are 1 to 3 units wide)
      const width = scene.borderWidth[list[0]];
      ctx.lineWidth = width;
      setDash(ctx, style, width, zoom);
      ctx.beginPath();
      // Inset by half the width: CSS borders sit inside the box
      for (const i of list) {
        const inset = width / 2;
        addShape(ctx, shape[i], x[i] + inset, y[i] + inset, w[i] - width, h[i] - width);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // ── 4. Selection, pending box selection, remote presence ────────────────
    const ring = (list: readonly number[], color: string, padPx: number, widthPx: number, alpha: number) => {
      if (list.length === 0) return;
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = widthPx * px;
      ctx.beginPath();
      for (const i of list) addRing(ctx, scene, i, padPx * px);
      ctx.stroke();
    };
    ring(rings, this.theme.accent, 2, 2, 1);
    if (overlay?.pendingIndices) ring(overlay.pendingIndices, this.theme.accent, 2, 1.5, 0.6);
    // One stroke per presence colour
    const byRemote = new Map<number, number[]>();
    for (const i of remotes) pushTo(byRemote, scene.remoteColor[i], i);
    for (const [colorIdx, list] of byRemote) ring(list, palette[colorIdx], 5, 2, 1);
    ctx.globalAlpha = 1;

    return { nodesDrawn, linksDrawn, ms: performance.now() - start };
  }

  destroy() {
    this.scene = null;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}

/** Arrow head at the border of node `b`, pointing from `a`. */
function addArrow(ctx: CanvasRenderingContext2D, scene: OverviewScene, a: number, b: number) {
  const { x, y, w, h } = scene;
  const ax = x[a] + w[a] / 2, ay = y[a] + h[a] / 2;
  const bx = x[b] + w[b] / 2, by = y[b] + h[b] / 2;
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len === 0) return;
  const ux = dx / len, uy = dy / len;
  // Distance from the centre to the box edge along the link
  const reach = Math.min(
    ux !== 0 ? w[b] / 2 / Math.abs(ux) : Infinity,
    uy !== 0 ? h[b] / 2 / Math.abs(uy) : Infinity,
  );
  const tipX = bx - ux * reach, tipY = by - uy * reach;
  const baseX = tipX - ux * EDGE_ARROW_LENGTH, baseY = tipY - uy * EDGE_ARROW_LENGTH;
  const half = EDGE_ARROW_WIDTH / 2;
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(baseX - uy * half, baseY + ux * half);
  ctx.lineTo(baseX + uy * half, baseY - ux * half);
  ctx.closePath();
}
