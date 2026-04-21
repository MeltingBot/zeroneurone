import { ChevronRight, ChevronDown, GripVertical } from 'lucide-react';
import type { LaneLayout, LayoutItem } from './useSwimlaneLayout';
import type { TimelineItem } from './TimelineView';
import {
  SWIMLANE_LANE_PADDING,
  SWIMLANE_LABEL_WIDTH,
  SWIMLANE_LINK_HEIGHT_COMPACT,
} from './useSwimlaneLayout';
import { useUIStore } from '../../stores/uiStore';

/** Darken a color for light-theme borders so pastel swatches stay visible on white. */
function borderForTheme(color: string, themeMode: 'light' | 'dark'): string {
  return themeMode === 'light'
    ? `color-mix(in srgb, ${color}, black 30%)`
    : color;
}

/** Opacity suffix for the item fill — light theme needs more opacity to break from white bg. */
function fillAlphaForTheme(themeMode: 'light' | 'dark'): string {
  return themeMode === 'light' ? '40' : '26'; // 25% vs 15%
}

interface SwimlaneLaneProps {
  lane: LaneLayout;
  isEven: boolean;
  containerWidth: number;
  onItemClick: (item: TimelineItem, e: React.MouseEvent) => void;
  isSelected: (item: TimelineItem) => boolean;
  anonymousMode: boolean;
  isDragOver?: boolean;
  onDragStart?: (laneKey: string) => void;
  onDragOver?: (laneKey: string) => void;
  onDragEnd?: () => void;
  onToggleCollapse?: (laneKey: string) => void;
}

function formatTooltip(item: TimelineItem): string {
  const parts: string[] = [item.label];
  const fmtDate = (d: Date) => {
    const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0;
    return hasTime
      ? d.toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
  };
  if (item.end && item.end.getTime() !== item.start.getTime()) {
    parts.push(`${fmtDate(item.start)} \u2192 ${fmtDate(item.end)}`);
  } else {
    parts.push(fmtDate(item.start));
  }
  if (item.sublabel) parts.push(item.sublabel);
  return parts.join('\n');
}

