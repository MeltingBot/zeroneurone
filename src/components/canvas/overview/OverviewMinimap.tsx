/**
 * Minimap of the overview layer. React Flow's MiniMap skips hidden nodes, and
 * the overview hides them all, so this one draws the overview scene on a
 * small canvas instead: every node as a dot of its colour, the viewport as the
 * clear window in a light mask. Click or drag moves the view there, the wheel
 * zooms, like React Flow's pannable/zoomable minimap.
 */

import { useEffect, useLayoutEffect, useRef } from 'react';
import { useReactFlow, useStoreApi } from '@xyflow/react';
import type { OverviewScene } from './overviewTypes';

interface OverviewMinimapProps {
  scene: OverviewScene;
  width: number;
  height: number;
  bgColor: string;
  maskColor: string;
  /** Colour of a node (very light colours are replaced to stay visible). */
  nodeColor: (color: string) => string;
}

interface Bounds { minX: number; minY: number; maxX: number; maxY: number }

/** Minimap scale and offset fitting `b` in the box, centred. */
function fit(b: Bounds, width: number, height: number) {
  const bw = Math.max(1, b.maxX - b.minX);
  const bh = Math.max(1, b.maxY - b.minY);
  const scale = Math.min(width / bw, height / bh);
  return {
    scale,
    offX: (width - bw * scale) / 2 - b.minX * scale,
    offY: (height - bh * scale) / 2 - b.minY * scale,
  };
}

const WHEEL_ZOOM_STEP = 1.2;

export function OverviewMinimap({ scene, width, height, bgColor, maskColor, nodeColor }: OverviewMinimapProps) {
  const store = useStoreApi();
  const { setViewport } = useReactFlow();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  /** Bounds frozen while dragging: the moving viewport would otherwise rescale the map under the cursor. */
  const frozenRef = useRef<Bounds | null>(null);

  // Extent of the graph, recomputed with the scene only
  const graphBoundsRef = useRef<Bounds>({ minX: 0, minY: 0, maxX: 1, maxY: 1 });
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const propsRef = useRef({ width, height, bgColor, maskColor, nodeColor });
  propsRef.current = { width, height, bgColor, maskColor, nodeColor };

  const currentBounds = (): Bounds => {
    if (frozenRef.current) return frozenRef.current;
    const g = graphBoundsRef.current;
    const { transform, width: vw, height: vh } = store.getState();
    const [tx, ty, zoom] = transform;
    // Like React Flow's minimap: the graph and the viewport together
    return {
      minX: Math.min(g.minX, -tx / zoom),
      minY: Math.min(g.minY, -ty / zoom),
      maxX: Math.max(g.maxX, (vw - tx) / zoom),
      maxY: Math.max(g.maxY, (vh - ty) / zoom),
    };
  };

  const draw = () => {
    const canvas = canvasRef.current;
    const sc = sceneRef.current;
    if (!canvas || !sc) return;
    const { width: w, height: h, bgColor: bg, maskColor: mask, nodeColor: color } = propsRef.current;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(w * dpr)) canvas.width = Math.round(w * dpr);
    if (canvas.height !== Math.round(h * dpr)) canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const { scale, offX, offY } = fit(currentBounds(), w, h);
    // Nodes, one fill per colour; at least one pixel so none vanishes
    const byColor = new Map<number, number[]>();
    for (let i = 0; i < sc.nodeCount; i++) {
      const list = byColor.get(sc.fill[i]);
      if (list) list.push(i);
      else byColor.set(sc.fill[i], [i]);
    }
    for (const [colorIdx, list] of byColor) {
      ctx.fillStyle = color(sc.palette[colorIdx]);
      ctx.beginPath();
      for (const i of list) {
        ctx.rect(
          offX + sc.x[i] * scale, offY + sc.y[i] * scale,
          Math.max(1, sc.w[i] * scale), Math.max(1, sc.h[i] * scale),
        );
      }
      ctx.fill();
    }

    // Mask everything but the viewport
    const { transform, width: vw, height: vh } = store.getState();
    const [tx, ty, zoom] = transform;
    ctx.fillStyle = mask;
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.rect(offX + (-tx / zoom) * scale, offY + (-ty / zoom) * scale, (vw / zoom) * scale, (vh / zoom) * scale);
    ctx.fill('evenodd');
  };
  const drawRef = useRef(draw);
  drawRef.current = draw;

  useLayoutEffect(() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < scene.nodeCount; i++) {
      minX = Math.min(minX, scene.x[i]);
      minY = Math.min(minY, scene.y[i]);
      maxX = Math.max(maxX, scene.x[i] + scene.w[i]);
      maxY = Math.max(maxY, scene.y[i] + scene.h[i]);
    }
    graphBoundsRef.current = minX === Infinity ? { minX: 0, minY: 0, maxX: 1, maxY: 1 } : { minX, minY, maxX, maxY };
    drawRef.current();
  }, [scene, width, height, bgColor, maskColor, nodeColor]);

  // Follow the viewport outside React
  useEffect(() => {
    const unsubscribe = store.subscribe((s, prev) => {
      if (s.transform === prev.transform && s.width === prev.width && s.height === prev.height) return;
      if (frameRef.current) return;
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = 0;
        drawRef.current();
      });
    });
    return () => {
      unsubscribe();
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    };
  }, [store]);

  /** Centre the view on the flow point under a minimap client point. */
  const moveTo = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    const { scale, offX, offY } = fit(currentBounds(), propsRef.current.width, propsRef.current.height);
    const fx = (clientX - r.left - offX) / scale;
    const fy = (clientY - r.top - offY) / scale;
    const { transform, width: vw, height: vh } = store.getState();
    const zoom = transform[2];
    setViewport({ x: vw / 2 - fx * zoom, y: vh / 2 - fy * zoom, zoom });
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    frozenRef.current = currentBounds();
    moveTo(e.clientX, e.clientY);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!frozenRef.current) return;
    moveTo(e.clientX, e.clientY);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!frozenRef.current) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    frozenRef.current = null;
    drawRef.current();
  };

  // Wheel: zoom around the view centre. Native listener: React's is passive.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const { transform, width: vw, height: vh, minZoom, maxZoom } = store.getState();
      const [tx, ty, zoom] = transform;
      const next = Math.min(maxZoom, Math.max(minZoom, e.deltaY < 0 ? zoom * WHEEL_ZOOM_STEP : zoom / WHEEL_ZOOM_STEP));
      const cx = (vw / 2 - tx) / zoom;
      const cy = (vh / 2 - ty) / zoom;
      setViewport({ x: vw / 2 - cx * next, y: vh / 2 - cy * next, zoom: next });
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [store, setViewport]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="overview-minimap"
      className="block cursor-pointer nopan nowheel"
      style={{ width, height }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    />
  );
}
