import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { LayoutGrid, ChevronDown, Loader2 } from 'lucide-react';
import { layoutService, type LayoutType } from '../../services/layoutService';
import { graphWorkerService } from '../../services/graphWorkerService';
import { useDossierStore, useHistoryStore, useSelectionStore, useTabStore, useViewStore } from '../../stores';
import type { Position } from '../../types';
import { buildLayoutScope } from '../../utils/layoutScope';
import { avoidObstacles } from '../../utils/avoidObstacles';

export function LayoutDropdown() {
  const { t } = useTranslation('pages');
  const [isOpen, setIsOpen] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { elements, links, updateElementPositions } = useDossierStore();
  const { pushAction } = useHistoryStore();
  const selectedElementIds = useSelectionStore((s) => s.selectedElementIds);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const tabMemberSet = useTabStore((s) => s.memberSet);
  const tabs = useTabStore((s) => s.tabs);

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
    // In a tab, only its members move and they keep clear of everything else.
    // Groups are laid out as single blocks so their children follow them.
    const pool = activeTabId !== null ? tabMemberSet : undefined;
    const scope = buildLayoutScope(elements, links, selectedElementIds, pool);
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

    // Locked elements as discs, in the layout's coordinate space (centres)
    const obstacles = scope.obstacles.map((o) => ({
      x: o.x + o.width / 2,
      y: o.y + o.height / 2,
      r: Math.hypot(o.width, o.height) / 2,
    }));

    try {
      let positions: Record<string, Position>;
      try {
        // Apply layout in Web Worker (non-blocking)
        positions = await graphWorkerService.computeLayout(
          scope.elements,
          scope.links,
          { layoutType, center, obstacles }
        );
      } catch (error) {
        console.error('[LayoutDropdown] Worker layout failed, falling back:', error);
        const result = layoutService.applyLayout(layoutType, scope.elements, scope.links, { center, obstacles });
        positions = Object.fromEntries(result.positions);
      }

      const newPositions: { id: string; position: Position }[] = [];
      for (const [id, pos] of Object.entries(positions)) {
        newPositions.push({ id, position: scope.toStoredPosition(id, pos) });
      }

      // Locked elements stayed put: move the whole new block off them
      const shift = avoidObstacles(
        newPositions.map(({ id, position }) => ({ ...position, ...scope.sizeOf(id) })),
        scope.obstacles,
      );
      if (shift.x !== 0 || shift.y !== 0) {
        for (const p of newPositions) {
          p.position = { x: p.position.x + shift.x, y: p.position.y + shift.y };
        }
      }

      if (newPositions.length > 0) {
        pushAction({
          type: 'move-elements',
          undo: { positions: oldPositions },
          redo: { positions: newPositions },
        });
        await updateElementPositions(newPositions);
        // Frame the result together with the locked elements it was placed around
        useViewStore.getState().requestFitView([
          ...newPositions.map((p) => p.id),
          ...elements.filter((el) => el.isPositionLocked && (!pool || pool.has(el.id))).map((el) => el.id),
        ]);
      }
    } finally {
      setIsApplying(false);
    }
  }, [elements, links, updateElementPositions, pushAction, selectedElementIds, activeTabId, tabMemberSet]);

  const layouts = layoutService.getAvailableLayouts();
  // Selected elements the layout would move (in a tab: its members only)
  let scopedSelectionCount = 0;
  for (const id of selectedElementIds) {
    if (activeTabId === null || tabMemberSet.has(id)) scopedSelectionCount++;
  }
  // In a tab: members that also belong to another tab. They have one position,
  // so laying this tab out pulls them out of the other tab's zone.
  let sharedCount = 0;
  if (isOpen && activeTabId !== null) {
    const inOtherTabs = new Set<string>();
    for (const tab of tabs) {
      if (tab.id !== activeTabId) for (const id of tab.memberElementIds) inOtherTabs.add(id);
    }
    const moving = scopedSelectionCount >= 2
      ? [...selectedElementIds].filter((id) => tabMemberSet.has(id))
      : tabMemberSet;
    for (const id of moving) if (inOtherTabs.has(id)) sharedCount++;
  }

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
            {scopedSelectionCount >= 2 && (
              <div className="px-3 pb-1.5 text-[10px] text-accent">
                {t('dossier.layout.scopeSelection', { count: scopedSelectionCount })}
              </div>
            )}
            {sharedCount > 0 && (
              <div className="px-3 pb-1.5 text-[10px] text-warning">
                {t('dossier.layout.sharedTabElements', { count: sharedCount })}
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
