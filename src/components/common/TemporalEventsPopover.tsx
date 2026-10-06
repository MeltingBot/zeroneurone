import type { RefObject } from 'react';
import { DropdownPortal } from './DropdownPortal';
import { useFocusElementEvent } from '../../hooks/useFocusElementEvent';
import type { TemporalEventSummary } from '../../utils/temporalUtils';

interface TemporalEventsPopoverProps {
  anchorRef: RefObject<HTMLElement | null>;
  isOpen: boolean;
  elementId: string;
  events: TemporalEventSummary['events'];
  onClose: () => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}

/**
 * Dated list of an element's events at the instant/period (canvas and map).
 * Clicking an event selects the element and opens that event in the side panel.
 */
export function TemporalEventsPopover({
  anchorRef,
  isOpen,
  elementId,
  events,
  onClose,
  onPointerEnter,
  onPointerLeave,
}: TemporalEventsPopoverProps) {
  const focusElementEvent = useFocusElementEvent();

  const focusEvent = (eventId: string) => {
    focusElementEvent(elementId, eventId);
    onClose();
  };

  return (
    <DropdownPortal anchorRef={anchorRef} isOpen={isOpen} onClose={onClose} className="py-1 max-h-64 overflow-y-auto">
      <div onMouseEnter={onPointerEnter} onMouseLeave={onPointerLeave}>
        {events.map((ev) => (
          <button
            key={ev.id}
            onClick={() => focusEvent(ev.id)}
            className="w-full flex items-baseline gap-2 px-2 py-1 text-left text-xs hover:bg-bg-secondary"
          >
            <span className="shrink-0 text-text-tertiary">{ev.dateLabel}</span>
            <span className="text-text-primary truncate max-w-[220px]">{ev.label}</span>
          </button>
        ))}
      </div>
    </DropdownPortal>
  );
}
