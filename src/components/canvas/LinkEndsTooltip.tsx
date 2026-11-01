import type { Element, Link } from '../../types';
import { LinkEndsSummary } from './LinkEndsSummary';

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

/**
 * Both ends of a clicked link, shown where it was clicked when one end lies
 * outside the view: the link alone does not say what it leads to.
 */
export function LinkEndsTooltip({ link, from, to, x, y, toLeft }: LinkEndsTooltipProps) {
  return (
    <div
      role="tooltip"
      data-testid="link-ends-tooltip"
      className="absolute z-20 pointer-events-none max-w-[420px] px-2 py-1 bg-bg-primary border border-border-default rounded shadow-sm"
      style={toLeft ? { right: `calc(100% - ${x - 12}px)`, top: y + 12 } : { left: x + 12, top: y + 12 }}
    >
      <LinkEndsSummary link={link} from={from} to={to} />
    </div>
  );
}
