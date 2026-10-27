import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MiniMap } from '@xyflow/react';
import { GripHorizontal, X } from 'lucide-react';
import { useUIStore } from '../../stores';
import { OverviewMinimap } from './overview/OverviewMinimap';
import type { OverviewScene } from './overview/overviewTypes';

// Check if a hex color is very light (luminance > 0.85)
function isLightColor(hex: string): boolean {
  const c = hex.replace('#', '');
  if (c.length < 6) return false;
  const r = parseInt(c.substring(0, 2), 16) / 255;
  const g = parseInt(c.substring(2, 4), 16) / 255;
  const b = parseInt(c.substring(4, 6), 16) / 255;
  // Relative luminance
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  return lum > 0.85;
}

const DEFAULT_WIDTH = 180;
const DEFAULT_HEIGHT = 120;
const HANDLE_HEIGHT = 20;
const INITIAL_MARGIN = 12;

/**
 * Where the minimap sits: a distance from the nearest corner's two edges.
 * Anchored to the right (or bottom), it keeps its distance to that edge when
 * the canvas is resized, e.g. when the side panel is widened.
 */
interface MinimapAnchor {
  h: 'left' | 'right';
  x: number;
  v: 'top' | 'bottom';
  y: number;
}

const TOTAL_HEIGHT = DEFAULT_HEIGHT + HANDLE_HEIGHT;

interface DraggableMinimapProps {
  /** Nodes to draw on a canvas instead of React Flow's minimap (overview layer on). */
  scene?: OverviewScene | null;
}

export function DraggableMinimap({ scene = null }: DraggableMinimapProps = {}) {
  const { t } = useTranslation('pages');
  const containerRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<MinimapAnchor>({ h: 'right', x: INITIAL_MARGIN, v: 'bottom', y: INITIAL_MARGIN });
  const [parentSize, setParentSize] = useState<{ width: number; height: number } | null>(null);
  const isDraggingRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const showMinimap = useUIStore((state) => state.showMinimap);
  const toggleMinimap = useUIStore((state) => state.toggleMinimap);
  const themeMode = useUIStore((state) => state.themeMode);
  const isDark = themeMode === 'dark';

  // Follow the canvas size, to keep the minimap inside it
  useEffect(() => {
    const parent = containerRef.current?.parentElement;
    if (!parent) return;
    const observer = new ResizeObserver(([entry]) => {
      setParentSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isDraggingRef.current = true;
    const el = containerRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      const parentRect = el.parentElement!.getBoundingClientRect();
      dragOffsetRef.current = {
        x: e.clientX - (rect.left - parentRect.left),
        y: e.clientY - (rect.top - parentRect.top),
      };
    }
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || !containerRef.current) return;
      const parent = containerRef.current.parentElement;
      if (!parent) return;

      const parentRect = parent.getBoundingClientRect();
      // Top-left corner, constrained within the canvas
      const left = Math.max(0, Math.min(e.clientX - dragOffsetRef.current.x, parentRect.width - DEFAULT_WIDTH));
      const top = Math.max(0, Math.min(e.clientY - dragOffsetRef.current.y, parentRect.height - TOTAL_HEIGHT));
      const right = parentRect.width - left - DEFAULT_WIDTH;
      const bottom = parentRect.height - top - TOTAL_HEIGHT;

      // Anchor to the nearest corner
      setAnchor({
        h: right < left ? 'right' : 'left',
        x: right < left ? right : left,
        v: bottom < top ? 'bottom' : 'top',
        y: bottom < top ? bottom : top,
      });
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // Canvas narrower than the stored distance: stay inside it
  const x = parentSize ? Math.min(anchor.x, Math.max(0, parentSize.width - DEFAULT_WIDTH)) : anchor.x;
  const y = parentSize ? Math.min(anchor.y, Math.max(0, parentSize.height - TOTAL_HEIGHT)) : anchor.y;

  // Very light colours (white, near-white) are replaced with a visible gray
  const visibleColor = useCallback((color: string | undefined) => {
    const fallback = isDark ? '#64748b' : '#94a3b8';
    if (!color || isLightColor(color)) return fallback;
    return color;
  }, [isDark]);
  const nodeColor = useCallback(
    (node: { data?: { element?: { visual?: { color?: string } } } }) => visibleColor(node.data?.element?.visual?.color),
    [visibleColor],
  );
  const bgColor = isDark ? '#1a1816' : '#faf8f5';
  const maskColor = isDark ? 'rgba(200,200,200,0.1)' : 'rgba(0,0,0,0.08)';
  const viewportColor = isDark ? '#a8a29e' : '#78716c';

  return (
    <div
      ref={containerRef}
      data-export-ignore
      style={{
        position: 'absolute',
        [anchor.h]: x,
        [anchor.v]: y,
        width: DEFAULT_WIDTH,
        display: showMinimap ? undefined : 'none',
      }}
      className="border border-border-default rounded bg-bg-secondary/95 z-40"
    >
      <div
        onMouseDown={handleMouseDown}
        className="h-5 cursor-grab active:cursor-grabbing flex items-center justify-between px-1 border-b border-border-default bg-bg-secondary/50 rounded-t"
      >
        <span />
        <GripHorizontal size={12} className="text-text-tertiary" />
        <button
          onClick={(e) => { e.stopPropagation(); toggleMinimap(); }}
          onMouseDown={(e) => e.stopPropagation()}
          className="p-0.5 text-text-tertiary hover:text-text-secondary rounded"
          title={t('dossier.toolbar.hideMinimap')}
        >
          <X size={10} />
        </button>
      </div>
      {/* Hidden: not mounted at all, it would still draw every node */}
      {showMinimap && scene && (
        <OverviewMinimap
          scene={scene}
          width={DEFAULT_WIDTH}
          height={DEFAULT_HEIGHT}
          bgColor={bgColor}
          maskColor={maskColor}
          viewportColor={viewportColor}
          nodeColor={visibleColor}
        />
      )}
      {showMinimap && !scene && <MiniMap
        nodeColor={nodeColor}
        bgColor={bgColor}
        maskColor={maskColor}
        maskStrokeColor={viewportColor}
        maskStrokeWidth={1}
        style={{
          width: DEFAULT_WIDTH,
          height: DEFAULT_HEIGHT,
          position: 'relative',
          margin: 0,
          bottom: 'auto',
          right: 'auto',
          left: 0,
          top: 0,
        }}
        pannable
        zoomable
      />}
    </div>
  );
}
