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
  // checkVisibility couvre display:none, visibility:hidden et opacity:0
  // (contenu des accordéons repliés : max-h-0 opacity-0 overflow-hidden).
  if (typeof el.checkVisibility === 'function') {
    if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
  }
  // Rejette aussi les éléments clippés par un ancêtre replié à hauteur nulle.
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
 * Suit la position d'une cible du tutoriel ([data-tutorial] ou nœud React Flow).
 * Polling léger (250 ms) + resize/scroll : la bulle suit les pans/zooms du canvas.
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
