/**
 * Links layer: the links React Flow does not draw itself — beyond its cap of
 * rendered edges, off screen at the last re-cull, or not yet added by the
 * progressive rendering — drawn on a <canvas> under its nodes, so that every
 * link of the graph stays visible. Straight lines between centres, with
 * their arrows, like React Flow's simplified edges. The canvas takes no
 * input: a click reaches the pane, which hit-tests the scene (hitLink).
 *
 * Redraws follow React Flow's store directly (transform, size, dragged
 * nodes), outside React: panning re-renders no component.
 */

import { memo, useEffect, useLayoutEffect, useRef } from 'react';
import { useStoreApi } from '@xyflow/react';
import { Canvas2DOverviewRenderer, type OverviewRenderer, type OverviewTheme } from './overviewRenderer';
import type { OverviewScene } from './overviewTypes';
import { clampPixelRatio, registerExportLayer } from './exportLayers';

interface LinksLayerProps {
  /** Links to draw, with every node as a possible end; null draws nothing. */
  scene: OverviewScene | null;
  /** Theme mode, to re-read the accent colour when it changes. */
  themeMode: string;
}

function LinksLayerComponent({ scene, themeMode }: LinksLayerProps) {
  const store = useStoreApi();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<OverviewRenderer | null>(null);
  const frameRef = useRef(0);
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const themeRef = useRef<OverviewTheme>({ accent: '#2563eb' });
  /** Pixel ratio drawn at: the screen's, or a PNG export's while it captures. */
  const exportRatioRef = useRef<number | null>(null);

  const drawNow = () => {
    const renderer = rendererRef.current;
    const canvas = canvasRef.current;
    if (!renderer || !canvas) return;
    const { transform, width, height } = store.getState();
    renderer.resize(width, height, exportRatioRef.current ?? (window.devicePixelRatio || 1));
    const stats = renderer.draw({ x: transform[0], y: transform[1], zoom: transform[2] });
    // Read by the e2e specs
    canvas.dataset.linksDrawn = String(stats.linksDrawn);
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
    rendererRef.current = new Canvas2DOverviewRenderer(canvasRef.current, { linksOnly: true });
    rendererRef.current.setScene(sceneRef.current, themeRef.current);
    drawNowRef.current();
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
      rendererRef.current?.destroy();
      rendererRef.current = null;
    };
  }, []);

  // Sharper PNG export: redrawn at the output ratio during the capture
  useEffect(() => registerExportLayer({
    redrawAt: (ratio) => {
      const { width, height } = store.getState();
      exportRatioRef.current = clampPixelRatio(ratio, width, height);
      drawNowRef.current();
    },
    restore: () => {
      exportRatioRef.current = null;
      drawNowRef.current();
    },
  }), [store]);

  // Accent colour (selected links), read once per theme after paint
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    themeRef.current = {
      accent: getComputedStyle(canvas).getPropertyValue('--color-accent').trim() || '#2563eb',
      mode: themeMode,
    };
    rendererRef.current?.setScene(sceneRef.current, themeRef.current);
    scheduleRef.current();
  }, [themeMode]);

  // Scene changed: draw before paint, so the links handed over to or from
  // React Flow never leave an empty frame
  useLayoutEffect(() => {
    rendererRef.current?.setScene(scene, themeRef.current);
    drawNowRef.current();
  }, [scene]);

  // Follow React Flow's viewport, and the nodes being dragged: their links
  // move with them before the dossier receives the new positions
  useEffect(() => store.subscribe((s, prev) => {
    if (s.transform !== prev.transform || s.width !== prev.width || s.height !== prev.height) {
      scheduleRef.current();
    }
    if (s.nodes === prev.nodes) return;
    const sc = sceneRef.current;
    if (!sc) return;
    // Dragged nodes, and the children of a dragged group (moved with it)
    const dragged = new Set<string>();
    for (const node of s.nodes) if (node.dragging) dragged.add(node.id);
    if (dragged.size === 0) return;
    let moved = false;
    for (const node of s.nodes) {
      if (!dragged.has(node.id) && !(node.parentId && dragged.has(node.parentId))) continue;
      const i = sc.indexById.get(node.id);
      const pos = s.nodeLookup.get(node.id)?.internals.positionAbsolute;
      if (i === undefined || !pos) continue;
      if (sc.x[i] !== pos.x || sc.y[i] !== pos.y) {
        sc.x[i] = pos.x;
        sc.y[i] = pos.y;
        moved = true;
      }
    }
    if (moved) scheduleRef.current();
  }), [store]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="canvas-links-layer"
      className="absolute inset-0 pointer-events-none"
      // Above the dotted background (z -1), under React Flow's pane (z 1)
      style={{ zIndex: 0, width: '100%', height: '100%' }}
    />
  );
}

export const LinksLayer = memo(LinksLayerComponent);
