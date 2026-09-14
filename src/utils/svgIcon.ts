import DOMPurify from 'dompurify';

/** Maximum accepted SVG source size (raw file), in bytes */
export const MAX_SVG_ICON_SIZE = 64 * 1024;

export type SvgIconErrorCode = 'too_large' | 'invalid_svg' | 'empty_svg';

export class SvgIconError extends Error {
  readonly code: SvgIconErrorCode;

  constructor(code: SvgIconErrorCode, message: string) {
    super(message);
    this.name = 'SvgIconError';
    this.code = code;
  }
}

/** Presentation attributes carrying explicit colors, rewritten to currentColor */
const COLOR_ATTRIBUTES = ['fill', 'stroke', 'stop-color', 'flood-color', 'lighting-color'];

/**
 * Sanitize an SVG string for use as a custom icon and normalize it so the
 * icon follows the surrounding text color (currentColor), like Lucide icons.
 *
 * - DOMPurify strips scripts, event handlers and dangerous constructs
 * - foreignObject / image / external references are forbidden
 * - explicit colors are rewritten to currentColor (monochrome rendering)
 * - width/height are dropped from the root (sizing is done by the consumer)
 *
 * @throws SvgIconError when the input is too large or not a usable SVG
 */
export function sanitizeSvgIcon(rawSvg: string): string {
  if (rawSvg.length > MAX_SVG_ICON_SIZE) {
    throw new SvgIconError('too_large', 'SVG file too large');
  }

  const clean = DOMPurify.sanitize(rawSvg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ['foreignObject', 'image', 'animate', 'animateMotion', 'animateTransform', 'set', 'script', 'style'],
    FORBID_ATTR: ['href', 'xlink:href'],
  });

  const doc = new DOMParser().parseFromString(clean, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.tagName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) {
    throw new SvgIconError('invalid_svg', 'Not a valid SVG document');
  }
  if (!root.querySelector('*')) {
    throw new SvgIconError('empty_svg', 'SVG has no drawable content');
  }

  // Ensure a viewBox so the icon scales when width/height are removed
  if (!root.hasAttribute('viewBox')) {
    const width = parseFloat(root.getAttribute('width') || '');
    const height = parseFloat(root.getAttribute('height') || '');
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      root.setAttribute('viewBox', `0 0 ${width} ${height}`);
    } else {
      root.setAttribute('viewBox', '0 0 24 24');
    }
  }
  root.removeAttribute('width');
  root.removeAttribute('height');

  // Rewrite explicit colors to currentColor on every node (keep 'none')
  const allNodes = [root, ...Array.from(root.querySelectorAll('*'))];
  for (const node of allNodes) {
    for (const attr of COLOR_ATTRIBUTES) {
      const value = node.getAttribute(attr);
      if (value && value.trim().toLowerCase() !== 'none') {
        node.setAttribute(attr, 'currentColor');
      }
    }
    // Inline style colors (DOMPurify keeps style attributes)
    const style = node.getAttribute('style');
    if (style) {
      const rewritten = style.replace(
        /(fill|stroke|stop-color|flood-color|lighting-color)\s*:\s*(?!none\b)[^;]+/gi,
        '$1:currentColor',
      );
      node.setAttribute('style', rewritten);
    }
  }

  // Default fill so unfilled SVGs (e.g. Simple Icons) render with the text color
  if (!root.hasAttribute('fill')) {
    root.setAttribute('fill', 'currentColor');
  }

  return new XMLSerializer().serializeToString(root);
}

/** Derive a display name from an SVG filename ("github.svg" → "github") */
export function iconNameFromFilename(filename: string): string {
  return filename.replace(/\.svg$/i, '').trim() || 'icon';
}
