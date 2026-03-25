import { useMemo } from 'react';
import type { LaneGroup } from './useSwimlaneGrouping';
import type { TimelineItem } from './TimelineView';

export const SWIMLANE_ITEM_HEIGHT = 28;
export const SWIMLANE_LINK_HEIGHT_COMPACT = 8;
export const SWIMLANE_LINK_WIDTH_THRESHOLD = 150; // px: above this, links get full height with label
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
  rowY: number; // pre-computed Y offset within the lane content area
  x: number;
  width: number;
  itemHeight: number; // SWIMLANE_ITEM_HEIGHT for elements, SWIMLANE_LINK_HEIGHT for links
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
  containerWidth?: number,
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

      // Track the max height in each row for mixed element/link rows
      const rowMaxHeights: number[] = [];

      // Clip bounds for collision stacking: items extending far beyond the viewport
      // don't need to block entire rows. We use a generous buffer around the viewport.
      const clipLeft = containerWidth != null ? -containerWidth : -Infinity;
      const clipRight = containerWidth != null ? containerWidth * 2 : Infinity;

      for (const item of sorted) {
        const x = dateToX(item.start);
        const isLink = item.type === 'link';
        const width = item.end
          ? Math.max(MIN_ITEM_WIDTH, dateToX(item.end) - x)
          : MIN_ITEM_WIDTH;
        // Clipped x/width for collision stacking (items far offscreen don't hog rows)
        const cx = Math.max(clipLeft, x);
        const cw = Math.min(clipRight, x + width) - cx;

        // Links: compact (8px) when narrow, full height when wide enough for a label
        const h = isLink
          ? (cw >= SWIMLANE_LINK_WIDTH_THRESHOLD ? SWIMLANE_ITEM_HEIGHT : SWIMLANE_LINK_HEIGHT_COMPACT)
          : SWIMLANE_ITEM_HEIGHT;

        if (cw <= 0) {
          // Item entirely outside clip range — still include it but don't stack
          layoutItems.push({ item, row: 0, rowY: 0, x, width, itemHeight: h });
          continue;
        }

        // Find first row where item fits (using clipped bounds)
        let row = -1;
        for (let r = 0; r < rowEnds.length; r++) {
          if (rowEnds[r] + MIN_GAP_PX <= cx) {
            row = r;
            break;
          }
        }
        if (row === -1) {
          row = rowEnds.length;
          rowEnds.push(0);
          rowMaxHeights.push(0);
        }
        rowEnds[row] = cx + cw;
        rowMaxHeights[row] = Math.max(rowMaxHeights[row], h);

        layoutItems.push({ item, row, rowY: 0, x, width, itemHeight: h });
      }

      const rowCount = Math.max(1, rowEnds.length);
      // Compute per-row y offsets using actual row heights
      let contentHeight = 0;
      const rowYOffsets: number[] = [];
      for (let r = 0; r < rowCount; r++) {
        rowYOffsets.push(contentHeight);
        const rh = rowMaxHeights[r] || SWIMLANE_ITEM_HEIGHT;
        contentHeight += rh + (r < rowCount - 1 ? SWIMLANE_ROW_GAP : 0);
      }
      // Assign computed rowY to layout items
      for (const li of layoutItems) {
        li.rowY = rowYOffsets[li.row];
      }
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
  }, [lanes, dateToX, collapsedKeys, containerWidth]);
}
