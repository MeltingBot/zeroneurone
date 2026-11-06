import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TriangleAlert } from 'lucide-react';
import { Modal, Button } from '../common';
import { useDossierStore } from '../../stores';
import type { MergeKeep } from '../../stores/dossierStore';
import { mergePreview, mergeChoices, keptValues, type MergeChoice } from '../../utils/mergePreview';
import { formatPropertyValue } from '../../utils/dates';
import type { Element } from '../../types';

interface MergeElementsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Two elements or more: one is kept, the others are merged into it */
  elements: Element[];
  /** `keep`: the tags and properties chosen, absent when all are kept */
  onMerge: (targetId: string, sourceIds: string[], keep?: MergeKeep) => Promise<void>;
}

export function MergeElementsModal({
  isOpen,
  onClose,
  elements,
  onMerge,
}: MergeElementsModalProps) {
  const { t, i18n } = useTranslation(['modals', 'common']);
  const links = useDossierStore((s) => s.links);
  const [isLoading, setIsLoading] = useState(false);

  // Links per element: the most linked one is kept by default
  const linkCount = useMemo(() => {
    const ids = new Set(elements.map((el) => el.id));
    const counts = new Map<string, number>();
    for (const l of links) {
      if (ids.has(l.fromId)) counts.set(l.fromId, (counts.get(l.fromId) ?? 0) + 1);
      if (ids.has(l.toId)) counts.set(l.toId, (counts.get(l.toId) ?? 0) + 1);
    }
    return counts;
  }, [elements, links]);
  const [targetId, setTargetId] = useState(() => (
    elements.length === 2
      ? elements[0].id
      : [...elements].sort((a, b) => (linkCount.get(b.id) ?? 0) - (linkCount.get(a.id) ?? 0))[0].id
  ));

  const target = elements.find((el) => el.id === targetId) ?? elements[0];
  const sources = useMemo(() => elements.filter((el) => el.id !== target.id), [elements, target]);
  const preview = useMemo(() => mergePreview(target, sources), [target, sources]);

  // Tags and property values to keep: all of them at first
  const choices = useMemo(() => mergeChoices(target, sources), [target, sources]);
  const [kept, setKept] = useState<Set<string>>(() => new Set(mergeChoices(elements[0], elements.slice(1)).all.map((c) => c.id)));
  const allKept = choices.all.every((c) => kept.has(c.id));
  const result = useMemo(() => keptValues(choices, kept), [choices, kept]);
  const hasChoices = choices.all.length > 0;

  const toggle = (ids: string[], on: boolean) => setKept((prev) => {
    const next = new Set(prev);
    for (const id of ids) if (on) next.add(id); else next.delete(id);
    return next;
  });

  const handleMerge = async () => {
    setIsLoading(true);
    try {
      await onMerge(target.id, sources.map((el) => el.id), allKept ? undefined : result);
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  const swatch = (el: Element) => (
    <div
      className="w-3 h-3 border shrink-0"
      style={{
        backgroundColor: el.visual.color,
        borderColor: el.visual.borderColor,
        borderRadius: el.visual.shape === 'circle' ? '50%' : el.visual.shape === 'diamond' ? '2px' : '0',
      }}
    />
  );

  const renderElementSummary = (el: Element, isTarget: boolean) => (
    <button
      type="button"
      key={el.id}
      onClick={() => setTargetId(el.id)}
      className={`flex-1 p-3 border text-left transition-colors ${
        isTarget
          ? 'border-accent bg-accent/5'
          : 'border-border-default hover:border-text-tertiary'
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        {swatch(el)}
        <span className="text-sm font-medium text-text-primary truncate">
          {el.label || t('common:empty.unnamed')}
        </span>
      </div>
      <div className="text-xs text-text-tertiary space-y-0.5">
        {el.tags.length > 0 && <div>{el.tags.length} tag{el.tags.length > 1 ? 's' : ''}</div>}
        {el.properties.length > 0 && <div>{el.properties.length} {t('modals:merge.properties')}</div>}
        {el.events.length > 0 && <div>{el.events.length} {t('modals:merge.events')}</div>}
      </div>
      {isTarget && (
        <div className="mt-2 text-xs font-medium text-accent">
          {t('modals:merge.kept')}
        </div>
      )}
    </button>
  );

  // Keys that keep several values once the choice is made
  const multiValueKeys = useMemo(() => {
    const perKey = new Map<string, number>();
    for (const p of result.properties) perKey.set(p.key, (perKey.get(p.key) ?? 0) + 1);
    return [...perKey.values()].filter((n) => n > 1).length;
  }, [result]);

  const warnings = [
    preview.notesCount > 1 && t('modals:merge.warnNotes', { count: preview.notesCount }),
    multiValueKeys > 0 && t('modals:merge.warnPropertiesMulti', { count: result.properties.length, keys: multiValueKeys }),
  ].filter((w): w is string => typeof w === 'string');

  const valueText = (c: MergeChoice) => (c.tag !== undefined
    ? c.tag
    : formatPropertyValue(c.property!.value, c.property!.type, i18n.language, c.property!.timeZone));

  const box = (c: MergeChoice, label: string) => (
    <label key={c.id} className="flex items-start gap-1.5 min-w-0 cursor-pointer">
      <input
        type="checkbox"
        checked={kept.has(c.id)}
        onChange={(e) => toggle([c.id], e.target.checked)}
        aria-label={label}
        className="mt-0.5 rounded border-border-default shrink-0"
      />
      <span className={`text-xs truncate ${kept.has(c.id) ? 'text-text-primary' : 'text-text-tertiary line-through'}`} title={valueText(c)}>
        {valueText(c)}
      </span>
    </label>
  );

  const gridStyle = { gridTemplateColumns: `110px repeat(${choices.columns.length}, minmax(160px, 1fr))` };
  const cell = 'px-2 py-1.5 border-b border-border-default';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={elements.length > 2 ? t('modals:merge.titleMany', { count: elements.length }) : t('modals:merge.title')}
      width={hasChoices ? 'lg' : 'md'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common:actions.cancel')}
          </Button>
          <Button variant="primary" onClick={handleMerge} disabled={isLoading} data-testid="merge-confirm">
            {isLoading ? t('modals:merge.merging') : t('modals:merge.confirm')}
          </Button>
        </>
      }
    >
      <p className="text-sm text-text-secondary mb-3">
        {t('modals:merge.description')}
      </p>
      {elements.length === 2 ? (
        <div className="flex gap-2">
          {elements.map((el) => renderElementSummary(el, el.id === target.id))}
        </div>
      ) : (
        <div className="max-h-48 overflow-y-auto border border-border-default rounded divide-y divide-border-default" role="radiogroup">
          {elements.map((el) => (
            <label key={el.id} className={`flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer ${el.id === target.id ? 'bg-accent/5' : 'hover:bg-bg-secondary'}`}>
              <input
                type="radio"
                name="merge-target"
                checked={el.id === target.id}
                onChange={() => setTargetId(el.id)}
                className="border-border-default"
              />
              {swatch(el)}
              <span className="flex-1 truncate text-text-primary">{el.label || t('common:empty.unnamed')}</span>
              <span className="text-xs text-text-tertiary shrink-0">
                {t('modals:merge.linkCount', { count: linkCount.get(el.id) ?? 0 })}
              </span>
              {el.id === target.id && <span className="text-xs font-medium text-accent shrink-0">{t('modals:merge.kept')}</span>}
            </label>
          ))}
        </div>
      )}

      {/* What the kept element ends with: each tag and property value, per element */}
      {hasChoices && (
        <div className="mt-4">
          <div className="text-xs text-text-secondary font-medium uppercase tracking-wider mb-1.5">{t('modals:merge.keepTitle')}</div>
          <div className="max-h-72 overflow-auto border border-border-default rounded" data-testid="merge-keep">
            <div className="grid" style={gridStyle}>
              <div className={`${cell} bg-bg-secondary sticky top-0`} />
              {choices.columns.map(({ element, tags, properties }) => {
                const ids = [...tags, ...[...properties.values()].flat()].map((c) => c.id);
                const on = ids.length > 0 && ids.every((id) => kept.has(id));
                const some = ids.some((id) => kept.has(id));
                return (
                  <label key={element.id} className={`${cell} bg-bg-secondary sticky top-0 flex items-center gap-1.5 min-w-0 cursor-pointer`}>
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={ids.length === 0}
                      ref={(input) => { if (input) input.indeterminate = some && !on; }}
                      onChange={(e) => toggle(ids, e.target.checked)}
                      aria-label={t('modals:merge.keepAllOf', { name: element.label || t('common:empty.unnamed') })}
                      className="rounded border-border-default shrink-0"
                    />
                    {swatch(element)}
                    <span className="text-xs font-medium text-text-primary truncate">{element.label || t('common:empty.unnamed')}</span>
                    {element.id === target.id && <span className="text-[10px] text-accent shrink-0">{t('modals:merge.kept')}</span>}
                  </label>
                );
              })}

              {choices.columns.some((col) => col.tags.length > 0) && (
                <>
                  <div className={`${cell} text-xs text-text-secondary`}>{t('modals:merge.tags')}</div>
                  {choices.columns.map(({ element, tags }) => (
                    <div key={element.id} className={`${cell} space-y-1 min-w-0`}>
                      {tags.map((c) => box(c, c.tag!))}
                    </div>
                  ))}
                </>
              )}

              {choices.keys.map((key) => (
                <div key={key} className="contents">
                  <div className={`${cell} flex items-start gap-1 min-w-0`}>
                    <span className="text-xs text-text-secondary truncate" title={key}>{key}</span>
                    {choices.conflicts.has(key) && (
                      <span title={t('modals:merge.conflict')} className="shrink-0">
                        <TriangleAlert size={12} className="mt-0.5 text-warning" aria-label={t('modals:merge.conflict')} />
                      </span>
                    )}
                  </div>
                  {choices.columns.map(({ element, properties }) => (
                    <div key={element.id} className={`${cell} space-y-1 min-w-0`}>
                      {(properties.get(key) ?? []).map((c) => box(c, `${key} : ${valueText(c)}`))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="mt-3 space-y-1" data-testid="merge-warnings">
          {warnings.map((w) => (
            <p key={w} className="flex items-start gap-1.5 text-xs text-warning">
              <TriangleAlert size={12} className="mt-0.5 shrink-0" />
              {w}
            </p>
          ))}
        </div>
      )}
      <p className="text-xs text-text-tertiary mt-3">
        {elements.length > 2 ? t('modals:merge.hintMany', { count: sources.length }) : t('modals:merge.hint')}
      </p>
    </Modal>
  );
}
