import { useCallback, useEffect, useRef, useState } from 'react';

// Delay before closing, so the pointer can travel from the anchor to the popover
const CLOSE_DELAY_MS = 150;

/** Open on hover, close shortly after the pointer leaves both anchor and popover. */
export function useHoverPopover() {
  const closeTimerRef = useRef<number | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);
  const open = useCallback(() => { cancelClose(); setIsOpen(true); }, [cancelClose]);
  const close = useCallback(() => { cancelClose(); setIsOpen(false); }, [cancelClose]);
  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimerRef.current = window.setTimeout(() => setIsOpen(false), CLOSE_DELAY_MS);
  }, [cancelClose]);

  useEffect(() => cancelClose, [cancelClose]);

  return { isOpen, open, close, scheduleClose, cancelClose };
}
