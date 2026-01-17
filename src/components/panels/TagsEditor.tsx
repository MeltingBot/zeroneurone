import { useState, useCallback, useRef, useEffect, type KeyboardEvent } from 'react';
import { X, Plus } from 'lucide-react';
import { DropdownPortal } from '../common';

interface TagsEditorProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  /** Suggested tags from the investigation (existing tags used elsewhere) */
  suggestions?: string[];
  /** Callback when a new tag is created (to add to investigation settings) */
  onNewTag?: (tag: string) => void;
}

export function TagsEditor({ tags, onChange, suggestions = [], onNewTag }: TagsEditorProps) {
  const [inputValue, setInputValue] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter suggestions based on input value and exclude already added tags
  const filteredSuggestions = suggestions.filter(
    (s) =>
      !tags.includes(s) &&
      s.toLowerCase().includes(inputValue.toLowerCase())
  );

  // Show suggestions when focused and there are suggestions available
  const shouldShowSuggestions = showSuggestions && suggestions.length > 0;

  const handleAddTag = useCallback((tagToAdd?: string) => {
    const trimmed = (tagToAdd || inputValue).trim();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
      // Notify parent to add to investigation settings if it's a new tag
      if (onNewTag && !suggestions.includes(trimmed)) {
        onNewTag(trimmed);
      }
    }
    setInputValue('');
    setShowSuggestions(false);
    setSelectedSuggestionIndex(-1);
    // Keep input focused for adding more tags
    inputRef.current?.focus();
  }, [inputValue, tags, onChange, onNewTag, suggestions]);

  const handleRemoveTag = useCallback(
    (tagToRemove: string) => {
      onChange(tags.filter((tag) => tag !== tagToRemove));
    },
    [tags, onChange]
  );

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
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 px-2 py-0.5 bg-bg-tertiary text-text-secondary text-xs rounded"
          >
            {tag}
            <button
              onClick={() => handleRemoveTag(tag)}
              className="hover:text-error focus:outline-none"
              aria-label={`Supprimer le tag ${tag}`}
            >
              <X size={12} />
            </button>
          </span>
        ))}

        {/* Add button or input */}
        {isAdding ? (
          <div>
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
              placeholder="Nouveau tag..."
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
                filteredSuggestions.map((suggestion, index) => (
                  <button
                    key={suggestion}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault(); // Prevent input blur
                      handleAddTag(suggestion);
                    }}
                    className={`w-full px-2 py-1.5 text-xs text-left hover:bg-bg-secondary ${
                      index === selectedSuggestionIndex ? 'bg-bg-secondary' : ''
                    }`}
                  >
                    {suggestion}
                  </button>
                ))
              ) : (
                <div className="px-2 py-1.5 text-xs text-text-tertiary">
                  Aucune correspondance
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
            Ajouter
          </button>
        )}
      </div>

      {tags.length === 0 && !isAdding && (
        <p className="text-xs text-text-tertiary">Aucun tag</p>
      )}
    </div>
  );
}
