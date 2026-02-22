import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Button } from '../common';
import type { Element } from '../../types';

interface MergeElementsModalProps {
  isOpen: boolean;
  onClose: () => void;
  element1: Element;
  element2: Element;
  onMerge: (targetId: string, sourceId: string) => Promise<void>;
}

export function MergeElementsModal({
  isOpen,
  onClose,
  element1,
  element2,
  onMerge,
}: MergeElementsModalProps) {
  const { t } = useTranslation(['modals', 'common']);
  const [targetId, setTargetId] = useState(element1.id);
  const [isLoading, setIsLoading] = useState(false);

  const sourceId = targetId === element1.id ? element2.id : element1.id;

  const handleMerge = async () => {
    setIsLoading(true);
    try {
      await onMerge(targetId, sourceId);
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  const renderElementSummary = (el: Element, isTarget: boolean) => (
    <button
      type="button"
      onClick={() => setTargetId(el.id)}
      className={`flex-1 p-3 border text-left transition-colors ${
        isTarget
          ? 'border-accent bg-accent/5'
          : 'border-border-default hover:border-text-tertiary'
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <div
          className="w-3 h-3 border"
          style={{
            backgroundColor: el.visual.color,
            borderColor: el.visual.borderColor,
            borderRadius: el.visual.shape === 'circle' ? '50%' : el.visual.shape === 'diamond' ? '2px' : '0',
          }}
        />
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('modals:merge.title')}
      width="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common:actions.cancel')}
          </Button>
          <Button variant="primary" onClick={handleMerge} disabled={isLoading}>
            {isLoading ? t('modals:merge.merging') : t('modals:merge.confirm')}
          </Button>
        </>
      }
    >
      <p className="text-sm text-text-secondary mb-3">
        {t('modals:merge.description')}
      </p>
      <div className="flex gap-2">
        {renderElementSummary(element1, targetId === element1.id)}
        {renderElementSummary(element2, targetId === element2.id)}
      </div>
      <p className="text-xs text-text-tertiary mt-3">
        {t('modals:merge.hint')}
      </p>
    </Modal>
  );
}
