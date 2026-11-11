/**
 * Long lists shown in batches: the first rows at once, the next batch as the
 * end comes near while scrolling. A dossier of thousands of elements rendered
 * whole took seconds on a phone at each tab change (e2e/companion-scale.bench).
 */

import { useCallback, useEffect, useState } from 'react';

export const REVEAL_STEP = 100;

/**
 * Rows shown per list, kept while it is away: back from an element's page,
 * the list comes back as long as it was, so its scroll position is there.
 */
const remembered = new Map<string, number>();

/**
 * How many rows to show, and the sentinel to put after them: when it nears
 * the visible area of the scrolling <main>, the next batch follows. `resetKey` names
 * the list (search, order, filter): another one starts at its own length.
 */
export function useRevealed(total: number, resetKey: string) {
  const [state, setState] = useState(() => ({ key: resetKey, count: remembered.get(resetKey) ?? REVEAL_STEP }));
  // Another list: its own length, or the first batch (adjusted during render, no effect)
  const count = state.key === resetKey ? state.count : remembered.get(resetKey) ?? REVEAL_STEP;
  if (state.key !== resetKey) setState({ key: resetKey, count });
  useEffect(() => { remembered.set(state.key, state.count); }, [state]);

  // A callback ref with its cleanup (React 19): the observer lives with the sentinel
  const sentinel = useCallback((node: HTMLElement | null) => {
    if (!node) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setState((s) => ({ ...s, count: s.count + REVEAL_STEP }));
      }
    }, { root: node.closest('main'), rootMargin: '800px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  /** Shows at least the rows up to `index` (a jump further down) */
  const reveal = useCallback((index: number) => {
    setState((s) => (index < s.count ? s : { ...s, count: (Math.floor(index / REVEAL_STEP) + 2) * REVEAL_STEP }));
  }, []);

  return { count: Math.min(count, total), more: count < total, sentinel, reveal };
}
