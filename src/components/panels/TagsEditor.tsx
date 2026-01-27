import { useState, useCallback, useRef, useEffect, useMemo, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Plus, Sparkles } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { DropdownPortal, IconPickerCompact } from '../common';
import { useTagSetStore } from '../../stores';

interface TagsEditorProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  /** Suggested tags from the investigation (existing tags used elsewhere) */
  suggestions?: string[];
  /** Callback when a new tag is created (to add to investigation settings) */
  onNewTag?: (tag: string) => void;
  /** Callback when a tag from a TagSet is added (to show suggested properties popup) */
  onTagSetTagAdded?: (tagSetName: string) => void;
}

export function TagsEditor({ tags, onChange, suggestions = [], onNewTag, onTagSetTagAdded }: TagsEditorProps) {
  const { t } = useTranslation('panels');
  const [inputValue, setInputValue] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const [newTagIcon, setNewTagIcon] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // State for editing existing tag icons
  const [editingTagIcon, setEditingTagIcon] = useState<string | null>(null);

  // Get TagSet store
  const tagSetsMap = useTagSetStore((state) => state.tagSets);
  const createTagSet = useTagSetStore((state) => state.create);
  const updateTagSet = useTagSetStore((state) => state.update);

  const tagSetNames = useMemo(() => {
    return new Set(Array.from(tagSetsMap.values()).map((ts) => ts.name));
  }, [tagSetsMap]);

  // Map tag names to their icons and IDs (from TagSets)
  const tagSetData = useMemo(() => {
    const data = new Map<string, { icon: string | null; id: string; tagSet: typeof tagSetsMap extends Map<string, infer T> ? T : never }>();
    for (const ts of tagSetsMap.values()) {
      data.set(ts.name, { icon: ts.defaultVisual.icon, id: ts.id, tagSet: ts });
    }
    return data;
  }, [tagSetsMap]);

  // For backward compatibility
  const tagIcons = useMemo(() => {
    const icons = new Map<string, string | null>();
    for (const [name, data] of tagSetData) {
      if (data.icon) {
        icons.set(name, data.icon);
      }
    }
    return icons;
  }, [tagSetData]);

  // Get icon component by name
  const getIconComponent = useCallback((name: string) => {
    return (LucideIcons as unknown as Record<string, React.ComponentType<{ size?: number; className?: string }>>)[name];
  }, []);

  // Merge TagSet names with investigation suggestions (unique, sorted)
  const allSuggestions = useMemo(() => {
    const tagSetNamesList = Array.from(tagSetsMap.values()).map((ts) => ts.name);
    const merged = new Set([...tagSetNamesList, ...suggestions]);
    return Array.from(merged).sort((a, b) => a.localeCompare(b, 'fr'));
  }, [tagSetsMap, suggestions]);

  // Filter suggestions based on input value and exclude already added tags
  const filteredSuggestions = allSuggestions.filter(
    (s) =>
      !tags.includes(s) &&
      s.toLowerCase().includes(inputValue.toLowerCase())
  );

  // Show suggestions when focused and there are suggestions available
  const shouldShowSuggestions = showSuggestions && allSuggestions.length > 0;

  const handleAddTag = useCallback(async (tagToAdd?: string) => {
    const trimmed = (tagToAdd || inputValue).trim();
    if (trimmed && !tags.includes(trimmed)) {
      // If a new tag with an icon, create a TagSet for it
      if (newTagIcon && !tagSetNames.has(trimmed)) {
        await createTagSet({
          name: trimmed,
          description: '',
          defaultVisual: { color: null, shape: null, icon: newTagIcon },
          suggestedProperties: [],
          isBuiltIn: false,
        });
      }

      onChange([...tags, trimmed]);

      // Check if this tag is from a TagSet (to trigger property suggestions)
      if (onTagSetTagAdded && tagSetNames.has(trimmed)) {
        onTagSetTagAdded(trimmed);
      }

      // Notify parent to add to investigation settings if it's a new tag (not from TagSet or suggestions)
      if (onNewTag && !suggestions.includes(trimmed) && !tagSetNames.has(trimmed) && !newTagIcon) {
        onNewTag(trimmed);
      }
    }
    setInputValue('');
    setNewTagIcon(null);
    setShowSuggestions(false);
    setSelectedSuggestionIndex(-1);
    // Keep input focused for adding more tags
    inputRef.current?.focus();
  }, [inputValue, tags, onChange, onNewTag, onTagSetTagAdded, suggestions, tagSetNames, newTagIcon, createTagSet]);

  const handleRemoveTag = useCallback(
    (tagToRemove: string) => {
      onChange(tags.filter((tag) => tag !== tagToRemove));
    },
    [tags, onChange]
  );

  // Handle icon change for existing tags
  const handleTagIconChange = useCallback(async (tagName: string, newIcon: string | null) => {
    const existingData = tagSetData.get(tagName);

    if (existingData) {
      // Update existing TagSet
      await updateTagSet(existingData.id, {
        defaultVisual: {
          ...existingData.tagSet.defaultVisual,
          icon: newIcon,
        },
      });
    } else if (newIcon) {
      // Create new TagSet for this tag
      await createTagSet({
        name: tagName,
        description: '',
        defaultVisual: { color: null, shape: null, icon: newIcon },
        suggestedProperties: [],
        isBuiltIn: false,
      });
    }
    setEditingTagIcon(null);
  }, [tagSetData, updateTagSet, createTagSet]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (selectedSuggestionIndex >= 0 && filteredSuggestions[selectedSuggestionIndex]) {
          handleAddTag(filteredSuggestions[selectedSuggestionIndex]);
        } else {
          handleAddTag();
        }
      } else if (e.key === 'Escape') {
        setInputValue('');
        setIsAdding(false);
        setShowSuggestions(false);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedSuggestionIndex((prev) =>
          prev < filteredSuggestions.length - 1 ? prev + 1 : prev
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedSuggestionIndex((prev) => (prev > 0 ? prev - 1 : -1));
      }
    },
    [handleAddTag, filteredSuggestions, selectedSuggestionIndex]
  );

  const handleCloseSuggestions = useCallback(() => {
    setShowSuggestions(false);
  }, []);

  // Reset selection when suggestions change
  useEffect(() => {
    setSelectedSuggestionIndex(-1);
  }, [inputValue]);

  return (
    <div className="space-y-2">
      {/* Tags list */}
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => {
          const iconName = tagIcons.get(tag);
          const IconComponent = iconName ? getIconComponent(iconName) : null;
          const isEditingIcon = editingTagIcon === tag;

          return (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-bg-tertiary text-text-secondary text-xs rounded group"
            >
              {/* Icon edit area */}
              {isEditingIcon ? (
                <IconPickerCompact
                  value={iconName || null}
                  onChange={(newIcon) => handleTagIconChange(tag, newIcon)}
                />
              ) : IconComponent ? (
                <button
                  onClick={() => setEditingTagIcon(tag)}
                  className="hover:text-accent focus:outline-none"
                  title={t('detail.tags.editIcon')}
                >
                  <IconComponent size={12} className="text-text-tertiary" />
                </button>
              ) : (
                <button
                  onClick={() => setEditingTagIcon(tag)}
                  className="opacity-0 group-hover:opacity-100 hover:text-accent focus:outline-none transition-opacity"
                  title={t('detail.tags.addIcon')}
                >
                  <Plus size={10} />
                </button>
              )}
              {tag}
              <button
                onClick={() => handleRemoveTag(tag)}
                className="hover:text-error focus:outline-none"
                aria-label={t('detail.tags.deleteTag', { tag })}
              >
                <X size={12} />
              </button>
            </span>
          );
        })}

        {/* Add button or input */}
        {isAdding ? (
          <div className="flex items-center gap-1">
            <IconPickerCompact value={newTagIcon} onChange={setNewTagIcon} />
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              onKeyDown={handleKeyDown}
              autoFocus
              placeholder={t('detail.tags.newTagPlaceholder')}
              className="px-2 py-0.5 text-xs bg-bg-secondary border border-border-default rounded focus:outline-none focus:border-accent text-text-primary placeholder:text-text-tertiary min-w-[120px]"
            />

            {/* Suggestions dropdown */}
            <DropdownPortal
              anchorRef={inputRef}
              isOpen={shouldShowSuggestions}
              onClose={handleCloseSuggestions}
              className="max-h-48 overflow-y-auto min-w-[180px]"
            >
              {filteredSuggestions.length > 0 ? (
                filteredSuggestions.map((suggestion, index) => {
                  const isTagSet = tagSetNames.has(suggestion);
                  const suggestionIconName = tagIcons.get(suggestion);
                  const SuggestionIcon = suggestionIconName ? getIconComponent(suggestionIconName) : null;
                  return (
                    <button
                      key={suggestion}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault(); // Prevent input blur
                        handleAddTag(suggestion);
                      }}
                      className={`w-full px-2 py-1.5 text-xs text-left hover:bg-bg-secondary flex items-center gap-2 ${
                        index === selectedSuggestionIndex ? 'bg-bg-secondary' : ''
                      }`}
                    >
                      {SuggestionIcon && (
                        <SuggestionIcon size={14} className="text-text-tertiary flex-shrink-0" />
                      )}
                      <span className="flex-1">{suggestion}</span>
                      {isTagSet && (
                        <Sparkles size={10} className="text-accent flex-shrink-0" />
                      )}
                    </button>
                  );
                })
              ) : inputValue.trim() ? (
                <div className="px-2 py-1.5 text-xs text-text-tertiary">
                  {t('detail.tags.pressEnterToCreate', { value: inputValue.trim() })}
                </div>
              ) : (
                <div className="px-2 py-1.5 text-xs text-text-tertiary">
                  {t('detail.tags.typeToFilter')}
                </div>
              )}
            </DropdownPortal>
          </div>
        ) : (
          <button
            onClick={() => setIsAdding(true)}
            className="inline-flex items-center gap-1 px-2 py-0.5 text-xs text-text-tertiary hover:text-text-secondary hover:bg-bg-tertiary rounded border border-dashed border-border-default"
          >
            <Plus size={12} />
            {t('detail.tags.add')}
          </button>
        )}
      </div>

      {tags.length === 0 && !isAdding && (
        <p className="text-xs text-text-tertiary">{t('detail.tags.noTags')}</p>
      )}
    </div>
  );
}
