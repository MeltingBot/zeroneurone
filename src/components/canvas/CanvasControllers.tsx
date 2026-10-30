/** Small controllers mounted inside the React Flow canvas: capture, zoom, initial framing */

import { useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useReactFlow, useStore as useFlowStore } from '@xyflow/react';

import { ZoomIn, ZoomOut, Maximize2, RotateCcw } from 'lucide-react';

import { isExportedNode, withLayersAt } from './overview/exportLayers';

import { useSelectionStore, useViewStore, useUIStore } from '../../stores';

// Capture handler for report screenshots - must be inside ReactFlowProvider
export function CanvasCaptureHandler() {
  const { fitView } = useReactFlow();
  const { registerCaptureHandler, unregisterCaptureHandler } = useUIStore();

  useEffect(() => {
    const captureHandler = async (): Promise<string | null> => {

      // Fit view to show all elements
      // The overview layer hides every node: count them
      fitView({ padding: 0.15, duration: 0, includeHiddenNodes: useUIStore.getState().canvasOverviewLayer });

      // Wait for React Flow to fully render
      await new Promise(resolve => setTimeout(resolve, 500));

      // Capture
      const element = document.querySelector('[data-report-capture="canvas"]') as HTMLElement;
      if (!element) {
        return null;
      }

      try {
        // Chargement a la demande : la capture PNG n'est pas sur le chemin nominal.
        const { toPng } = await import('html-to-image');
        return await withLayersAt(3, () => toPng(element, {
          backgroundColor: '#faf8f5',
          filter: isExportedNode,
          pixelRatio: 3,
          skipFonts: true,
        }));
      } catch (error) {
        console.error('Canvas capture failed:', error);
        return null;
      }
    };

    registerCaptureHandler('canvas', captureHandler);
    return () => unregisterCaptureHandler('canvas');
  }, [fitView, registerCaptureHandler, unregisterCaptureHandler]);

  return null;
}

// Zoom controls for the toolbar - must be inside ReactFlowProvider
export function CanvasZoomControls() {
  const { t } = useTranslation('pages');
  const { zoomIn, zoomOut, fitView, setViewport } = useReactFlow();

  const handleZoomIn = useCallback(() => {
    zoomIn({ duration: 200 });
  }, [zoomIn]);

  const handleZoomOut = useCallback(() => {
    zoomOut({ duration: 200 });
  }, [zoomOut]);

  const handleFitView = useCallback(() => {
    fitView({ padding: 0.2, duration: 300, includeHiddenNodes: useUIStore.getState().canvasOverviewLayer });
  }, [fitView]);

  const handleReset = useCallback(() => {
    setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 300 });
  }, [setViewport]);

  return (
    <>
      <button
        onClick={handleZoomOut}
        className="p-1.5 text-text-secondary hover:bg-bg-tertiary rounded"
        title={t('dossier.toolbar.zoomOut')}
      >
        <ZoomOut size={16} />
      </button>
      <button
        onClick={handleZoomIn}
        className="p-1.5 text-text-secondary hover:bg-bg-tertiary rounded"
        title={t('dossier.toolbar.zoomIn')}
      >
        <ZoomIn size={16} />
      </button>
      <div className="w-px h-4 bg-border-default mx-1" />
      <button
        onClick={handleFitView}
        data-testid="fit-view"
        className="p-1.5 text-text-secondary hover:bg-bg-tertiary rounded"
        title={t('dossier.toolbar.fitView')}
      >
        <Maximize2 size={16} />
      </button>
      <button
        onClick={handleReset}
        className="p-1.5 text-text-secondary hover:bg-bg-tertiary rounded"
        title={t('dossier.toolbar.resetView')}
      >
        <RotateCcw size={16} />
      </button>
    </>
  );
}

// Selection held when the canvas was last left (the store replaces the Set on
// every change, so identity tells whether it changed in another view)
let selectionWhenCanvasLeft: ReadonlySet<string> | null = null;

// Arriving on the canvas with a selection made elsewhere (map, timeline):
// centre it, at most at zoom 1 like the search. A selection unchanged since
// the canvas was left keeps the restored viewport. Once per mount, when the
// pane has its size.
export function RevealSelectionOnOpen() {
  const { getInternalNode, setCenter } = useReactFlow();
  const width = useFlowStore((s) => s.width);
  const height = useFlowStore((s) => s.height);
  const doneRef = useRef(false);
  // Decided on the first mount only: refs survive StrictMode's remount,
  // whose cleanup would otherwise record the selection as already seen
  const changedRef = useRef<boolean | null>(null);

  useEffect(() => {
    changedRef.current ??= useSelectionStore.getState().selectedElementIds !== selectionWhenCanvasLeft;
    return () => { selectionWhenCanvasLeft = useSelectionStore.getState().selectedElementIds; };
  }, []);

  useEffect(() => {
    if (doneRef.current || width === 0 || height === 0) return;
    doneRef.current = true;
    const ids = useSelectionStore.getState().selectedElementIds;
    if (ids.size === 0 || !changedRef.current) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const id of ids) {
      const node = getInternalNode(id);
      if (!node) continue; // not on this tab, or hidden
      const { x, y } = node.internals.positionAbsolute;
      const w = node.measured?.width ?? node.width ?? 56;
      const h = node.measured?.height ?? node.height ?? 56;
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h);
    }
    if (minX === Infinity) return;
    const pad = 1.3;
    const zoom = Math.min(1, width / ((maxX - minX) * pad), height / ((maxY - minY) * pad));
    setCenter((minX + maxX) / 2, (minY + maxY) / 2, { zoom, duration: 300 });
  }, [width, height, getInternalNode, setCenter]);

  return null;
}

// FitView controller - watches for pending fitView requests and applies them
export function FitViewController() {
  const { fitView, getNodes } = useReactFlow();
  const pendingFitView = useViewStore((s) => s.pendingFitView);
  const pendingFitViewIds = useViewStore((s) => s.pendingFitViewIds);
  const clearPendingFitView = useViewStore((s) => s.clearPendingFitView);

  useEffect(() => {
    if (!pendingFitView) return;

    // Wait for nodes to be rendered and measured before fitting.
    // After import/load, nodes may not exist yet when this effect first fires.
    let attempts = 0;
    const maxAttempts = 20; // 20 × 100ms = 2s max
    const interval = setInterval(() => {
      attempts++;
      const nodes = getNodes();
      // Framing given elements (a tab just opened): wait for them, not for
      // the nodes still shown from before
      const wanted = pendingFitViewIds ? new Set(pendingFitViewIds) : null;
      // A node hidden by the overview layer may never have been measured: its
      // estimated size (initialWidth) is enough to frame it
      const hasMeasuredNodes = nodes.length > 0 && nodes.some(n => (n.measured?.width || n.initialWidth) && (!wanted || wanted.has(n.id)));
      if (hasMeasuredNodes || attempts >= maxAttempts) {
        clearInterval(interval);
        fitView({
          padding: 0.2,
          duration: 300,
          includeHiddenNodes: useUIStore.getState().canvasOverviewLayer,
          ...(pendingFitViewIds ? { nodes: pendingFitViewIds.map((id) => ({ id })) } : {}),
        });
        clearPendingFitView();
      }
    }, 100);
    return () => clearInterval(interval);
  }, [pendingFitView, pendingFitViewIds, fitView, clearPendingFitView, getNodes]);

  return null;
}
