import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Plus, Tag } from 'lucide-react';
import type { Investigation } from '../../types';

interface InvestigationTagsModalProps {
  isOpen: boolean;
  onClose: () => void;
  investigation: Investigation | null;
  allTags: string[];
  onSave: (tags: string[]) => void;
}

export function InvestigationTagsModal({
  isOpen,
  onClose,
  investigation,
  allTags,
  onSave,
}: InvestigationTagsModalProps) {
  const { t } = useTranslation('modals');
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');

  // Reset tags when modal opens with new investigation
  useEffect(() => {
    if (isOpen && investigation) {
      setTags(investigation.tags || []);
      setNewTag('');
    }
  }, [isOpen, investigation]);

  const handleAddTag = useCallback(() => {
    const trimmed = newTag.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
      setNewTag('');
    }
  }, [newTag, tags]);

  const handleRemoveTag = useCallback((tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  }, [tags]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  }, [handleAddTag]);

  const handleSave = useCallback(() => {
    onSave(tags);
    onClose();
  }, [tags, onSave, onClose]);

  const handleSelectExisting = useCallback((tag: string) => {
    if (!tags.includes(tag)) {
      setTags([...tags, tag]);
    }
  }, [tags]);

  // Suggestions: existing tags not already selected
  const suggestions = allTags.filter((t) => !tags.includes(t));

  if (!isOpen || !investigation) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[1000] bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed z-[1000] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-bg-primary rounded-lg shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
          <div className="flex items-center gap-2">
            <Tag size={16} className="text-text-secondary" />
            <h2 className="text-sm font-semibold text-text-primary">
              {t('investigationTags.title')}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-text-tertiary hover:text-text-primary rounded"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Investigation name */}
          <div className="text-xs text-text-secondary">
            {investigation.name}
          </div>

          {/* Current tags */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-2">
              {t('investigationTags.currentTags')}
            </label>
            <div className="flex flex-wrap gap-1.5 min-h-[32px] p-2 border border-border-default rounded bg-bg-secondary">
              {tags.length === 0 ? (
                <span className="text-xs text-text-tertiary">{t('investigationTags.noTags')}</span>
              ) : (
                tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-bg-primary text-text-primary rounded border border-border-default"
                  >
                    {tag}
                    <button
                      onClick={() => handleRemoveTag(tag)}
                      className="text-text-tertiary hover:text-text-primary"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))
              )}
            </div>
          </div>

          {/* Add new tag */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-2">
              {t('investigationTags.addTag')}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('investigationTags.placeholder')}
                className="flex-1 px-3 py-1.5 text-sm border border-border-default rounded bg-bg-primary text-text-primary placeholder:text-text-tertiary"
              />
              <button
                onClick={handleAddTag}
                disabled={!newTag.trim()}
                className="px-3 py-1.5 text-sm bg-accent text-white rounded hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>

          {/* Suggestions from existing tags */}
          {suggestions.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-2">
                {t('investigationTags.existingTags')}
              </label>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.slice(0, 10).map((tag) => (
                  <button
                    key={tag}
                    onClick={() => handleSelectExisting(tag)}
                    className="px-2 py-0.5 text-xs bg-bg-tertiary text-text-secondary rounded border border-border-default hover:bg-bg-secondary hover:text-text-primary transition-colors"
                  >
                    + {tag}
                  </button>
                ))}
                {suggestions.length > 10 && (
                  <span className="px-2 py-0.5 text-xs text-text-tertiary">
                    +{suggestions.length - 10} {t('investigationTags.more')}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border-default">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSave}
            className="px-3 py-1.5 text-sm bg-accent text-white rounded hover:bg-accent/90"
          >
            {t('common.save')}
          </button>
        </div>
      </div>
    </>
  );
}
