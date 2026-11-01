import { ArrowRight, ArrowLeftRight, ArrowLeft, Minus } from 'lucide-react';
import type { Element, Link } from '../../types';

function DirectionIcon({ link }: { link: Link }) {
  if (link.direction === 'both') return <ArrowLeftRight size={12} className="shrink-0 text-text-tertiary" />;
  if (link.direction === 'backward') return <ArrowLeft size={12} className="shrink-0 text-text-tertiary" />;
  if (link.direction === 'none' || link.directed === false) return <Minus size={12} className="shrink-0 text-text-tertiary" />;
  return <ArrowRight size={12} className="shrink-0 text-text-tertiary" />;
}

/** « source → label → target » of a link, on one line */
export function LinkEndsSummary({ link, from, to }: { link: Link; from: Element | undefined; to: Element | undefined }) {
  return (
    <span className="flex items-center gap-1.5 min-w-0 text-xs">
      <span className="font-medium text-text-primary truncate">{from?.label || '—'}</span>
      <DirectionIcon link={link} />
      {link.label && (
        <>
          <span className="text-text-secondary truncate">{link.label}</span>
          <DirectionIcon link={link} />
        </>
      )}
      <span className="font-medium text-text-primary truncate">{to?.label || '—'}</span>
    </span>
  );
}
