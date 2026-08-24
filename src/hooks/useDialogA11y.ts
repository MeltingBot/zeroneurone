import { useEffect, useRef, type RefObject } from 'react';

/**
 * Dialog keyboard and focus behaviour, extracted from the shared Modal so the
 * modals that cannot adopt its chrome still get the same guarantees:
 *
 * - Escape closes
 * - Tab cycles inside the dialog instead of escaping to the page behind
 * - the page behind does not scroll
 * - focus moves into the dialog on open and returns where it was on close
 *
 * Pair it with `role="dialog"`, `aria-modal="true"` and an `aria-labelledby`
 * pointing at the dialog title.
 */

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  // Deliberately no visibility filter: `offsetParent` is null for anything
  // inside a `position: fixed` subtree, which is exactly what a dialog is, so
  // filtering on it would empty the trap and let Tab escape the dialog.
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

interface Options {
  /** Skip moving focus on open — for dialogs that focus a specific field themselves. */
  autoFocus?: boolean;
}

export function useDialogA11y(
  isOpen: boolean,
  containerRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  { autoFocus = true }: Options = {}
): void {
  // Held in a ref so a parent re-render creating a new callback does not
  // re-run the effect and steal focus back to the top of the dialog.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab' || !containerRef.current) return;

      const focusable = getFocusableElements(containerRef.current);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Deferred: the dialog's children may not be laid out on this tick.
    const focusTimer = setTimeout(() => {
      if (!autoFocus || !containerRef.current) return;
      if (containerRef.current.contains(document.activeElement)) return;
      getFocusableElements(containerRef.current)[0]?.focus();
    }, 0);

    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [isOpen, containerRef, autoFocus]);
}
