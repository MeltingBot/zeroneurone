import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { LayoutGrid, ChevronDown, Loader2 } from 'lucide-react';
import { layoutService, type LayoutType } from '../../services/layoutService';
import { graphWorkerService } from '../../services/graphWorkerService';
import { useDossierStore, useHistoryStore, useSelectionStore } from '../../stores';
import type { Position } from '../../types';
import { buildLayoutScope } from '../../utils/layoutScope';

export function LayoutDropdown() {
  const { t } = useTranslation('pages');
  const [isOpen, setIsOpen] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { elements, links, updateElementPositions } = useDossierStore();
  const { pushAction } = useHistoryStore();
  const selectedElementIds = useSelectionStore((s) => s.selectedElementIds);

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

    // Scope: >= 2 selected elements -> induced sub-graph, else whole dossier.
    // Groups are laid out as single blocks so their children follow them.
    const scope = buildLayoutScope(elements, links, selectedElementIds);
    if (scope.elements.length === 0) {
      setIsApplying(false);
      return;
    }

    // Save old positions for undo (only scoped nodes move)
    const oldPositions = scope.originalPositions;

    // Center: centroid of the scoped nodes (same coordinate space as them)
    const center = {
      x: scope.elements.reduce((sum, el) => sum + el.position.x, 0) / scope.elements.length,
      y: scope.elements.reduce((sum, el) => sum + el.position.y, 0) / scope.elements.length,
    };

    try {
      let positions: Record<string, Position>;
      try {
        // Apply layout in Web Worker (non-blocking)
        positions = await graphWorkerService.computeLayout(
          scope.elements,
          scope.links,
          { layoutType, center }
        );
      } catch (error) {
        console.error('[LayoutDropdown] Worker layout failed, falling back:', error);
        const result = layoutService.applyLayout(layoutType, scope.elements, scope.links, { center });
        positions = Object.fromEntries(result.positions);
      }

      const newPositions: { id: string; position: Position }[] = [];
      for (const [id, pos] of Object.entries(positions)) {
        newPositions.push({ id, position: scope.toStoredPosition(id, pos) });
      }

      if (newPositions.length > 0) {
        pushAction({
          type: 'move-elements',
          undo: { positions: oldPositions },
          redo: { positions: newPositions },
        });
        await updateElementPositions(newPositions);
      }
    } finally {
      setIsApplying(false);
    }
  }, [elements, links, updateElementPositions, pushAction, selectedElementIds]);

  const layouts = layoutService.getAvailableLayouts();

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isApplying || elements.length === 0}
        className="flex items-center gap-1 px-2 h-7 text-xs text-text-secondary hover:bg-bg-tertiary rounded border border-border-default disabled:opacity-50 disabled:cursor-not-allowed"
        title={t('dossier.layout.buttonTitle')}
      >
        {isApplying ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <LayoutGrid size={14} />
        )}
        <span className="hidden sm:inline">{t('dossier.layout.button')}</span>
        <ChevronDown size={12} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-56 bg-bg-primary border border-border-default rounded shadow-lg z-50">
          <div className="py-1">
            <div className="px-3 py-1.5 text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">
              {t('dossier.layout.title')}
            </div>
            {selectedElementIds.size >= 2 && (
              <div className="px-3 pb-1.5 text-[10px] text-accent">
                {t('dossier.layout.scopeSelection', { count: selectedElementIds.size })}
              </div>
            )}
            {layouts.map((layoutType) => (
              <button
                key={layoutType}
                onClick={() => handleApplyLayout(layoutType)}
                className="w-full px-3 py-2 text-left hover:bg-bg-secondary flex flex-col gap-0.5"
              >
                <span className="text-sm text-text-primary">
                  {t(`dossier.layout.types.${layoutType}.name`)}
                </span>
                <span className="text-[10px] text-text-tertiary">
                  {t(`dossier.layout.types.${layoutType}.description`)}
                </span>
              </button>
            ))}
          </div>
          <div className="border-t border-border-default px-3 py-2">
            <p className="text-[10px] text-text-tertiary">
              {t('dossier.layout.undoHint')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
