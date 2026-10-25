import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TriangleAlert } from 'lucide-react';
import { Modal, Button } from '../common';
import { useDossierStore } from '../../stores';
import { mergePreview } from '../../utils/mergePreview';
import type { Element } from '../../types';

interface MergeElementsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Two elements or more: one is kept, the others are merged into it */
  elements: Element[];
  onMerge: (targetId: string, sourceIds: string[]) => Promise<void>;
}

export function MergeElementsModal({
  isOpen,
  onClose,
  elements,
  onMerge,
}: MergeElementsModalProps) {
  const { t } = useTranslation(['modals', 'common']);
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

  const handleMerge = async () => {
    setIsLoading(true);
    try {
      await onMerge(target.id, sources.map((el) => el.id));
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

  const warnings = [
    preview.notesCount > 1 && t('modals:merge.warnNotes', { count: preview.notesCount }),
    preview.multiValueKeys > 0
      ? t('modals:merge.warnPropertiesMulti', { count: preview.propertyCount, keys: preview.multiValueKeys })
      : preview.propertyCount > target.properties.length && t('modals:merge.warnProperties', { count: preview.propertyCount }),
  ].filter((w): w is string => typeof w === 'string');

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={elements.length > 2 ? t('modals:merge.titleMany', { count: elements.length }) : t('modals:merge.title')}
      width="md"
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
        <div className="max-h-64 overflow-y-auto border border-border-default rounded divide-y divide-border-default" role="radiogroup">
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