export function SwimlaneLane({
  lane,
  isEven,
  containerWidth,
  onItemClick,
  isSelected,
  anonymousMode,
  isDragOver,
  onDragStart,
  onDragOver,
  onDragEnd,
  onToggleCollapse,
}: SwimlaneLaneProps) {
  const themeMode = useUIStore((s) => s.themeMode);
  const bgColor = isEven ? 'var(--color-bg-primary)' : 'var(--color-bg-secondary)';
  const BUFFER = 200;
  const fillAlpha = fillAlphaForTheme(themeMode);

  // Horizontal virtualization: only render visible items
  const visibleItems = lane.collapsed ? [] : lane.items.filter(
    ({ x, width }) => x + width > -BUFFER && x < containerWidth + BUFFER,
  );

  const CollapseIcon = lane.collapsed ? ChevronRight : ChevronDown;

  return (
    <div
      className="absolute left-0 right-0 border-b border-border-default"
      style={{
        top: lane.yOffset,
        height: lane.height,
        backgroundColor: bgColor,
      }}
    >
      {/* Drop indicator */}
      {isDragOver && (
        <div className="absolute left-0 right-0 top-0 h-0.5 bg-accent z-30" />
      )}

      {/* Lane label (sticky left) */}
      <div
        className="absolute left-0 top-0 flex items-center z-10 border-r border-border-default group"
        style={{
          width: SWIMLANE_LABEL_WIDTH,
          height: lane.height,
          backgroundColor: bgColor,
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          onDragOver?.(lane.key);
        }}
        onDrop={(e) => {
          e.preventDefault();
          onDragEnd?.();
        }}
      >
        <div
          draggable={!!onDragStart}
          onDragStart={(e) => {
            if (!onDragStart) return;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', lane.key);
            onDragStart(lane.key);
          }}
          onDragEnd={() => onDragEnd?.()}
          className={`shrink-0 flex items-center ml-0.5 ${
            onDragStart ? 'cursor-grab active:cursor-grabbing' : ''
          }`}
        >
          <GripVertical size={12} className="text-text-tertiary opacity-0 group-hover:opacity-100" />
        </div>
        <button
          onClick={() => onToggleCollapse?.(lane.key)}
          className="shrink-0 flex items-center text-text-tertiary hover:text-text-secondary"
        >
          <CollapseIcon size={12} />
        </button>
        <span
          className={`text-xs font-medium truncate px-1 ${
            lane.collapsed ? 'text-text-secondary' : 'text-text-primary'
          }`}
          title={lane.label}
        >
          {lane.label}
        </span>
        {lane.collapsed && (
          <span className="text-[10px] text-text-tertiary shrink-0">
            {lane.itemCount}
          </span>
        )}
      </div>

      {/* Items area (offset by label width) — hidden when collapsed */}
      {!lane.collapsed && (
        <div
          className="absolute top-0 bottom-0 overflow-hidden"
          style={{ left: SWIMLANE_LABEL_WIDTH, right: 0 }}
        >
          {visibleItems.map(({ item, rowY, x, width, itemHeight }: LayoutItem & { item: TimelineItem }) => {
            const itemY = SWIMLANE_LANE_PADDING + rowY;
            const selected = isSelected(item);
            const adjustedX = x - SWIMLANE_LABEL_WIDTH;
            const isLink = item.type === 'link';
            // When an item starts off-screen left, shift label to the visible edge
            const labelPad = adjustedX < 0 ? -adjustedX + 6 : 6;

            if (isLink) {
              const isCompact = itemHeight <= SWIMLANE_LINK_HEIGHT_COMPACT;
              const linkBorder = borderForTheme(item.color, themeMode);
              // Links: thin bar when compact, full chip with label when wide
              return (
                <div
                  key={item.id}
                  className={`absolute cursor-pointer ${
                    selected ? (isCompact ? 'ring-1 ring-accent' : 'ring-2 ring-accent ring-offset-1') : ''
                  }`}
                  style={{
                    transform: `translate3d(${adjustedX}px, ${itemY}px, 0)`,
                    width,
                    height: itemHeight,
                    backgroundColor: isCompact ? `${item.color}40` : `${item.color}18`,
                    border: isCompact ? 'none' : `0.5px dashed ${linkBorder}`,
                    borderRadius: isCompact ? 2 : 3,
                    opacity: item.isDimmed ? 0.3 : 1,
                  }}
                  title={anonymousMode ? '***' : formatTooltip(item)}
                  onClick={(e) => onItemClick(item, e)}
                >
                  {!isCompact && (
                    <span
                      className="block truncate text-text-secondary"
                      style={{ fontSize: 10, lineHeight: `${itemHeight}px`, paddingLeft: labelPad, paddingRight: 6 }}
                    >
                      {anonymousMode ? '***' : item.label}
                    </span>
                  )}
                </div>
              );
            }

            return (
              <div
                key={item.id}
                className={`absolute cursor-pointer transition-shadow ${
                  selected ? 'ring-2 ring-accent ring-offset-1' : ''
                }`}
                style={{
                  transform: `translate3d(${adjustedX}px, ${itemY}px, 0)`,
                  width,
                  height: itemHeight,
                  backgroundColor: `${item.color}${fillAlpha}`,
                  border: `1px solid ${borderForTheme(item.color, themeMode)}`,
                  borderRadius: 3,
                  opacity: item.isDimmed ? 0.3 : 1,
                }}
                title={anonymousMode ? '***' : formatTooltip(item)}
                onClick={(e) => onItemClick(item, e)}
              >
                <span
                  className="block truncate text-text-primary"
                  style={{ fontSize: 11, lineHeight: `${itemHeight}px`, paddingLeft: labelPad, paddingRight: 6 }}
                >
                  {anonymousMode ? '***' : item.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
