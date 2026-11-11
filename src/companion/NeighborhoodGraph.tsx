/**
 * Neighbourhood of an element, sized for a phone: the element in the centre,
 * its neighbours on a ring, their own neighbours on an outer ring near them.
 * The desktop canvas positions do not fit a phone, so the layout is computed
 * here; React Flow (loaded only when a graph is shown) renders it with pinch
 * zoom and pan. Tapping a neighbour opens it, which recentres the graph.
 */

import { lazy, Suspense, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Element, Link } from '../types';
import { layoutNeighborhood } from './neighborhoodLayout';

const NeighborhoodFlow = lazy(() => import('./NeighborhoodFlow'));

export function NeighborhoodGraph({ center, elements, links, onOpen }: {
  center: Element;
  elements: Element[];
  links: Link[];
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation('companion');
  const [depth, setDepth] = useState<1 | 2>(1);
  const byId = useMemo(() => new Map(elements.map((e) => [e.id, e])), [elements]);
  const layout = useMemo(
    () => layoutNeighborhood(center.id, byId, links, depth, t('element.untitled')),
    [center.id, byId, links, depth, t],
  );
  if (layout.nodes.length <= 1) return null;

  return (
    <div className="border border-border-default rounded bg-bg-secondary overflow-hidden">
      <div className="h-72" role="img" aria-label={t('graph.label')}>
        <Suspense fallback={null}>
          <NeighborhoodFlow key={`${center.id}|${depth}`} layout={layout} onOpen={onOpen} />
        </Suspense>
      </div>
      <div className="flex items-center gap-2 px-2 py-1.5 border-t border-border-default text-xs text-text-secondary">
        <div className="inline-flex rounded border border-border-default overflow-hidden" role="group" aria-label={t('graph.depth')}>
          {([1, 2] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDepth(d)}
              aria-pressed={depth === d}
              className={`w-9 h-8 ${depth === d ? 'bg-bg-primary text-text-primary font-medium' : 'text-text-tertiary'}`}
            >
              {d}
            </button>
          ))}
        </div>
        {layout.hidden > 0 && <span className="ml-auto text-text-tertiary">{t('graph.hidden', { count: layout.hidden })}</span>}
      </div>
    </div>
  );
}
