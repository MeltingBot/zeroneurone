/**
 * Element dimensions — single source of truth
 *
 * Computes the rendered footprint of an element from its visual props.
 * Used both by the canvas renderer (ElementNode) and by the auto-layout
 * algorithms (graphWorker / layoutService) so that anti-collision spacing
 * matches what is actually drawn. Keeping these in sync prevents shapes from
 * overlapping after a re-layout (e.g. circles, squares and image thumbnails
 * are much larger than a label-width estimate would suggest).
 *
 * This module is intentionally dependency-free (no React, no i18n) so it can
 * be imported from a Web Worker.
 */

import type { ElementVisual } from '../types';

export interface NodeDimensions {
  width: number;
  height: number;
}

const SIZE_MAP = { small: 40, medium: 56, large: 72 } as const;

/** Resolve the numeric base size from an ElementSize value. */
export function getBaseSize(size: ElementVisual['size']): number {
  return typeof size === 'number' ? size : SIZE_MAP[size];
}

type DimensionVisual = Pick<
  ElementVisual,
  'shape' | 'size' | 'customWidth' | 'customHeight'
>;

/**
 * Compute the default rendered dimensions of an element.
 *
 * Mirrors ElementNode.getDefaultDimensions() exactly — any change here must be
 * reflected there (and vice-versa).
 *
 * @param visual   Element visual props (shape, size, custom dimensions)
 * @param label    The resolved label text (used to estimate text width)
 * @param hasImage Whether the element renders an image/thumbnail
 */
export function computeElementDimensions(
  visual: DimensionVisual,
  label: string,
  hasImage: boolean,
): NodeDimensions {
  // Explicit custom dimensions always win
  if (visual.customWidth && visual.customHeight) {
    return { width: visual.customWidth, height: visual.customHeight };
  }

  const baseSize = getBaseSize(visual.size);

  // Image thumbnails render as a square, min 96px
  if (hasImage) {
    const s = Math.max(baseSize * 1.2, 96);
    return { width: s, height: s };
  }

  // Estimate text width (average 7px per character + padding)
  const estimatedTextWidth = label.length * 7 + 24;

  switch (visual.shape) {
    case 'rectangle': {
      const width = Math.min(Math.max(estimatedTextWidth * 1.2, 120), 280);
      const height = Math.max(baseSize * 0.5, 40);
      return { width, height };
    }
    case 'square': {
      const size = Math.max(baseSize, 60);
      return { width: size, height: size };
    }
    case 'circle': {
      const size = Math.min(Math.max(estimatedTextWidth * 0.8, baseSize, 50), 150);
      return { width: size, height: size };
    }
    case 'diamond': {
      const size = Math.min(Math.max(estimatedTextWidth * 0.9, baseSize, 60), 150);
      return { width: size, height: size };
    }
    case 'hexagon': {
      const size = Math.min(Math.max(estimatedTextWidth * 0.85, baseSize, 55), 150);
      return { width: size, height: size };
    }
    default:
      return { width: baseSize, height: baseSize };
  }
}
