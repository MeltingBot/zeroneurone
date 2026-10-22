import { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Check } from 'lucide-react';
import { useTagSetStore, useUIStore } from '../../stores';
import type { Property, PropertyDefinition, SuggestedProperty } from '../../types';

interface SaveToTagSetPopupProps {
  /** Tags of the element (candidates) */
  tags: string[];
  /** Properties of the element */
  properties: Property[];
  /** Known property definitions (used to carry 'choice' options) */
  definitions: PropertyDefinition[];
  onClose: () => void;
}

/**
 * Saves an element's property definitions (key, type, choices — not values)
 * as suggested properties of a tag in the global tag referential.
 */
export function SaveToTagSetPopup({ tags, properties, definitions, onClose }: SaveToTagSetPopupProps) {
  const { t } = useTranslation('panels');
  const tagSets = useTagSetStore((state) => state.tagSets);
  const getByName = useTagSetStore((state) => state.getByName);

  const [tagName, setTagName] = useState<string>(
    () => tags.find((tag) => getByName(tag)) ?? tags[0] ?? ''
  );
  const tagSet = useMemo(() => {
    void tagSets; // re-evaluate when the referential changes
    return getByName(tagName);
  }, [getByName, tagName, tagSets]);

  // Unique, non-empty property keys of the element
  const candidates = useMemo(() => {
    const seen = new Set<string>();
    const result: Property[] = [];
    for (const p of properties) {
      const key = p.key.trim();
      if (!key || seen.has(key.toLowerCase())) continue;
      seen.add(key.toLowerCase());
      result.push(p);
    }
    return result;
  }, [properties]);

  const existingKeys = useMemo(
    () => new Set((tagSet?.suggestedProperties ?? []).map((p) => p.key.toLowerCase())),
    [tagSet]
  );
  const newCandidates = useMemo(
    () => candidates.filter((p) => !existingKeys.has(p.key.trim().toLowerCase())),
    [candidates, existingKeys]
  );

  const [unselected, setUnselected] = useState<Set<string>>(new Set());
  const selected = newCandidates.filter((p) => !unselected.has(p.key));

  const handleToggle = useCallback((key: string) => {
    setUnselected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!tagName || selected.length === 0) return;

    const toAdd: SuggestedProperty[] = selected.map((p) => {
      const key = p.key.trim();
      const type = p.type || 'text';
      const def = definitions.find((d) => d.key === p.key);
      let choices: string[] | undefined;
      if (type === 'choice') {
        const set = new Set(def?.choices ?? []);
        if (typeof p.value === 'string' && p.value.trim()) set.add(p.value.trim());
        choices = [...set];
      }
      return { key, type, description: '', placeholder: '', ...(choices && { choices }) };
    });

    const { showToast } = useUIStore.getState();
    try {
      const store = useTagSetStore.getState();
      const current = store.getByName(tagName);
      if (current) {
        await store.update(current.id, {
          suggestedProperties: [...current.suggestedProperties, ...toAdd],
        });
      } else {
        await store.create({
          name: tagName,
          description: '',
          defaultVisual: { color: null, shape: null, icon: null },
          suggestedProperties: toAdd,
          isBuiltIn: false,
        });
      }
      showToast('success', t('detail.properties.savedToTag', { count: toAdd.length, name: tagName }));
      onClose();
    } catch (error) {
      console.warn('[SaveToTagSet] failed', error);
      showToast('error', t('detail.properties.saveToTagError'));
    }
  }, [tagName, selected, definitions, onClose, t]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />

      <div className="relative bg-bg-primary border border-border-default rounded shadow-lg max-w-sm w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border-default">
          <span className="text-xs font-medium text-text-primary">
            {t('detail.properties.saveToTag')}
          </span>
          <button onClick={onClose} className="p-1 hover:bg-bg-secondary rounded transition-colors">
            <X size={14} className="text-text-tertiary" />
          </button>
        </div>

        {/* Tag choice */}
        <div className="px-3 py-2 border-b border-border-default">
          <select
            value={tagName}
            onChange={(e) => {
              setTagName(e.target.value);
              setUnselected(new Set());
            }}
            className="w-full px-2 py-1 text-xs rounded border border-border-default bg-bg-primary text-text-primary focus:outline-none focus:border-accent"
          >
            {tags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}{getByName(tag) ? '' : ` (${t('detail.properties.newTag')})`}
              </option>
            ))}
          </select>
        </div>

        {/* Properties */}
        <div className="p-2 max-h-64 overflow-y-auto">
          {candidates.map((prop) => {
            const exists = existingKeys.has(prop.key.trim().toLowerCase());
            return (
              <label
                key={prop.key}
                className={`flex items-center gap-2 px-2 py-1.5 rounded ${
                  exists ? 'opacity-60' : 'hover:bg-bg-secondary cursor-pointer'
                }`}
              >
                <input
                  type="checkbox"
                  checked={exists || !unselected.has(prop.key)}
                  disabled={exists}
                  onChange={() => handleToggle(prop.key)}
                  className="w-3.5 h-3.5 rounded border-border-default accent-accent"
                />
                <span className="text-xs text-text-primary flex-1 truncate">{prop.key}</span>
                <span className="text-[10px] text-text-tertiary">
                  {exists
                    ? t('detail.properties.alreadyInTag')
                    : t(`detail.properties.types.${prop.type || 'text'}`, { defaultValue: prop.type || 'text' })}
                </span>
              </label>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-3 py-2 border-t border-border-default bg-bg-secondary">
          <button
            onClick={onClose}
            className="px-3 py-1 text-xs text-text-secondary hover:text-text-primary transition-colors"
          >
            {t('detail.properties.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={selected.length === 0}
            className="px-3 py-1 text-xs bg-accent text-white rounded hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
          >
            <Check size={12} />
            {t('detail.properties.save')}{selected.length > 0 ? ` (${selected.length})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
