import { useMemo } from 'react';
import type { ElementType } from 'react';
import DOMPurify from 'dompurify';

// A few translations carry inline emphasis markup. Only formatting is allowed:
// no links, no images, no attributes beyond styling classes.
const INLINE_CONFIG = {
  ALLOWED_TAGS: ['strong', 'b', 'em', 'i', 'u', 'code', 'br', 'span'],
  ALLOWED_ATTR: ['class'],
  ALLOW_DATA_ATTR: false,
};

interface SafeHtmlProps {
  html: string;
  as?: ElementType;
  className?: string;
}

/**
 * Render a small HTML fragment after sanitisation.
 *
 * Used for i18n strings that contain inline markup. Translation files are
 * bundled, but a future string carrying an interpolated value would otherwise
 * become an injection point.
 */
export function SafeHtml({ html, as: Tag = 'span', className }: SafeHtmlProps) {
  const clean = useMemo(() => DOMPurify.sanitize(html, INLINE_CONFIG) as string, [html]);
  return <Tag className={className} dangerouslySetInnerHTML={{ __html: clean }} />;
}
