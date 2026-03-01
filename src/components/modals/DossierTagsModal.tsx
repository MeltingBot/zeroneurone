import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Plus, Tag } from 'lucide-react';
import type { Dossier } from '../../types';

interface DossierTagsModalProps {
  isOpen: boolean;
  onClose: () => void;
  dossier: Dossier | null;
  allTags: string[];
  onSave: (tags: string[]) => void;
}

export function DossierTagsModal({
  isOpen,
  onClose,
  dossier,
  allTags,
  onSave,
}: DossierTagsModalProps) {
  const { t } = useTranslation('modals');
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');

  // Reset tags when modal opens with new dossier
  useEffect(() => {
    if (isOpen && dossier) {
      setTags(dossier.tags || []);
      setNewTag('');
    }
  }, [isOpen, dossier]);

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

  if (!isOpen || !dossier) return null;

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
              {t('dossierTags.title')}
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
          {/* Dossier name */}
          <div className="text-xs text-text-secondary">
            {dossier.name}
          </div>

          {/* Current tags */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-2">
              {t('dossierTags.currentTags')}
            </label>
            <div className="flex flex-wrap gap-1.5 min-h-[32px] p-2 border border-border-default rounded bg-bg-secondary">
              {tags.length === 0 ? (
                <span className="text-xs text-text-tertiary">{t('dossierTags.noTags')}</span>
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
              {t('dossierTags.addTag')}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('dossierTags.placeholder')}
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
                {t('dossierTags.existingTags')}
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
                    +{suggestions.length - 10} {t('dossierTags.more')}
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
