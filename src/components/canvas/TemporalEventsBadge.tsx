import { useRef, type CSSProperties } from 'react';
import { TemporalEventsPopover } from '../common/TemporalEventsPopover';
import { useHoverPopover } from '../../hooks/useHoverPopover';
import { useFocusElementEvent } from '../../hooks/useFocusElementEvent';
import type { TemporalEventSummary } from '../../utils/temporalUtils';

interface TemporalEventsBadgeProps {
  elementId: string;
  summary: TemporalEventSummary;
  style: CSSProperties;
}

/**
 * Badge under a node: most recent event + count. With several events, hover
 * (or click) opens the dated list; with a single one the list would only repeat
 * the badge, so a click opens the event in the side panel directly.
 */
export function TemporalEventsBadge({ elementId, summary, style }: TemporalEventsBadgeProps) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const popover = useHoverPopover();
  const focusElementEvent = useFocusElementEvent();
  const hasList = summary.moreCount > 0;

  return (
    <>
      <div
        ref={anchorRef}
        className="nodrag nopan absolute left-1/2 -translate-x-1/2 max-w-[240px] flex items-center gap-1 px-1.5 py-0.5 bg-bg-primary border border-accent rounded shadow-sm z-10 text-[11px] text-text-primary whitespace-nowrap cursor-pointer"
        style={style}
        onMouseEnter={hasList ? popover.open : undefined}
        onMouseLeave={hasList ? popover.scheduleClose : undefined}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          if (!hasList) focusElementEvent(elementId, summary.events[0].id);
          else if (popover.isOpen) popover.close();
          else popover.open();
        }}
      >
        <span className="truncate">{summary.label}</span>
        {summary.moreCount > 0 && (
          <span className="shrink-0 text-text-tertiary">+{summary.moreCount}</span>
        )}
      </div>
      <TemporalEventsPopover
        anchorRef={anchorRef}
        isOpen={hasList && popover.isOpen}
        elementId={elementId}
        events={summary.events}
        onClose={popover.close}
        onPointerEnter={popover.cancelClose}
        onPointerLeave={popover.scheduleClose}
      />
    </>
  );
}
