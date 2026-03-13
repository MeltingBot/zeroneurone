import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlignHorizontalJustifyCenter,
  ChevronDown,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignHorizontalSpaceBetween,
  AlignVerticalSpaceBetween,
  Anchor,
} from 'lucide-react';
import { useDossierStore, useHistoryStore, useSelectionStore } from '../../stores';
import type { Position } from '../../types';

type AlignAction = 'left' | 'centerH' | 'right' | 'top' | 'centerV' | 'bottom' | 'distributeH' | 'distributeV';

const ALIGN_ICONS: Record<AlignAction, typeof AlignStartVertical> = {
  left: AlignStartVertical,
  centerH: AlignCenterVertical,
  right: AlignEndVertical,
  top: AlignStartHorizontal,
  centerV: AlignCenterHorizontal,
  bottom: AlignEndHorizontal,
  distributeH: AlignHorizontalSpaceBetween,
  distributeV: AlignVerticalSpaceBetween,
};

const ALIGN_ACTIONS: AlignAction[] = ['left', 'centerH', 'right', 'top', 'centerV', 'bottom'];
const DISTRIBUTE_ACTIONS: AlignAction[] = ['distributeH', 'distributeV'];

function computeAlignedPositions(
  action: AlignAction,
  selected: { id: string; position: Position }[],
  keyObjectId: string | null,
): { id: string; position: Position }[] {
  if (selected.length < 2) return [];

  const keyObject = keyObjectId ? selected.find(el => el.id === keyObjectId) : null;

  switch (action) {
    case 'left': {
      const target = keyObject ? keyObject.position.x : Math.min(...selected.map(el => el.position.x));
      return selected.map(el => ({ id: el.id, position: { x: target, y: el.position.y } }));
    }
    case 'centerH': {
      const xs = selected.map(el => el.position.x);
      const target = keyObject ? keyObject.position.x : xs.reduce((a, b) => a + b, 0) / xs.length;
      return selected.map(el => ({ id: el.id, position: { x: target, y: el.position.y } }));
    }
    case 'right': {
      const target = keyObject ? keyObject.position.x : Math.max(...selected.map(el => el.position.x));
      return selected.map(el => ({ id: el.id, position: { x: target, y: el.position.y } }));
    }
    case 'top': {
      const target = keyObject ? keyObject.position.y : Math.min(...selected.map(el => el.position.y));
      return selected.map(el => ({ id: el.id, position: { x: el.position.x, y: target } }));
    }
    case 'centerV': {
      const ys = selected.map(el => el.position.y);
      const target = keyObject ? keyObject.position.y : ys.reduce((a, b) => a + b, 0) / ys.length;
      return selected.map(el => ({ id: el.id, position: { x: el.position.x, y: target } }));
    }
    case 'bottom': {
      const target = keyObject ? keyObject.position.y : Math.max(...selected.map(el => el.position.y));
      return selected.map(el => ({ id: el.id, position: { x: el.position.x, y: target } }));
    }
    case 'distributeH': {
      if (selected.length < 3) return [];
      const sorted = [...selected].sort((a, b) => a.position.x - b.position.x);
      const minX = sorted[0].position.x;
      const maxX = sorted[sorted.length - 1].position.x;
      const step = (maxX - minX) / (sorted.length - 1);
      return sorted.map((el, i) => ({ id: el.id, position: { x: minX + i * step, y: el.position.y } }));
    }
    case 'distributeV': {
      if (selected.length < 3) return [];
      const sorted = [...selected].sort((a, b) => a.position.y - b.position.y);
      const minY = sorted[0].position.y;
      const maxY = sorted[sorted.length - 1].position.y;
      const step = (maxY - minY) / (sorted.length - 1);
      return sorted.map((el, i) => ({ id: el.id, position: { x: el.position.x, y: minY + i * step } }));
    }
    default:
      return [];
  }
}

