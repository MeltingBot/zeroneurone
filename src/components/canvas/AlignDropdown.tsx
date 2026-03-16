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
import { useReactFlow } from '@xyflow/react';
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

// Default node dimensions for distribute when measured size unavailable
const DEFAULT_NODE_WIDTH = 120;
const DEFAULT_NODE_HEIGHT = 60;

function computeAlignedPositions(
  action: AlignAction,
  selected: { id: string; position: Position; width?: number; height?: number }[],
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
      const totalWidths = sorted.reduce((sum, el) => sum + (el.width || DEFAULT_NODE_WIDTH), 0);
      const minX = sorted[0].position.x;
      const maxX = sorted[sorted.length - 1].position.x + (sorted[sorted.length - 1].width || DEFAULT_NODE_WIDTH);
      const availableSpace = Math.max(maxX - minX - totalWidths, 0);
      const gap = availableSpace / (sorted.length - 1);
      let currentX = minX;
      return sorted.map((el) => {
        const pos = { id: el.id, position: { x: currentX, y: el.position.y } };
        currentX += (el.width || DEFAULT_NODE_WIDTH) + gap;
        return pos;
      });
    }
    case 'distributeV': {
      if (selected.length < 3) return [];
      const sorted = [...selected].sort((a, b) => a.position.y - b.position.y);
      const totalHeights = sorted.reduce((sum, el) => sum + (el.height || DEFAULT_NODE_HEIGHT), 0);
      const minY = sorted[0].position.y;
      const maxY = sorted[sorted.length - 1].position.y + (sorted[sorted.length - 1].height || DEFAULT_NODE_HEIGHT);
      const availableSpace = Math.max(maxY - minY - totalHeights, 0);
      const gap = availableSpace / (sorted.length - 1);
      let currentY = minY;
      return sorted.map((el) => {
        const pos = { id: el.id, position: { x: el.position.x, y: currentY } };
        currentY += (el.height || DEFAULT_NODE_HEIGHT) + gap;
        return pos;
      });
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
  const { getNodes } = useReactFlow();

  // Build list of selected elements with labels for the reference picker (exclude groups)
  const selectedElements = useMemo(() => {
    const ids = Array.from(selectedElementIds);
    return elements
      .filter(el => ids.includes(el.id) && !el.isGroup)
      .map(el => ({ id: el.id, label: el.label || t('empty.unnamed') }));
  }, [elements, selectedElementIds, t]);

  const selectedCount = selectedElements.length;
  const hasKeyObject = lastClickedElementId !== null && selectedElementIds.has(lastClickedElementId) && selectedCount > 1;

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside, true); // capture phase
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
    };
  }, [isOpen]);

  // Close dropdown when selection changes (e.g. clicking canvas nodes)
  useEffect(() => {
    if (isOpen) setIsOpen(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedElementIds]);

  const handleAlign = useCallback(async (action: AlignAction) => {
    setIsOpen(false);

    const ids = Array.from(selectedElementIds);
    // Exclude group frames from alignment — only align their children
    const selectedEls = elements.filter(el => ids.includes(el.id) && !el.isGroup);

    if (selectedEls.length < 2) return;

    // Build a map of group positions for converting relative → absolute
    const groupPositionMap = new Map<string, Position>();
    for (const el of elements) {
      if (el.isGroup) groupPositionMap.set(el.id, el.position);
    }

    // Convert positions to absolute for alignment computation
    const toAbsolute = (el: { position: Position; parentGroupId?: string | null }): Position => {
      if (el.parentGroupId) {
        const gp = groupPositionMap.get(el.parentGroupId);
        if (gp) return { x: el.position.x + gp.x, y: el.position.y + gp.y };
      }
      return el.position;
    };

    const toRelativeOffset = (el: { parentGroupId?: string | null }): Position => {
      if (el.parentGroupId) {
        const gp = groupPositionMap.get(el.parentGroupId);
        if (gp) return gp;
      }
      return { x: 0, y: 0 };
    };

    // Get measured dimensions from React Flow nodes
    const rfNodes = getNodes();
    const nodeDims = new Map<string, { width: number; height: number }>();
    for (const n of rfNodes) {
      if (n.measured?.width && n.measured?.height) {
        nodeDims.set(n.id, { width: n.measured.width, height: n.measured.height });
      }
    }

    const selected = selectedEls.map(el => {
      const dims = nodeDims.get(el.id);
      return {
        id: el.id,
        position: toAbsolute(el),
        width: dims?.width,
        height: dims?.height,
        _offset: toRelativeOffset(el),
        _origPosition: { ...el.position },
      };
    });

    const keyId = hasKeyObject ? lastClickedElementId : null;
    const newAbsolutePositions = computeAlignedPositions(action, selected, keyId);
    if (newAbsolutePositions.length === 0) return;

    // Convert back to relative positions (subtract parent group offset)
    const newPositions = newAbsolutePositions.map(np => {
      const orig = selected.find(s => s.id === np.id);
      const offset = orig?._offset ?? { x: 0, y: 0 };
      return { id: np.id, position: { x: np.position.x - offset.x, y: np.position.y - offset.y } };
    });

    const oldPositions = selectedEls.map(el => ({ id: el.id, position: { ...el.position } }));

    pushAction({
      type: 'move-elements',
      undo: { positions: oldPositions },
      redo: { positions: newPositions },
    });

    await updateElementPositions(newPositions);
  }, [elements, selectedElementIds, lastClickedElementId, hasKeyObject, updateElementPositions, pushAction, getNodes]);

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
