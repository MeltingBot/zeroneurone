import { useEffect, useState, useCallback } from 'react';
import { useSwimlaneLayout, SWIMLANE_LABEL_WIDTH } from './useSwimlaneLayout';
import { SwimlaneLane } from './SwimlaneLane';
import type { LaneGroup } from './useSwimlaneGrouping';
import type { TimelineItem } from './TimelineView';

interface AxisLabel {
  x: number;
  label: string;
  isMain: boolean;
}

interface TimelineSwimlaneProps {
  lanes: LaneGroup[];
  dateToX: (date: Date) => number;
  containerWidth: number;
  scrollTop: number;
  containerHeight: number;
  axisLabels: AxisLabel[];
  onItemClick: (item: TimelineItem, e: React.MouseEvent) => void;
  isSelected: (item: TimelineItem) => boolean;
  selectedElementIds: Set<string>;
  anonymousMode: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onLaneReorder?: (fromKey: string, toKey: string) => void;
  collapsedLanes: Set<string>;
  onToggleCollapse: (laneKey: string) => void;
}

const VIRTUALIZATION_BUFFER = 200;

export function TimelineSwimlane({
  lanes,
  dateToX,
  containerWidth,
  scrollTop,
  containerHeight,
  axisLabels,
  onItemClick,
  isSelected,
  selectedElementIds,
  anonymousMode,
  containerRef,
  onLaneReorder,
  collapsedLanes,
  onToggleCollapse,
}: TimelineSwimlaneProps) {
  const layout = useSwimlaneLayout(lanes, dateToX, collapsedLanes);
  const [dragSourceKey, setDragSourceKey] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  // Vertical virtualization: only render visible lanes
  const visibleTop = scrollTop - VIRTUALIZATION_BUFFER;
  const visibleBottom = scrollTop + containerHeight + VIRTUALIZATION_BUFFER;

  const visibleLanes = layout.lanes.filter(
    lane => lane.yOffset + lane.height > visibleTop && lane.yOffset < visibleBottom,
  );

  // Today marker position
  const todayX = dateToX(new Date());

  // Scroll-to-selected: when selection changes, scroll to bring selected item into view
  useEffect(() => {
    if (selectedElementIds.size === 0 || !containerRef.current) return;
    const selectedId = [...selectedElementIds][0];

    for (const lane of layout.lanes) {
      const found = lane.items.find(li => li.item.sourceId === selectedId);
      if (found) {
        const itemTop = lane.yOffset;
        const itemBottom = lane.yOffset + lane.height;
        const viewTop = containerRef.current.scrollTop;
        const viewBottom = viewTop + containerRef.current.clientHeight;

        if (itemTop < viewTop || itemBottom > viewBottom) {
          containerRef.current.scrollTo({
            top: Math.max(0, itemTop - 50),
            behavior: 'smooth',
          });
        }
        break;
      }
    }
  }, [selectedElementIds, layout.lanes, containerRef]);

  const handleDragStart = useCallback((key: string) => {
    setDragSourceKey(key);
  }, []);

  const handleDragOver = useCallback((key: string) => {
    setDragOverKey(key);
  }, []);

  const handleDragEnd = useCallback(() => {
    if (dragSourceKey && dragOverKey && dragSourceKey !== dragOverKey && onLaneReorder) {
      onLaneReorder(dragSourceKey, dragOverKey);
    }
    setDragSourceKey(null);
    setDragOverKey(null);
  }, [dragSourceKey, dragOverKey, onLaneReorder]);

  return (
    <div
      className="relative bg-bg-secondary"
      style={{ height: layout.totalHeight, minHeight: containerHeight }}
    >
      {/* Grid lines (from axis labels, through all lanes) */}
      <div
        className="absolute top-0 bottom-0 pointer-events-none z-[1] overflow-hidden"
        style={{ left: SWIMLANE_LABEL_WIDTH, right: 0 }}
      >
        {axisLabels.map((label, i) => {
          const adjustedX = label.x - SWIMLANE_LABEL_WIDTH;
          if (adjustedX < -50 || adjustedX > containerWidth) return null;
          return (
            <div
              key={i}
              className="absolute top-0 bottom-0"
              style={{
                transform: `translate3d(${adjustedX}px, 0, 0)`,
                width: 0.5,
                backgroundColor: label.isMain
                  ? 'rgba(156,163,175,0.4)'
                  : 'rgba(156,163,175,0.15)',
              }}
            />
          );
        })}
      </div>

      {/* Today marker */}
      {todayX > 0 && todayX < containerWidth && (
        <div
          className="absolute top-0 bottom-0 z-20 pointer-events-none"
          style={{
            transform: `translate3d(${todayX}px, 0, 0)`,
            width: 1.5,
            backgroundColor: 'rgba(239, 68, 68, 0.6)',
          }}
        />
      )}

      {/* Lanes */}
      {visibleLanes.map((lane) => {
        const globalIndex = layout.lanes.indexOf(lane);
        return (
          <SwimlaneLane
            key={lane.key}
            lane={lane}
            isEven={globalIndex % 2 === 0}
            containerWidth={containerWidth}
            onItemClick={onItemClick as (item: unknown, e: React.MouseEvent) => void}
            isSelected={isSelected as (item: unknown) => boolean}
            anonymousMode={anonymousMode}
            isDragOver={dragOverKey === lane.key && dragSourceKey !== lane.key}
            onDragStart={onLaneReorder ? handleDragStart : undefined}
            onDragOver={onLaneReorder ? handleDragOver : undefined}
            onDragEnd={onLaneReorder ? handleDragEnd : undefined}
            onToggleCollapse={onToggleCollapse}
          />
        );
      })}
    </div>
  );
}
