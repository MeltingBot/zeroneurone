import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MiniMap } from '@xyflow/react';
import { GripHorizontal, X } from 'lucide-react';
import { useUIStore } from '../../stores';

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

export function DraggableMinimap() {
  const { t } = useTranslation('pages');
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const showMinimap = useUIStore((state) => state.showMinimap);
  const toggleMinimap = useUIStore((state) => state.toggleMinimap);

  // Initialize position to bottom-right on mount
  useEffect(() => {
    if (position !== null) return;
    const parent = containerRef.current?.parentElement;
    if (parent) {
      const rect = parent.getBoundingClientRect();
      setPosition({
        x: rect.width - DEFAULT_WIDTH - INITIAL_MARGIN,
        y: rect.height - DEFAULT_HEIGHT - HANDLE_HEIGHT - INITIAL_MARGIN,
      });
    }
  }, [position]);

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
      const totalWidth = DEFAULT_WIDTH;
      const totalHeight = DEFAULT_HEIGHT + HANDLE_HEIGHT;

      let newX = e.clientX - dragOffsetRef.current.x;
      let newY = e.clientY - dragOffsetRef.current.y;

      // Constrain within parent bounds
      newX = Math.max(0, Math.min(newX, parentRect.width - totalWidth));
      newY = Math.max(0, Math.min(newY, parentRect.height - totalHeight));

      setPosition({ x: newX, y: newY });
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

  const nodeColor = useCallback((node: { data?: { element?: { visual?: { color?: string } } } }) => {
    const color = node.data?.element?.visual?.color;
    if (!color) return '#94a3b8';
    // Detect very light colors (white, near-white) and replace with visible gray
    if (isLightColor(color)) return '#94a3b8';
    return color;
  }, []);

  if (position === null) {
    // Render invisible to measure parent, will re-render with position
    return <div ref={containerRef} style={{ position: 'absolute', visibility: 'hidden' }} />;
  }

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        left: position.x,
        top: position.y,
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
          title={t('investigation.toolbar.hideMinimap')}
        >
          <X size={10} />
        </button>
      </div>
      <MiniMap
        nodeColor={nodeColor}
        maskColor="rgba(0,0,0,0.08)"
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
      />
    </div>
  );
}
