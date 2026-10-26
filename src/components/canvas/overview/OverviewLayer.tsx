/**
 * Canvas overview layer: zoomed far out on a large dossier, React Flow keeps
 * its nodes hidden and this single <canvas> draws every node and every link.
 * React Flow still owns the input (pan, zoom, click, Shift+box): the canvas
 * lets every event through and the Canvas component hit-tests the scene.
 *
 * Redraws follow React Flow's store directly (transform, size), outside
 * React: panning re-renders no component.
 */

import { memo, useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from 'react';
import { useStoreApi, type ReactFlowState } from '@xyflow/react';
import { Canvas2DOverviewRenderer, type OverviewRenderer } from './overviewRenderer';
import { hitPoint, hitRect } from './overviewHitTest';
import type { OverviewScene } from './overviewTypes';

/** Reach of a click around a node, in screen pixels. */
const HIT_TOLERANCE_PX = 4;

export interface OverviewHandle {
  /** Node id under a client point, or null. `tolerancePx`: reach around nodes (default HIT_TOLERANCE_PX). */
  hitTestClient: (clientX: number, clientY: number, tolerancePx?: number) => string | null;
  /** Redraw at another pixel ratio (sharper PNG export); `restore` goes back. */
  redrawAt: (dpr: number) => void;
  restore: () => void;
  /** Drag preview: draws the given scene nodes moved by (dx, dy) flow units. */
  previewOffset: (indices: readonly number[], dx: number, dy: number) => void;
  /** Drag cancelled: puts the nodes back. */
  cancelOffset: () => void;
  /** Drag committed: keeps the moved drawing until the new scene arrives. */
  endOffset: () => void;
}

interface OverviewLayerProps {
  active: boolean;
  scene: OverviewScene | null;
  /** Theme mode, to re-read the accent colour when it changes. */
  themeMode: string;
  handleRef: MutableRefObject<OverviewHandle | null>;
  /** End of a Shift+box selection: indices of the nodes it touched. */
  onBoxSelect: (scene: OverviewScene, nodeIndices: number[]) => void;
}

type SelectionRect = NonNullable<ReactFlowState['userSelectionRect']>;

function OverviewLayerComponent({ active, scene, themeMode, handleRef, onBoxSelect }: OverviewLayerProps) {
  const store = useStoreApi();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<OverviewRenderer | null>(null);
  const frameRef = useRef(0);
  const dprRef = useRef(1);
  const sceneRef = useRef(scene);
  const activeRef = useRef(active);
  const onBoxSelectRef = useRef(onBoxSelect);
  sceneRef.current = scene;
  activeRef.current = active;

  // Leaving the overview, the canvas stays up until React Flow has its nodes:
  // they reach its store an effect later than this render, and hiding the
  // canvas at once would show an empty frame in between.
  const [lingering, setLingering] = useState(false);
  const [prevActive, setPrevActive] = useState(active);
  if (prevActive !== active) {
    setPrevActive(active);
    setLingering(!active);
  }
  const visible = active || lingering;
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  /** Last scene drawn, kept on screen while lingering (the canvas passes none any more). */
  const lastSceneRef = useRef(scene);
  if (scene) lastSceneRef.current = scene;
  onBoxSelectRef.current = onBoxSelect;
  /** Node coordinates before a drag preview moved them (in place, in the scene arrays). */
  const dragOriginRef = useRef<{ scene: OverviewScene; indices: readonly number[]; x: Float32Array; y: Float32Array } | null>(null);
  /** Selection rectangle being drawn, kept: React Flow clears it before onSelectionEnd. */
  const boxRef = useRef<SelectionRect | null>(null);
  const pendingRef = useRef<number[] | null>(null);

  const drawNow = () => {
    const renderer = rendererRef.current;
    const canvas = canvasRef.current;
    if (!renderer || !canvas) return;
    const { transform, width, height } = store.getState();
    renderer.resize(width, height, dprRef.current);
    const stats = renderer.draw(
      visibleRef.current ? { x: transform[0], y: transform[1], zoom: transform[2] } : { x: 0, y: 0, zoom: 0 },
      pendingRef.current ? { pendingIndices: pendingRef.current } : undefined,
    );
    // Read by the benches and the e2e spec
    canvas.dataset.nodesDrawn = String(stats.nodesDrawn);
    canvas.dataset.linksDrawn = String(stats.linksDrawn);
    canvas.dataset.drawMs = stats.ms.toFixed(1);
    canvas.dataset.sceneNodes = String(sceneRef.current?.nodeCount ?? 0);
    canvas.dataset.sceneLinks = String(sceneRef.current?.linkCount ?? 0);
  };
  const drawNowRef = useRef(drawNow);
  drawNowRef.current = drawNow;

  const schedule = () => {
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      drawNowRef.current();
    });
  };
  const scheduleRef = useRef(schedule);
  scheduleRef.current = schedule;

  // Renderer lifetime
  useEffect(() => {
    if (!canvasRef.current) return;
    dprRef.current = window.devicePixelRatio || 1;
    rendererRef.current = new Canvas2DOverviewRenderer(canvasRef.current);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
      rendererRef.current?.destroy();
      rendererRef.current = null;
    };
  }, []);

  // Accent colour, read once per theme after paint: getComputedStyle forces a
  // style recalculation of the whole page, which costs most of a second while
  // React Flow is unmounting thousands of nodes (entering the overview)
  const accentRef = useRef('#2563eb');
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    accentRef.current = getComputedStyle(canvas).getPropertyValue('--color-accent').trim() || '#2563eb';
    rendererRef.current?.setScene(visibleRef.current ? lastSceneRef.current : null, { accent: accentRef.current });
    scheduleRef.current();
  }, [themeMode]);

  // Scene changed: draw before paint, so entering the overview shows no blank frame
  useLayoutEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.setScene(visible ? lastSceneRef.current : null, { accent: accentRef.current });
    drawNowRef.current();
  }, [visible, scene]);

  // End of lingering: once React Flow's store holds shown nodes, two frames
  // for them to be painted, then the canvas goes. Bounded, whatever happens.
  useEffect(() => {
    if (!lingering) return;
    let frame = 0;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => setLingering(false));
      });
    };
    const hasShownNodes = () => store.getState().nodes.some((n) => !n.hidden);
    if (hasShownNodes()) finish();
    const unsubscribe = store.subscribe((s, prev) => {
      if (s.nodes !== prev.nodes && hasShownNodes()) finish();
    });
    const timeout = setTimeout(() => setLingering(false), 1500);
    return () => {
      unsubscribe();
      clearTimeout(timeout);
      cancelAnimationFrame(frame);
    };
  }, [lingering, store]);

  // Follow React Flow's viewport and selection rectangle without re-rendering
  useEffect(() => store.subscribe((s, prev) => {
    if (s.transform !== prev.transform || s.width !== prev.width || s.height !== prev.height) {
      scheduleRef.current();
    }
    if (!activeRef.current) return;
    if (s.userSelectionActive && s.userSelectionRect && s.userSelectionRect !== prev.userSelectionRect) {
      boxRef.current = s.userSelectionRect;
      const sc = sceneRef.current;
      pendingRef.current = sc ? hitRect(sc, ...toFlowRect(s.userSelectionRect, s.transform)) : null;
      scheduleRef.current();
    }
    if (prev.userSelectionActive && !s.userSelectionActive) {
      const box = boxRef.current;
      const sc = sceneRef.current;
      boxRef.current = null;
      pendingRef.current = null;
      if (box && sc) onBoxSelectRef.current(sc, hitRect(sc, ...toFlowRect(box, s.transform)));
      scheduleRef.current();
    }
  }), [store]);

  // Imperative access for the canvas (click hit-test, export)
  useEffect(() => {
    handleRef.current = {
      hitTestClient: (clientX, clientY, tolerancePx = HIT_TOLERANCE_PX) => {
        const sc = sceneRef.current;
        const canvas = canvasRef.current;
        if (!sc || !canvas || !activeRef.current) return null;
        const rect = canvas.getBoundingClientRect();
        const [tx, ty, zoom] = store.getState().transform;
        const fx = (clientX - rect.left - tx) / zoom;
        const fy = (clientY - rect.top - ty) / zoom;
        const i = hitPoint(sc, fx, fy, tolerancePx / zoom);
        return i >= 0 ? sc.ids[i] : null;
      },
      redrawAt: (dpr) => {
        dprRef.current = dpr;
        drawNowRef.current();
      },
      restore: () => {
        dprRef.current = window.devicePixelRatio || 1;
        drawNowRef.current();
      },
      previewOffset: (indices, dx, dy) => {
        const sc = lastSceneRef.current;
        if (!sc) return;
        let origin = dragOriginRef.current;
        if (!origin || origin.scene !== sc || origin.indices !== indices) {
          origin = {
            scene: sc,
            indices,
            x: Float32Array.from(indices, (i) => sc.x[i]),
            y: Float32Array.from(indices, (i) => sc.y[i]),
          };
          dragOriginRef.current = origin;
        }
        // In place: links read their ends from the same arrays and follow
        for (let k = 0; k < indices.length; k++) {
          sc.x[indices[k]] = origin.x[k] + dx;
          sc.y[indices[k]] = origin.y[k] + dy;
        }
        scheduleRef.current();
      },
      cancelOffset: () => {
        const origin = dragOriginRef.current;
        dragOriginRef.current = null;
        if (!origin) return;
        for (let k = 0; k < origin.indices.length; k++) {
          origin.scene.x[origin.indices[k]] = origin.x[k];
          origin.scene.y[origin.indices[k]] = origin.y[k];
        }
        scheduleRef.current();
      },
      endOffset: () => {
        dragOriginRef.current = null;
      },
    };
    return () => { handleRef.current = null; };
  }, [handleRef, store]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="canvas-overview"
      data-active={active ? 'true' : 'false'}
      className="absolute inset-0 pointer-events-none"
      // Above the dotted background (z -1), under React Flow's pane (z 1)
      style={{ zIndex: 0, width: '100%', height: '100%', display: visible ? 'block' : 'none' }}
    />
  );
}

function toFlowRect(r: SelectionRect, transform: [number, number, number]): [number, number, number, number] {
  const [tx, ty, zoom] = transform;
  return [(r.x - tx) / zoom, (r.y - ty) / zoom, (r.x + r.width - tx) / zoom, (r.y + r.height - ty) / zoom];
}

export const OverviewLayer = memo(OverviewLayerComponent);
