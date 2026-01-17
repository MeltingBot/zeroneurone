import {
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
  type KeyboardEvent,
} from 'react';
import { Search, Box, Link2, X } from 'lucide-react';
import { useInvestigationStore, useSelectionStore, useViewStore } from '../../stores';
import { searchService } from '../../services/searchService';
import type { SearchResult } from '../../types';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SearchModal({ isOpen, onClose }: SearchModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const { elements, links } = useInvestigationStore();
  const { selectElement, selectLink, clearSelection } = useSelectionStore();
  const { setViewport, viewport } = useViewStore();

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

      if (result.type === 'element') {
        const element = elementsMap.get(result.id);
        if (element) {
          selectElement(element.id);
          // Center viewport on element
          setViewport({
            x: -element.position.x * viewport.zoom + window.innerWidth / 3,
            y: -element.position.y * viewport.zoom + window.innerHeight / 3,
            zoom: viewport.zoom,
          });
        }
      } else {
        const link = linksMap.get(result.id);
        if (link) {
          selectLink(link.id);
          // Center viewport on link source
          const fromElement = elementsMap.get(link.fromId);
          if (fromElement) {
            setViewport({
              x: -fromElement.position.x * viewport.zoom + window.innerWidth / 3,
              y: -fromElement.position.y * viewport.zoom + window.innerHeight / 3,
              zoom: viewport.zoom,
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
      setViewport,
      viewport.zoom,
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
        return el?.label || 'Sans nom';
      } else {
        const link = linksMap.get(result.id);
        if (!link) return 'Lien';
        const from = elementsMap.get(link.fromId);
        const to = elementsMap.get(link.toId);
        return link.label || `${from?.label || '?'} → ${to?.label || '?'}`;
      }
    },
    [elementsMap, linksMap]
  );

  const getResultExcerpt = useCallback(
    (result: SearchResult): string | null => {
      if (result.type === 'element') {
        const el = elementsMap.get(result.id);
        if (el?.notes) {
          return el.notes.substring(0, 100) + (el.notes.length > 100 ? '...' : '');
        }
        if (el?.tags.length) {
          return el.tags.join(', ');
        }
      } else {
        const link = linksMap.get(result.id);
        if (link?.notes) {
          return link.notes.substring(0, 100) + (link.notes.length > 100 ? '...' : '');
        }
      }
      return null;
    },
    [elementsMap, linksMap]
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-start justify-center pt-[15vh] z-50"
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
            placeholder="Rechercher des éléments et liens..."
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
              <p className="text-sm">Aucun résultat pour "{query}"</p>
            </div>
          )}

          {results.map((result, index) => (
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
                {getResultExcerpt(result) && (
                  <div className="text-xs text-text-tertiary truncate mt-0.5">
                    {getResultExcerpt(result)}
                  </div>
                )}
              </div>
              <div className="text-xs text-text-tertiary">
                {result.type === 'element' ? 'Élément' : 'Lien'}
              </div>
            </button>
          ))}
        </div>

        {/* Footer hint */}
        {results.length > 0 && (
          <div className="px-4 py-2 border-t border-border-default text-xs text-text-tertiary flex items-center gap-4">
            <span>
              <kbd className="px-1 py-0.5 bg-bg-tertiary rounded">↑↓</kbd> pour naviguer
            </span>
            <span>
              <kbd className="px-1 py-0.5 bg-bg-tertiary rounded">Entrée</kbd> pour sélectionner
            </span>
            <span>
              <kbd className="px-1 py-0.5 bg-bg-tertiary rounded">Échap</kbd> pour fermer
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
