import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

import { useSelectionStore } from '../../stores';
import type { TimelineItem } from './timelineItems';
import { MIN_ZOOM, MAX_ZOOM, ROW_HEIGHT, ROW_GAP } from './timelineConstants';

// Selection held when the timeline was last left (the store replaces the Set
// on every change, so identity tells whether it changed in another view)
let selectionWhenTimelineLeft: ReadonlySet<string> | null = null;

export interface TimelineNavigationParams {
  containerRef: RefObject<HTMLDivElement | null>;
  zoom: number;
  setZoom: (v: number | ((prev: number) => number)) => void;
  viewStart: Date;
  setViewStart: (d: Date) => void;
  viewStartMs: number;
  timeBounds: { min: Date; max: Date };
  itemsWithRows: (TimelineItem & { row: number })[];
  selectedElementIds: ReadonlySet<string>;
  timelineMode: 'scatter' | 'swimlane';
  getContainerWidth: () => number;
}

/**
 * Moving along the timeline: Ctrl+wheel zoom around the cursor, drag to pan,
 * zoom and fit buttons, and bringing an item on screen (search, selection
 * made in another view, first visit).
 * containerRef, a stable ref received as a parameter, is listed in the
 * dependency arrays: it triggers nothing.
 */
export function useTimelineNavigation({
  containerRef,
  zoom,
  setZoom,
  viewStart,
  setViewStart,
  viewStartMs,
  timeBounds,
  itemsWithRows,
  selectedElementIds,
  timelineMode,
  getContainerWidth,
}: TimelineNavigationParams) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartView, setDragStartView] = useState<Date>(new Date());

  // Read by the wheel listener, registered once: state would be stale there
  const zoomRef = useRef(zoom);
  const viewStartRef = useRef(viewStart);
  useEffect(() => {
    zoomRef.current = zoom;
    viewStartRef.current = viewStart;
  }, [zoom, viewStart]);

  // Wheel zoom with native event listener for proper preventDefault
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();

      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;

      const currentZoom = zoomRef.current;
      const currentViewStart = viewStartRef.current;
      const days = mouseX / currentZoom;
      const dateAtMouse = new Date(currentViewStart.getTime() + days * 24 * 60 * 60 * 1000);

      const zoomFactor = e.deltaY > 0 ? 0.8 : 1.25;
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, currentZoom * zoomFactor));

      // Adjust viewStart to keep mouse position stable
      const newDaysFromStart = mouseX / newZoom;
      const newViewStart = new Date(dateAtMouse.getTime() - newDaysFromStart * 24 * 60 * 60 * 1000);

      // Update refs immediately so rapid successive wheel events accumulate correctly
      // (the useEffect sync only runs after React re-renders, causing stale reads)
      zoomRef.current = newZoom;
      viewStartRef.current = newViewStart;

      setZoom(newZoom);
      setViewStart(newViewStart);
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [containerRef, setZoom, setViewStart]);

  // RAF-based panning for smooth performance
  const rafRef = useRef<number | null>(null);
  const pendingViewStartRef = useRef<Date | null>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStartX(e.clientX);
    setDragStartView(viewStart);
  }, [viewStart]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;

    const deltaX = e.clientX - dragStartX;
    const deltaDays = -deltaX / zoom;
    const newViewStart = new Date(dragStartView.getTime() + deltaDays * 24 * 60 * 60 * 1000);

    pendingViewStartRef.current = newViewStart;
    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(() => {
        if (pendingViewStartRef.current) {
          setViewStart(pendingViewStartRef.current);
        }
        rafRef.current = null;
      });
    }
  }, [isDragging, dragStartX, dragStartView, zoom, setViewStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const handleZoomIn = useCallback(() => {
    setZoom(z => Math.min(MAX_ZOOM, z * 1.5));
  }, [setZoom]);

  const handleZoomOut = useCallback(() => {
    setZoom(z => Math.max(MIN_ZOOM, z / 1.5));
  }, [setZoom]);

  const handleToday = useCallback(() => {
    const containerWidth = getContainerWidth();
    const daysVisible = containerWidth / zoom;
    const now = new Date();
    setViewStart(new Date(now.getTime() - (daysVisible / 2) * 24 * 60 * 60 * 1000));
  }, [zoom, getContainerWidth, setViewStart]);

  const handleFitAll = useCallback(() => {
    if (!timeBounds) return;
    const containerWidth = getContainerWidth();
    const totalDays = (timeBounds.max.getTime() - timeBounds.min.getTime()) / (24 * 60 * 60 * 1000);
    // Add 10% padding on each side
    const paddedDays = totalDays * 1.2;
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, containerWidth / paddedDays));
    // Start 10% before min
    const paddingMs = (timeBounds.max.getTime() - timeBounds.min.getTime()) * 0.1;
    setZoom(newZoom);
    setViewStart(new Date(timeBounds.min.getTime() - paddingMs));
  }, [timeBounds, getContainerWidth, setZoom, setViewStart]);

  // Bring an item on screen: its start date centred and, one row per item
  // (not in swimlanes, where rows are lanes), its row scrolled to the middle
  const revealItem = useCallback((item: { start: Date; row: number }) => {
    const daysVisible = getContainerWidth() / zoom;
    setViewStart(new Date(item.start.getTime() - (daysVisible / 2) * 24 * 60 * 60 * 1000));
    const container = containerRef.current;
    if (container && timelineMode !== 'swimlane') {
      container.scrollTop = Math.max(0, item.row * (ROW_HEIGHT + ROW_GAP) - container.clientHeight / 2);
    }
  }, [zoom, getContainerWidth, setViewStart, timelineMode, containerRef]);

  // ── Listen for scrollToElement events (from search modal) ──────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const elementId = (e as CustomEvent).detail?.elementId as string | undefined;
      if (!elementId) return;
      const item = itemsWithRows.find(it => it.sourceId === elementId);
      if (item) revealItem(item);
    };
    window.addEventListener('timeline:scrollToElement', handler);
    return () => window.removeEventListener('timeline:scrollToElement', handler);
  }, [itemsWithRows, revealItem]);

  // Arriving on the timeline with an element selected elsewhere (canvas, map):
  // bring it on screen, unless it already is. A selection unchanged since the
  // timeline was left keeps its position. Once per opening of the view.
  const revealedOnOpenRef = useRef(false);
  // Decided on the first mount only: refs survive StrictMode's remount,
  // whose cleanup would otherwise record the selection as already seen
  const selectionChangedRef = useRef<boolean | null>(null);
  useEffect(() => {
    selectionChangedRef.current ??= useSelectionStore.getState().selectedElementIds !== selectionWhenTimelineLeft;
    return () => { selectionWhenTimelineLeft = useSelectionStore.getState().selectedElementIds; };
  }, []);
  useEffect(() => {
    if (revealedOnOpenRef.current || itemsWithRows.length === 0) return;
    revealedOnOpenRef.current = true;
    if (selectedElementIds.size === 0 || !selectionChangedRef.current) return;
    const item = itemsWithRows.find(it => it.sourceId !== undefined && selectedElementIds.has(it.sourceId));
    if (!item) return;
    const viewEndMs = viewStart.getTime() + (getContainerWidth() / zoom) * 24 * 60 * 60 * 1000;
    const startMs = item.start.getTime();
    const onScreenX = startMs >= viewStart.getTime() && startMs <= viewEndMs;
    const container = containerRef.current;
    const top = item.row * (ROW_HEIGHT + ROW_GAP);
    const onScreenY = timelineMode === 'swimlane' || !container
      || (top >= container.scrollTop && top + ROW_HEIGHT <= container.scrollTop + container.clientHeight);
    if (!onScreenX || !onScreenY) revealItem(item);
  }, [itemsWithRows, selectedElementIds, viewStart, zoom, getContainerWidth, timelineMode, revealItem, containerRef]);

  // A release outside the timeline still ends the drag
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      setIsDragging(false);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  // Fit all items on first-ever visit (viewStartMs === 0); otherwise keep persisted position
  useEffect(() => {
    if (viewStartMs !== 0) return; // Already has a persisted position
    if (!containerRef.current) return;
    const containerWidth = containerRef.current.clientWidth || 800;
    const totalDays = (timeBounds.max.getTime() - timeBounds.min.getTime()) / (24 * 60 * 60 * 1000);
    if (totalDays <= 0) return;
    const paddedDays = totalDays * 1.2;
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, containerWidth / paddedDays));
    const paddingMs = (timeBounds.max.getTime() - timeBounds.min.getTime()) * 0.1;
    setZoom(newZoom);
    setViewStart(new Date(timeBounds.min.getTime() - paddingMs));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- fit all on first mount only

  return {
    isDragging,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleZoomIn,
    handleZoomOut,
    handleToday,
    handleFitAll,
  };
}