export function AlignDropdown() {
  const { t } = useTranslation('pages');
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { elements, updateElementPositions } = useDossierStore();
  const { pushAction } = useHistoryStore();
  const selectedElementIds = useSelectionStore(s => s.selectedElementIds);
  const lastClickedElementId = useSelectionStore(s => s.lastClickedElementId);

  const selectedCount = selectedElementIds.size;
  const hasKeyObject = lastClickedElementId !== null && selectedElementIds.has(lastClickedElementId) && selectedCount > 1;

  // Build list of selected elements with labels for the reference picker
  const selectedElements = useMemo(() => {
    const ids = Array.from(selectedElementIds);
    return elements
      .filter(el => ids.includes(el.id))
      .map(el => ({ id: el.id, label: el.label || t('empty.unnamed') }));
  }, [elements, selectedElementIds, t]);

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

  const handleAlign = useCallback(async (action: AlignAction) => {
    setIsOpen(false);

    const ids = Array.from(selectedElementIds);
    const selected = elements
      .filter(el => ids.includes(el.id))
      .map(el => ({ id: el.id, position: { ...el.position } }));

    if (selected.length < 2) return;

    const keyId = hasKeyObject ? lastClickedElementId : null;
    const newPositions = computeAlignedPositions(action, selected, keyId);
    if (newPositions.length === 0) return;

    const oldPositions = selected.map(el => ({ id: el.id, position: el.position }));

    pushAction({
      type: 'move-elements',
      undo: { positions: oldPositions },
      redo: { positions: newPositions },
    });

    await updateElementPositions(newPositions);
  }, [elements, selectedElementIds, lastClickedElementId, hasKeyObject, updateElementPositions, pushAction]);

  const handleSetKeyObject = useCallback((id: string) => {
    useSelectionStore.setState({
      lastClickedElementId: lastClickedElementId === id ? null : id,
    });
  }, [lastClickedElementId]);

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={selectedCount < 2}
        className="flex items-center gap-1 px-2 h-7 text-xs text-text-secondary hover:bg-bg-tertiary rounded border border-border-default disabled:opacity-50 disabled:cursor-not-allowed"
        title={t('dossier.align.buttonTitle')}
      >
        <AlignHorizontalJustifyCenter size={14} />
        <span className="hidden sm:inline">{t('dossier.align.button')}</span>
        <ChevronDown size={12} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-56 bg-bg-primary border border-border-default rounded shadow-lg z-50 max-h-[70vh] overflow-y-auto">
          {/* Reference object picker */}
          <div className="py-1 border-b border-border-default">
            <div className="px-3 py-1.5 text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">
              {t('dossier.align.sectionReference')}
            </div>
            <div className={selectedElements.length > 5 ? 'max-h-40 overflow-y-auto' : ''}>
            {selectedElements.map((el) => {
              const isRef = lastClickedElementId === el.id;
              return (
                <button
                  key={el.id}
                  onClick={() => handleSetKeyObject(el.id)}
                  className={`w-full px-3 py-1 text-left hover:bg-bg-secondary flex items-center gap-2 ${isRef ? 'bg-accent/5' : ''}`}
                >
                  {isRef && <Anchor size={12} className="text-accent flex-shrink-0" />}
                  <span className={`text-xs truncate ${isRef ? 'text-accent font-medium' : 'text-text-secondary'}`}>
                    {el.label}
                  </span>
                </button>
              );
            })}
            </div>
          </div>

          {/* Align actions */}
          <div className="py-1">
            <div className="px-3 py-1.5 text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">
              {t('dossier.align.sectionAlign')}
            </div>
            {ALIGN_ACTIONS.map((action) => {
              const Icon = ALIGN_ICONS[action];
              return (
                <button
                  key={action}
                  onClick={() => handleAlign(action)}
                  className="w-full px-3 py-1.5 text-left hover:bg-bg-secondary flex items-center gap-2"
                >
                  <Icon size={14} className="text-text-tertiary" />
                  <span className="text-sm text-text-primary">
                    {t(`dossier.align.${action}`)}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Distribute actions */}
          <div className="border-t border-border-default py-1">
            <div className="px-3 py-1.5 text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">
              {t('dossier.align.sectionDistribute')}
            </div>
            {DISTRIBUTE_ACTIONS.map((action) => {
              const Icon = ALIGN_ICONS[action];
              return (
                <button
                  key={action}
                  onClick={() => handleAlign(action)}
                  disabled={selectedCount < 3}
                  className="w-full px-3 py-1.5 text-left hover:bg-bg-secondary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Icon size={14} className="text-text-tertiary" />
                  <span className="text-sm text-text-primary">
                    {t(`dossier.align.${action}`)}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Footer hint */}
          <div className="border-t border-border-default px-3 py-2">
            <p className="text-[10px] text-text-tertiary">
              {t('dossier.align.undoHint')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
