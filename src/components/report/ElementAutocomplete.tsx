import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link2 } from 'lucide-react';
import { useInvestigationStore } from '../../stores';
import type { ElementShape } from '../../types';

interface AutocompleteItem {
  type: 'element' | 'link';
  id: string;
  label: string;
  tags?: string[];
  // Additional info for disambiguation
  subtitle?: string;      // First property or context info
  shortId: string;        // Last 6 chars of ID for technical distinction
  color?: string;         // Element color
  shape?: ElementShape;   // Element shape
}

interface ElementAutocompleteProps {
  query: string;
  position: { top: number; left: number };
  onSelect: (item: AutocompleteItem) => void;
  onClose: () => void;
}

export function ElementAutocomplete({
  query,
  position,
  onSelect,
  onClose,
}: ElementAutocompleteProps) {
  const { t } = useTranslation('panels');
  const { elements, links } = useInvestigationStore();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Build autocomplete items from elements and links
  const items = useMemo(() => {
    const queryLower = query.toLowerCase();
    const results: AutocompleteItem[] = [];

    // Helper to get first property as subtitle
    const getFirstProperty = (properties: { key: string; value: string | number | boolean | Date | null }[]): string | undefined => {
      if (properties.length === 0) return undefined;
      const prop = properties[0];
      if (prop.value === null || prop.value === undefined) return undefined;
      const valueStr = prop.value instanceof Date
        ? prop.value.toLocaleDateString()
        : String(prop.value);
      return `${prop.key}: ${valueStr}`;
    };

    // Filter elements
    for (const element of elements) {
      if (element.label.toLowerCase().includes(queryLower)) {
        results.push({
          type: 'element',
          id: element.id,
          label: element.label,
          tags: element.tags.slice(0, 2),
          subtitle: getFirstProperty(element.properties),
          shortId: element.id.slice(-6),
          color: element.visual.color,
          shape: element.visual.shape,
        });
      }
    }

    // Filter links (only named links)
    for (const link of links) {
      if (link.label && link.label.toLowerCase().includes(queryLower)) {
        const fromEl = elements.find((e) => e.id === link.fromId);
        const toEl = elements.find((e) => e.id === link.toId);
        results.push({
          type: 'link',
          id: link.id,
          label: link.label,
          subtitle: `${fromEl?.label || '?'} → ${toEl?.label || '?'}`,
          shortId: link.id.slice(-6),
          color: link.visual.color,
        });
      }
    }

    return results.slice(0, 10); // Limit to 10 results
  }, [query, elements, links]);

  // Track if user has explicitly navigated with arrows
  const [hasNavigated, setHasNavigated] = useState(false);

  // Reset selection when items change
  useEffect(() => {
    setSelectedIndex(0);
    setHasNavigated(false);
  }, [items]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current && items.length > 0) {
      const selectedElement = listRef.current.children[selectedIndex] as HTMLElement;
      selectedElement?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex, items.length]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          e.stopPropagation();
          setSelectedIndex((i) => Math.min(i + 1, items.length - 1));
          setHasNavigated(true);
          break;
        case 'ArrowUp':
          e.preventDefault();
          e.stopPropagation();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          setHasNavigated(true);
          break;
        case 'Enter':
          // Only select on Enter if user has navigated with arrows
          // Otherwise, let Enter create a new line in textarea
          if (hasNavigated && items[selectedIndex]) {
            e.preventDefault();
            e.stopPropagation();
            onSelect(items[selectedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          e.stopPropagation();
          onClose();
          break;
        case 'Tab':
          // Tab always selects (standard autocomplete behavior)
          e.preventDefault();
          e.stopPropagation();
          if (items[selectedIndex]) {
            onSelect(items[selectedIndex]);
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [items, selectedIndex, hasNavigated, onSelect, onClose]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    // Use setTimeout to avoid closing immediately on trigger
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  const handleItemClick = useCallback(
    (item: AutocompleteItem) => {
      onSelect(item);
    },
    [onSelect]
  );

  if (items.length === 0) {
    return (
      <div
        ref={containerRef}
        data-autocomplete="true"
        className="fixed bg-bg-primary border border-border-default rounded shadow-lg z-[9999] py-2 px-3"
        style={{ top: position.top, left: position.left, minWidth: 200 }}
      >
        <p className="text-sm text-text-tertiary">{t('report.noResults')}</p>
      </div>
    );
  }

  // Shape indicator component
  const ShapeIndicator = ({ shape, color }: { shape?: ElementShape; color?: string }) => {
    const baseStyle = { backgroundColor: color || '#6b7280' };
    const shapeClass = shape === 'circle' ? 'rounded-full'
      : shape === 'diamond' ? 'rotate-45'
      : shape === 'rectangle' ? 'rounded-sm'
      : 'rounded-sm'; // square default

    return (
      <div
        className={`w-3 h-3 shrink-0 ${shapeClass}`}
        style={baseStyle}
      />
    );
  };

  return (
    <div
      ref={containerRef}
      data-autocomplete="true"
      className="fixed bg-bg-primary border border-border-default rounded shadow-lg z-[9999] max-h-64 overflow-y-auto"
      style={{ top: position.top, left: position.left, minWidth: 280, maxWidth: 420 }}
    >
      <div ref={listRef}>
        {items.map((item, index) => {
          const isSelected = index === selectedIndex;

          return (
            <button
              key={`${item.type}-${item.id}`}
              onMouseDown={(e) => {
                e.preventDefault(); // Prevent blur from firing before selection
                handleItemClick(item);
              }}
              className={`w-full px-3 py-2 flex items-start gap-2 text-left transition-colors ${
                isSelected ? 'bg-accent/10' : 'hover:bg-bg-secondary'
              }`}
            >
              {/* Visual indicator: shape+color for elements, link icon for links */}
              <div className="mt-0.5 shrink-0">
                {item.type === 'element' ? (
                  <ShapeIndicator shape={item.shape} color={item.color} />
                ) : (
                  <Link2 size={14} className="text-text-tertiary" style={{ color: item.color }} />
                )}
              </div>

              <div className="min-w-0 flex-1">
                {/* Label + short ID */}
                <div className="flex items-baseline gap-2">
                  <span className="text-sm text-text-primary truncate">{item.label}</span>
                  <span className="text-xs text-text-tertiary font-mono shrink-0">#{item.shortId}</span>
                </div>

                {/* Subtitle (first property or link context) */}
                {item.subtitle && (
                  <p className="text-xs text-text-secondary truncate mt-0.5">{item.subtitle}</p>
                )}

                {/* Tags */}
                {item.tags && item.tags.length > 0 && (
                  <div className="flex gap-1 mt-1">
                    {item.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-xs px-1 py-0.5 bg-bg-tertiary rounded text-text-secondary"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
