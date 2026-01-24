import { useState, useCallback, useEffect } from 'react';

interface ProgressiveListProps<T> {
  items: T[];
  /** Number of items shown initially (default: 20) */
  initialCount?: number;
  /** Number of items added on "show more" (default: 20) */
  increment?: number;
  /** Render function for each item */
  renderItem: (item: T, index: number) => React.ReactNode;
  /** Container className */
  className?: string;
}

export function ProgressiveList<T>({
  items,
  initialCount = 20,
  increment = 20,
  renderItem,
  className = '',
}: ProgressiveListProps<T>) {
  const [visibleCount, setVisibleCount] = useState(initialCount);

  // Reset visible count when items change significantly
  useEffect(() => {
    setVisibleCount(initialCount);
  }, [items.length, initialCount]);

  const handleShowMore = useCallback(() => {
    setVisibleCount((prev) => Math.min(prev + increment, items.length));
  }, [increment, items.length]);

  const visibleItems = items.slice(0, visibleCount);
  const remaining = items.length - visibleCount;

  return (
    <div className={className}>
      {visibleItems.map((item, index) => renderItem(item, index))}
      {remaining > 0 && (
        <button
          onClick={handleShowMore}
          className="w-full mt-1 py-1.5 text-[10px] text-text-tertiary hover:text-text-secondary hover:bg-bg-tertiary rounded text-center"
        >
          Voir plus ({remaining} restants)
        </button>
      )}
    </div>
  );
}
