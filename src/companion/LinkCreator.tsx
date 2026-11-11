/**
 * Linking from the phone, in a few taps: from an element's page, find the
 * other end (search, or create it on the spot), pick a label (the dossier's
 * own labels are offered) and a direction.
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowLeftRight, ArrowRight, ChevronRight, Minus, Plus, Search, X } from 'lucide-react';
import type { Element, LinkDirection } from '../types';
import { createCapture, createLink, updateElementFields } from './actions';
import { useCompanionSearch } from './search';
import type { useCompanionSession } from './useCompanionSession';
import { choiceButton, inputClass, primaryButton, sectionTitle } from './ui';
import { DIRECTIONS } from './linkDirections';

type Session = ReturnType<typeof useCompanionSession>;


export function DirectionIcon({ direction, size }: { direction: LinkDirection; size: number }) {
  if (direction === 'forward') return <ArrowRight size={size} />;
  if (direction === 'backward') return <ArrowRight size={size} className="rotate-180" />;
  if (direction === 'both') return <ArrowLeftRight size={size} />;
  return <Minus size={size} />;
}

export function LinkCreator({ from, s, tabId, onClose }: {
  from: Element;
  s: Session;
  /** Shown canvas tab: an element created here goes into it */
  tabId: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation('companion');
  const [query, setQuery] = useState('');
  /** createdHere: made by this form (it then takes the source given below) */
  const [target, setTarget] = useState<{ id: string; label: string; createdHere?: boolean } | null>(null);
  const [label, setLabel] = useState('');
  const [direction, setDirection] = useState<LinkDirection>('none');
  const [source, setSource] = useState('');
  const [busy, setBusy] = useState(false);

  const hits = useCompanionSearch(s.data, query, t('element.untitled'));
  const byId = useMemo(() => new Map(s.data.elements.map((e) => [e.id, e])), [s.data.elements]);
  const candidates = useMemo(() => {
    const list = hits
      ? hits.filter((h) => !h.isLink).map((h) => byId.get(h.elementId)).filter((e): e is Element => !!e)
      : [...s.data.elements].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    return list.filter((e) => e.id !== from.id && !e.isAnnotation && !e.isGroup).slice(0, 40);
  }, [hits, byId, s.data.elements, from.id]);
  const fromLabel = from.label || t('element.untitled');

  /** The other end does not exist yet: created like a capture, then linked */
  const createTarget = async () => {
    const ydoc = s.ydoc;
    if (!ydoc || !query.trim()) return;
    setBusy(true);
    try {
      const id = await s.track(() => createCapture(ydoc, s.dossierId, {
        label: query.trim(), notes: '', files: [], geo: null, source, tabId,
      }, s.syncState.connected));
      setTarget({ id, label: query.trim(), createdHere: true });
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    const ydoc = s.ydoc;
    if (!ydoc || !target) return;
    setBusy(true);
    try {
      await s.track(() => {
        createLink(ydoc, s.dossierId, from.id, target.id, { label, direction, source }, s.syncState.connected);
        if (target.createdHere && source.trim()) {
          updateElementFields(ydoc, s.dossierId, target.id, { source: source.trim() }, s.syncState.connected);
        }
      });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-bg-primary flex flex-col" role="dialog" aria-modal="true" aria-label={t('links.title')}>
      <header className="flex items-center gap-1 px-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2 border-b border-border-default">
        <button
          type="button"
          className="w-10 h-10 flex items-center justify-center rounded text-text-secondary"
          onClick={() => (target ? setTarget(null) : onClose())}
          aria-label={target ? t('back') : t('close')}
        >
          {target ? <ArrowLeft size={20} /> : <X size={20} />}
        </button>
        <span className="flex-1 min-w-0 text-base font-semibold truncate">{t('links.title')}</span>
      </header>

      {!target ? (
        <>
          <div className="px-3 py-2 border-b border-border-default">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" />
              <input
                type="text"
                inputMode="search"
                enterKeyHint="search"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                autoFocus
                className={`${inputClass} pl-9`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('links.searchTarget', { label: fromLabel })}
                aria-label={t('links.searchTarget', { label: fromLabel })}
              />
            </div>
          </div>
          <ul className="flex-1 overflow-y-auto overscroll-contain divide-y divide-border-default">
            {query.trim() && (
              <li>
                <button
                  type="button"
                  disabled={busy}
                  className="w-full min-h-14 flex items-center gap-3 px-4 py-2 text-left text-accent active:bg-bg-secondary"
                  onClick={createTarget}
                >
                  <Plus size={18} className="flex-shrink-0" />
                  <span className="flex-1 min-w-0 text-sm truncate">{t('links.createElement', { label: query.trim() })}</span>
                </button>
              </li>
            )}
            {candidates.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  className="w-full min-h-14 flex items-center gap-3 px-4 py-2 text-left active:bg-bg-secondary"
                  onClick={() => setTarget(e)}
                >
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm truncate">{e.label || t('element.untitled')}</span>
                    {e.tags.length > 0 && <span className="block text-xs text-text-tertiary truncate">{e.tags.join(', ')}</span>}
                  </span>
                  <ChevronRight size={16} className="text-text-tertiary flex-shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-5">
          {/* The link as it will read */}
          <div className="flex items-center gap-2 text-sm">
            <span className="flex-1 min-w-0 truncate font-medium text-right">{fromLabel}</span>
            <span className="text-accent flex-shrink-0 flex justify-center w-8">
              <DirectionIcon direction={direction} size={22} />
            </span>
            <span className="flex-1 min-w-0 truncate font-medium">{target.label || t('element.untitled')}</span>
          </div>

          <section className="space-y-2">
            <h2 className={sectionTitle}>{t('links.direction')}</h2>
            <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label={t('links.direction')}>
              {DIRECTIONS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  role="radio"
                  aria-checked={direction === d.value}
                  aria-label={t(d.key)}
                  title={t(d.key)}
                  onClick={() => setDirection(d.value)}
                  className={choiceButton(direction === d.value)}
                >
                  <DirectionIcon direction={d.value} size={24} />
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <h2 className={sectionTitle}>{t('links.label')}</h2>
            <input
              className={inputClass}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              aria-label={t('links.label')}
            />
          </section>

          <section className="space-y-2">
            <h2 className={sectionTitle}>{t('links.source')}</h2>
            <input className={inputClass} value={source} onChange={(e) => setSource(e.target.value)} aria-label={t('links.source')} />
          </section>

          <button type="button" className={`${primaryButton} w-full`} onClick={submit} disabled={busy}>
            {t('links.create')}
          </button>
        </div>
      )}
    </div>
  );
}
