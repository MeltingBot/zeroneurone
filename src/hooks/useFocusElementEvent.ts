import { useCallback } from 'react';
import { useSelectionStore } from '../stores';

/** Select an element and open one of its events in the side panel. */
export function useFocusElementEvent() {
  const selectElement = useSelectionStore((s) => s.selectElement);
  const setFocusedEventId = useSelectionStore((s) => s.setFocusedEventId);

  return useCallback((elementId: string, eventId: string) => {
    selectElement(elementId);
    // Reset first so focusing the event already focused scrolls to it again
    setFocusedEventId(null);
    queueMicrotask(() => setFocusedEventId(eventId));
  }, [selectElement, setFocusedEventId]);
}
