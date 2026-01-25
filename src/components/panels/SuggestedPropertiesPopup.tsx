import { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Check } from 'lucide-react';
import { useTagSetStore } from '../../stores';
import type { Property, SuggestedProperty } from '../../types';

interface SuggestedPropertiesPopupProps {
  tagSetName: string;
  existingPropertyKeys: string[];
  onApply: (properties: Property[]) => void;
  onClose: () => void;
}

export function SuggestedPropertiesPopup({
  tagSetName,
  existingPropertyKeys,
  onApply,
  onClose,
}: SuggestedPropertiesPopupProps) {
  const { t } = useTranslation('panels');
  const tagSet = useTagSetStore((state) => state.getByName(tagSetName));

  // Filter out properties that already exist on the element
  const availableProperties = useMemo(() => {
    if (!tagSet) return [];
    const existingKeys = new Set(existingPropertyKeys.map((k) => k.toLowerCase()));
    return tagSet.suggestedProperties.filter(
      (p) => !existingKeys.has(p.key.toLowerCase())
    );
  }, [tagSet, existingPropertyKeys]);

  // Track which properties are selected (all by default)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(
    () => new Set(availableProperties.map((p) => p.key))
  );

  const handleToggle = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const handleToggleAll = useCallback(() => {
    if (selectedKeys.size === availableProperties.length) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(availableProperties.map((p) => p.key)));
    }
  }, [selectedKeys.size, availableProperties]);

  const handleApply = useCallback(() => {
    if (!tagSet) return;

    const propertiesToAdd: Property[] = tagSet.suggestedProperties
      .filter((p) => selectedKeys.has(p.key))
      .map((p) => ({
        key: p.key,
        value: null,
        type: p.type,
      }));

    onApply(propertiesToAdd);
    onClose();
  }, [tagSet, selectedKeys, onApply, onClose]);

  // Don't show if no TagSet found or no available properties
  if (!tagSet || availableProperties.length === 0) {
    return null;
  }

  const allSelected = selectedKeys.size === availableProperties.length;
  const noneSelected = selectedKeys.size === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />

      {/* Popup */}
      <div className="relative bg-bg-primary border border-border-default rounded shadow-lg max-w-sm w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border-default">
          <span className="text-xs font-medium text-text-primary">
            {t('detail.properties.suggestedFor', { name: tagSetName })}
          </span>
          <button
            onClick={onClose}
            className="p-1 hover:bg-bg-secondary rounded transition-colors"
          >
            <X size={14} className="text-text-tertiary" />
          </button>
        </div>

        {/* Properties list */}
        <div className="p-2 max-h-64 overflow-y-auto">
          {availableProperties.map((prop) => (
            <label
              key={prop.key}
              className="flex items-center gap-2 px-2 py-1.5 hover:bg-bg-secondary rounded cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selectedKeys.has(prop.key)}
                onChange={() => handleToggle(prop.key)}
                className="w-3.5 h-3.5 rounded border-border-default accent-accent"
              />
              <span className="text-xs text-text-primary flex-1">{prop.key}</span>
              <span className="text-[10px] text-text-tertiary">{t(`detail.properties.types.${prop.type}`, { defaultValue: prop.type })}</span>
            </label>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-3 py-2 border-t border-border-default bg-bg-secondary">
          <button
            onClick={handleToggleAll}
            className="text-xs text-text-secondary hover:text-text-primary transition-colors"
          >
            {allSelected ? t('detail.properties.deselectAll') : t('detail.properties.selectAll')}
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1 text-xs text-text-secondary hover:text-text-primary transition-colors"
            >
              {t('detail.properties.ignore')}
            </button>
            <button
              onClick={handleApply}
              disabled={noneSelected}
              className="px-3 py-1 text-xs bg-accent text-white rounded hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
            >
              <Check size={12} />
              {t('detail.properties.add')} ({selectedKeys.size})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
