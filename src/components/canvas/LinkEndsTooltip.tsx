import { ArrowRight, ArrowLeftRight, ArrowLeft, Minus } from 'lucide-react';
import type { Element, Link } from '../../types';

interface LinkEndsTooltipProps {
  link: Link;
  from: Element | undefined;
  to: Element | undefined;
  /** Position in the canvas wrapper, in CSS pixels */
  x: number;
  y: number;
  /** Opens to the left of the point (near the right edge of the canvas) */
  toLeft?: boolean;
}

function DirectionIcon({ link }: { link: Link }) {
  if (link.direction === 'both') return <ArrowLeftRight size={12} className="shrink-0 text-text-tertiary" />;
  if (link.direction === 'backward') return <ArrowLeft size={12} className="shrink-0 text-text-tertiary" />;
  if (link.direction === 'none' || link.directed === false) return <Minus size={12} className="shrink-0 text-text-tertiary" />;
  return <ArrowRight size={12} className="shrink-0 text-text-tertiary" />;
}

/**
 * Both ends of a clicked link, shown where it was clicked when one end lies
 * outside the view: the link alone does not say what it leads to.
 */
export function LinkEndsTooltip({ link, from, to, x, y, toLeft }: LinkEndsTooltipProps) {
  return (
    <div
      role="tooltip"
      data-testid="link-ends-tooltip"
      className="absolute z-20 pointer-events-none max-w-[420px] px-2 py-1 text-xs bg-bg-primary border border-border-default rounded shadow-sm flex items-center gap-1.5"
      style={toLeft ? { right: `calc(100% - ${x - 12}px)`, top: y + 12 } : { left: x + 12, top: y + 12 }}
    >
      <span className="font-medium text-text-primary truncate">{from?.label || '—'}</span>
      <DirectionIcon link={link} />
      {link.label && (
        <>
          <span className="text-text-secondary truncate">{link.label}</span>
          <DirectionIcon link={link} />
        </>
      )}
      <span className="font-medium text-text-primary truncate">{to?.label || '—'}</span>
    </div>
  );
}
