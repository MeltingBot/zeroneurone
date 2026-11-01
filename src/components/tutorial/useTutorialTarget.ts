import { useEffect, useState } from 'react';

export interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function isTutorialTargetVisible(el: HTMLElement): boolean {
  return isVisible(el);
}

function isVisible(el: HTMLElement): boolean {
  if (el.offsetParent === null && el.getClientRects().length === 0) return false;
  // checkVisibility covers display:none, visibility:hidden and opacity:0
  // (collapsed accordion content: max-h-0 opacity-0 overflow-hidden).
  if (typeof el.checkVisibility === 'function') {
    if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
  }
  // Also rejects elements clipped by a collapsed zero-height ancestor.
  let node: HTMLElement | null = el.parentElement;
  while (node && node !== document.body) {
    const rect = node.getBoundingClientRect();
    if (rect.height < 1 || rect.width < 1) {
      const style = window.getComputedStyle(node);
      if (style.overflow === 'hidden' || style.overflowY === 'hidden') return false;
    }
    node = node.parentElement;
  }
  return true;
}

function measure(selector: string | null): TargetRect | null {
  if (!selector) return null;
  const candidates = document.querySelectorAll<HTMLElement>(selector);
  for (const el of candidates) {
    if (!isVisible(el)) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
  }
  return null;
}

function rectsDiffer(a: TargetRect | null, b: TargetRect | null): boolean {
  if (!a || !b) return a !== b;
  return (
    Math.abs(a.top - b.top) > 0.5 ||
    Math.abs(a.left - b.left) > 0.5 ||
    Math.abs(a.width - b.width) > 0.5 ||
    Math.abs(a.height - b.height) > 0.5
  );
}

/**
  * Tracks the position of a tutorial target ([data-tutorial] or React Flow node).
  * Light polling (250 ms) + resize/scroll: the bubble follows canvas pans/zooms.
 */
export function useTutorialTarget(selector: string | null): TargetRect | null {
  const [rect, setRect] = useState<TargetRect | null>(() => measure(selector));

  useEffect(() => {
    let last = measure(selector);
    setRect(last);

    const update = () => {
      const next = measure(selector);
      if (rectsDiffer(last, next)) {
        last = next;
        setRect(next);
      }
    };

    const interval = window.setInterval(update, 250);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [selector]);

  return rect;
}
