import {
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
  type KeyboardEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Box, Link2, X, Tag } from 'lucide-react';
import { useInvestigationStore, useSelectionStore, useViewStore } from '../../stores';
import { searchService } from '../../services/searchService';
import type { SearchResult } from '../../types';
import { getCountryByCode, getCountryName } from '../../data/countries';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SearchModal({ isOpen, onClose }: SearchModalProps) {
  const { t, i18n } = useTranslation('modals');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showTags, setShowTags] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const { elements, links } = useInvestigationStore();
  const { selectElement, selectLink, clearSelection } = useSelectionStore();
  const { requestViewportChange } = useViewStore();

  // Create maps for quick lookup
  const elementsMap = useMemo(
    () => new Map(elements.map((el) => [el.id, el])),
    [elements]
  );
  const linksMap = useMemo(
    () => new Map(links.map((link) => [link.id, link])),
    [links]
  );

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(() => {
      const searchResults = searchService.search(query, 20);
      setResults(searchResults);
      setSelectedIndex(0);
    }, 100);

    return () => clearTimeout(timer);
  }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    if (resultsRef.current && results.length > 0) {
      const selectedElement = resultsRef.current.children[selectedIndex] as HTMLElement;
      selectedElement?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex, results.length]);

  const handleSelect = useCallback(
    (result: SearchResult) => {
      clearSelection();

      // Zoom level for showing the found element clearly
      const targetZoom = 1.0;
      // Approximate canvas size (window minus side panel ~350px)
      const canvasWidth = window.innerWidth - 350;
      const canvasHeight = window.innerHeight;

      if (result.type === 'element') {
        const element = elementsMap.get(result.id);
        if (element) {
          selectElement(element.id);
          // Get element center (position is top-left, add half of typical size)
          const elementWidth = element.visual?.size?.width ?? 150;
          const elementHeight = element.visual?.size?.height ?? 60;
          const centerX = element.position.x + elementWidth / 2;
          const centerY = element.position.y + elementHeight / 2;
          // Center viewport on element
          requestViewportChange({
            x: -centerX * targetZoom + canvasWidth / 2,
            y: -centerY * targetZoom + canvasHeight / 2,
            zoom: targetZoom,
          });
        }
      } else {
        const link = linksMap.get(result.id);
        if (link) {
          selectLink(link.id);
          // Center viewport on link midpoint
          const fromElement = elementsMap.get(link.fromId);
          const toElement = elementsMap.get(link.toId);
          if (fromElement && toElement) {
            const midX = (fromElement.position.x + toElement.position.x) / 2;
            const midY = (fromElement.position.y + toElement.position.y) / 2;
            requestViewportChange({
              x: -midX * targetZoom + canvasWidth / 2,
              y: -midY * targetZoom + canvasHeight / 2,
              zoom: targetZoom,
            });
          } else if (fromElement) {
            requestViewportChange({
              x: -fromElement.position.x * targetZoom + canvasWidth / 2,
              y: -fromElement.position.y * targetZoom + canvasHeight / 2,
              zoom: targetZoom,
            });
          }
        }
      }

      onClose();
    },
    [
      elementsMap,
      linksMap,
      selectElement,
      selectLink,
      clearSelection,
      requestViewportChange,
      onClose,
    ]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (results[selectedIndex]) {
            handleSelect(results[selectedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    },
    [results, selectedIndex, handleSelect, onClose]
  );

  const getResultLabel = useCallback(
    (result: SearchResult): string => {
      if (result.type === 'element') {
        const el = elementsMap.get(result.id);
        return el?.label || t('search.noName');
      } else {
        const link = linksMap.get(result.id);
        if (!link) return t('search.link');
        const from = elementsMap.get(link.fromId);
        const to = elementsMap.get(link.toId);
        return link.label || `${from?.label || '?'} → ${to?.label || '?'}`;
      }
    },
    [elementsMap, linksMap, t]
  );

  // Get matching property info from search result
  const getMatchingProperty = useCallback(
    (result: SearchResult): { key: string; value: string } | null => {
      if (!query.trim()) return null;
      const queryLower = query.toLowerCase();

      const properties = result.type === 'element'
        ? elementsMap.get(result.id)?.properties
        : linksMap.get(result.id)?.properties;

      if (!properties) return null;

      for (const prop of properties) {
        const valueStr = String(prop.value ?? '');

        // Check if property key or value matches query
        const keyMatches = prop.key.toLowerCase().includes(queryLower);
        const valueMatches = valueStr.toLowerCase().includes(queryLower);

        // For country type, also check country name
        let countryNameMatches = false;
        let country = null;
        let countryName = '';
        if (prop.type === 'country' || /^[A-Z]{2}$/i.test(valueStr)) {
          country = getCountryByCode(valueStr.toUpperCase());
          if (country) {
            countryName = getCountryName(country.code, i18n.language);
            countryNameMatches = countryName.toLowerCase().includes(queryLower);
          }
        }

        if (keyMatches || valueMatches || countryNameMatches) {
          // Format country values with flag
          if (country) {
            return { key: prop.key, value: `${country.flag} ${countryName}` };
          }
          return { key: prop.key, value: valueStr };
        }
      }
      return null;
    },
    [elementsMap, linksMap, query, i18n.language]
  );

  // Get tags for a result
  const getResultTags = useCallback(
    (result: SearchResult): string[] => {
      if (result.type === 'element') {
        const el = elementsMap.get(result.id);
        return el?.tags || [];
      } else {
        const link = linksMap.get(result.id);
        return link?.tags || [];
      }
    },
    [elementsMap, linksMap]
  );

  // Get excerpt (notes) for a result
  const getResultNotes = useCallback(
    (result: SearchResult): string | null => {
      if (result.type === 'element') {
        const el = elementsMap.get(result.id);
        if (el?.notes) {
          return el.notes.substring(0, 80) + (el.notes.length > 80 ? '...' : '');
        }
      } else {
        const link = linksMap.get(result.id);
        if (link?.notes) {
          return link.notes.substring(0, 80) + (link.notes.length > 80 ? '...' : '');
        }
      }
      return null;
    },
    [elementsMap, linksMap]
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-start justify-center pt-[15vh] z-[1000]"
      onClick={onClose}
    >
      <div
        className="bg-bg-primary rounded shadow-lg w-full max-w-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border-default">
          <Search size={18} className="text-text-tertiary" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('search.placeholder')}
            className="flex-1 bg-transparent text-text-primary placeholder:text-text-tertiary focus:outline-none"
          />
          <button
            onClick={onClose}
            className="p-1 text-text-tertiary hover:text-text-primary"
          >
            <X size={16} />
          </button>
        </div>

        {/* Results */}
        <div ref={resultsRef} className="max-h-96 overflow-y-auto">
          {query && results.length === 0 && (
            <div className="px-4 py-8 text-center text-text-tertiary">
              <p className="text-sm">{t('search.noResults', { query })}</p>
            </div>
          )}

          {results.map((result, index) => {
            const matchingProp = getMatchingProperty(result);
            const tags = getResultTags(result);
            const notes = getResultNotes(result);

            return (
              <button
                key={result.id}
                onClick={() => handleSelect(result)}
                className={`w-full px-4 py-3 flex items-start gap-3 text-left transition-colors ${
                  index === selectedIndex
                    ? 'bg-accent/10'
                    : 'hover:bg-bg-secondary'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded flex items-center justify-center flex-shrink-0 ${
                    result.type === 'element'
                      ? 'bg-accent/20 text-accent'
                      : 'bg-bg-tertiary text-text-secondary'
                  }`}
                >
                  {result.type === 'element' ? (
                    <Box size={16} />
                  ) : (
                    <Link2 size={16} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-text-primary truncate">
                    {getResultLabel(result)}
                  </div>
                  {/* Matching property */}
                  {matchingProp && (
                    <div className="text-xs text-accent mt-0.5">
                      <span className="text-text-tertiary">{matchingProp.key}:</span> {matchingProp.value}
                    </div>
                  )}
                  {/* Notes excerpt */}
                  {notes && !matchingProp && (
                    <div className="text-xs text-text-tertiary truncate mt-0.5">
                      {notes}
                    </div>
                  )}
                  {/* Tags */}
                  {showTags && tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {tags.slice(0, 4).map((tag) => (
                        <span
                          key={tag}
                          className="px-1.5 py-0.5 text-[10px] bg-bg-tertiary text-text-secondary rounded"
                        >
                          {tag}
                        </span>
                      ))}
                      {tags.length > 4 && (
                        <span className="text-[10px] text-text-tertiary">
                          +{tags.length - 4}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="text-xs text-text-tertiary">
                  {result.type === 'element' ? t('search.element') : t('search.link')}
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer hint */}
        {results.length > 0 && (
          <div className="px-4 py-2 border-t border-border-default text-xs text-text-tertiary flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span>
                <kbd className="px-1 py-0.5 bg-bg-tertiary rounded">↑↓</kbd> {t('search.navigate')}
              </span>
              <span>
                <kbd className="px-1 py-0.5 bg-bg-tertiary rounded">↵</kbd> {t('search.select')}
              </span>
              <span>
                <kbd className="px-1 py-0.5 bg-bg-tertiary rounded">Esc</kbd> {t('search.close')}
              </span>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowTags(!showTags);
              }}
              className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${
                showTags ? 'bg-accent/10 text-accent' : 'hover:bg-bg-tertiary'
              }`}
              title={t('search.showTags')}
            >
              <Tag size={12} />
              <span>Tags</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
