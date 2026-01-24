import { useState, useRef, useEffect, useCallback } from 'react';
import { LayoutGrid, ChevronDown, Loader2 } from 'lucide-react';
import { layoutService, type LayoutType } from '../../services/layoutService';
import { graphWorkerService } from '../../services/graphWorkerService';
import { useInvestigationStore, useHistoryStore } from '../../stores';
import type { Position } from '../../types';

export function LayoutDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { elements, links, updateElementPositions } = useInvestigationStore();
  const { pushAction } = useHistoryStore();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleApplyLayout = useCallback(async (layoutType: LayoutType) => {
    if (elements.length === 0) return;

    setIsApplying(true);
    setIsOpen(false);

    try {
      // Save old positions for undo
      const oldPositions: { id: string; position: Position }[] = elements.map(el => ({
        id: el.id,
        position: { ...el.position },
      }));

      // Calculate center from current positions
      const centerX = elements.reduce((sum, el) => sum + el.position.x, 0) / elements.length;
      const centerY = elements.reduce((sum, el) => sum + el.position.y, 0) / elements.length;

      // Apply layout in Web Worker (non-blocking)
      const positions = await graphWorkerService.computeLayout(
        elements,
        links,
        { layoutType, center: { x: centerX, y: centerY } }
      );

      // Build new positions array
      const newPositions: { id: string; position: Position }[] = [];
      for (const [id, pos] of Object.entries(positions)) {
        newPositions.push({ id, position: pos });
      }

      if (newPositions.length > 0) {
        // Push undo action
        pushAction({
          type: 'move-elements',
          undo: { positions: oldPositions },
          redo: { positions: newPositions },
        });

        // Apply new positions
        await updateElementPositions(newPositions);
      }
    } catch (error) {
      console.error('[LayoutDropdown] Worker layout failed, falling back:', error);
      // Fallback to main-thread computation
      const result = layoutService.applyLayout(layoutType, elements, links);
      const newPositions: { id: string; position: Position }[] = [];
      for (const [id, position] of result.positions) {
        newPositions.push({ id, position });
      }
      if (newPositions.length > 0) {
        await updateElementPositions(newPositions);
      }
    } finally {
      setIsApplying(false);
    }
  }, [elements, links, updateElementPositions, pushAction]);

  const layouts = layoutService.getAvailableLayouts();

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isApplying || elements.length === 0}
        className="flex items-center gap-1 px-2 h-7 text-xs text-text-secondary hover:bg-bg-tertiary rounded border border-border-default disabled:opacity-50 disabled:cursor-not-allowed"
        title="Rearrangement automatique du graphe"
      >
        {isApplying ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <LayoutGrid size={14} />
        )}
        <span className="hidden sm:inline">Arranger</span>
        <ChevronDown size={12} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-56 bg-bg-primary border border-border-default rounded shadow-lg z-50">
          <div className="py-1">
            <div className="px-3 py-1.5 text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">
              Algorithmes de layout
            </div>
            {layouts.map((layoutType) => (
              <button
                key={layoutType}
                onClick={() => handleApplyLayout(layoutType)}
                className="w-full px-3 py-2 text-left hover:bg-bg-secondary flex flex-col gap-0.5"
              >
                <span className="text-sm text-text-primary">
                  {layoutService.getLayoutName(layoutType)}
                </span>
                <span className="text-[10px] text-text-tertiary">
                  {layoutService.getLayoutDescription(layoutType)}
                </span>
              </button>
            ))}
          </div>
          <div className="border-t border-border-default px-3 py-2">
            <p className="text-[10px] text-text-tertiary">
              Ctrl+Z pour annuler apres application
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
