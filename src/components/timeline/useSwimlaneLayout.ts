import { useMemo } from 'react';
import type { LaneGroup } from './useSwimlaneGrouping';
import type { TimelineItem } from './TimelineView';

export const SWIMLANE_ITEM_HEIGHT = 28;
export const SWIMLANE_ROW_GAP = 4;
export const SWIMLANE_LANE_PADDING = 8;
export const SWIMLANE_MIN_LANE_HEIGHT = 44;
export const SWIMLANE_COLLAPSED_HEIGHT = 22;
export const SWIMLANE_LABEL_WIDTH = 140;
const MIN_GAP_PX = 8;
const MIN_ITEM_WIDTH = 60;

export interface LayoutItem {
  item: TimelineItem;
  row: number;
  x: number;
  width: number;
}

export interface LaneLayout {
  key: string;
  label: string;
  yOffset: number;
  height: number;
  rowCount: number;
  items: LayoutItem[];
  collapsed: boolean;
  itemCount: number;
}

export function useSwimlaneLayout(
  lanes: LaneGroup[],
  dateToX: (date: Date) => number,
  collapsedKeys?: Set<string>,
): { lanes: LaneLayout[]; totalHeight: number } {
  return useMemo(() => {
    const result: LaneLayout[] = [];
    let yOffset = 0;

    for (const lane of lanes) {
      const items = lane.items as TimelineItem[];
      const isCollapsed = collapsedKeys?.has(lane.key) ?? false;

      if (isCollapsed) {
        result.push({
          key: lane.key,
          label: lane.label,
          yOffset,
          height: SWIMLANE_COLLAPSED_HEIGHT,
          rowCount: 0,
          items: [],
          collapsed: true,
          itemCount: items.length,
        });
        yOffset += SWIMLANE_COLLAPSED_HEIGHT;
        continue;
      }

      // Sort by start date
      const sorted = [...items].sort(
        (a, b) => a.start.getTime() - b.start.getTime(),
      );

      // Collision stacking
      const rowEnds: number[] = [];
      const layoutItems: LayoutItem[] = [];

      for (const item of sorted) {
        const x = dateToX(item.start);
        const width = item.end
          ? Math.max(MIN_ITEM_WIDTH, dateToX(item.end) - x)
          : MIN_ITEM_WIDTH;

        // Find first row where item fits
        let row = -1;
        for (let r = 0; r < rowEnds.length; r++) {
          if (rowEnds[r] + MIN_GAP_PX <= x) {
            row = r;
            break;
          }
        }
        if (row === -1) {
          row = rowEnds.length;
          rowEnds.push(0);
        }
        rowEnds[row] = x + width;

        layoutItems.push({ item, row, x, width });
      }

      const rowCount = Math.max(1, rowEnds.length);
      const contentHeight =
        rowCount * SWIMLANE_ITEM_HEIGHT +
        (rowCount - 1) * SWIMLANE_ROW_GAP;
      const height = Math.max(
        SWIMLANE_MIN_LANE_HEIGHT,
        contentHeight + 2 * SWIMLANE_LANE_PADDING,
      );

      result.push({
        key: lane.key,
        label: lane.label,
        yOffset,
        height,
        rowCount,
        items: layoutItems,
        collapsed: false,
        itemCount: items.length,
      });

      yOffset += height;
    }

    return { lanes: result, totalHeight: yOffset };
  }, [lanes, dateToX, collapsedKeys]);
}
