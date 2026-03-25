import { ChevronRight, ChevronDown, GripVertical } from 'lucide-react';
import type { LaneLayout, LayoutItem } from './useSwimlaneLayout';
import type { TimelineItem } from './TimelineView';
import {
  SWIMLANE_ITEM_HEIGHT,
  SWIMLANE_ROW_GAP,
  SWIMLANE_LANE_PADDING,
  SWIMLANE_LABEL_WIDTH,
} from './useSwimlaneLayout';

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
  const bgColor = isEven ? 'var(--color-bg-primary)' : 'var(--color-bg-secondary)';
  const BUFFER = 200;

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
          {visibleItems.map(({ item, row, x, width }: LayoutItem & { item: TimelineItem }) => {
            const itemY = SWIMLANE_LANE_PADDING + row * (SWIMLANE_ITEM_HEIGHT + SWIMLANE_ROW_GAP);
            const selected = isSelected(item);
            const adjustedX = x - SWIMLANE_LABEL_WIDTH;

            return (
              <div
                key={item.id}
                className={`absolute cursor-pointer transition-shadow ${
                  selected ? 'ring-2 ring-accent ring-offset-1' : ''
                }`}
                style={{
                  transform: `translate3d(${adjustedX}px, ${itemY}px, 0)`,
                  width,
                  height: SWIMLANE_ITEM_HEIGHT,
                  backgroundColor: `${item.color}26`,
                  border: `0.5px solid ${item.color}`,
                  borderRadius: 3,
                  opacity: item.isDimmed ? 0.3 : 1,
                }}
                title={anonymousMode ? '***' : formatTooltip(item)}
                onClick={(e) => onItemClick(item, e)}
              >
                <span
                  className="block truncate px-1.5 text-text-primary"
                  style={{ fontSize: 11, lineHeight: `${SWIMLANE_ITEM_HEIGHT}px` }}
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
