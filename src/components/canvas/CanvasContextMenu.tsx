import { memo } from 'react';
import { Plus, Clipboard, Group, StickyNote, Copy, Scissors, CopyPlus, Trash2, EyeOff, Search, ScanSearch, Code } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ContextMenuExtension, MenuContext } from '../../types/plugins';
import { ContextMenuShell } from './contextMenu/ContextMenuShell';
import { usePluginMenuItems } from './contextMenu/usePluginMenuItems';
import { submenu } from './contextMenu/types';

interface CanvasContextMenuProps {
  x: number;
  y: number;
  // Create actions
  onCreateElement: () => void;
  onCreateGroup: () => void;
  onCreateAnnotation: () => void;
  onPaste: () => void;
  // Selection actions (when elements are selected)
  selectedCount?: number;
  onCopySelection?: () => void;
  onCutSelection?: () => void;
  onDuplicateSelection?: () => void;
  onDeleteSelection?: () => void;
  onHideSelection?: () => void;
  onGroupSelection?: () => void;
  onCopyAsMermaid?: () => void;
  // Query actions
  onFindSimilar?: () => void;
  onQueryFromSelection?: () => void;
  onClose: () => void;
  pluginExtensions?: ContextMenuExtension[];
  menuContext?: MenuContext;
}

function CanvasContextMenuComponent({
  x,
  y,
  onCreateElement,
  onCreateGroup,
  onCreateAnnotation,
  onPaste,
  selectedCount = 0,
  onCopySelection,
  onCutSelection,
  onDuplicateSelection,
  onDeleteSelection,
  onHideSelection,
  onGroupSelection,
  onCopyAsMermaid,
  onFindSimilar,
  onQueryFromSelection,
  onClose,
  pluginExtensions,
  menuContext,
}: CanvasContextMenuProps) {
  const { t } = useTranslation('pages');
  const cm = (key: string) => t(`dossier.contextMenu.${key}`);
  const hasSelection = selectedCount > 0;
  const pluginItems = usePluginMenuItems(pluginExtensions, menuContext);

  return (
    <ContextMenuShell
      x={x}
      y={y}
      minWidthClass="min-w-44"
      onClose={onClose}
      header={hasSelection ? (
        <span className="text-xs text-text-secondary">
          {t('dossier.toolbar.selectedCount', { count: selectedCount })}
        </span>
      ) : undefined}
      sections={[
        hasSelection ? [
          onCopySelection && { id: 'copy', label: cm('copy'), icon: Copy, shortcut: 'Ctrl+C', onSelect: onCopySelection },
          onCutSelection && { id: 'cut', label: cm('cut'), icon: Scissors, shortcut: 'Ctrl+X', onSelect: onCutSelection },
          onDuplicateSelection && { id: 'duplicate', label: cm('duplicate'), icon: CopyPlus, shortcut: 'Ctrl+D', onSelect: onDuplicateSelection },
          selectedCount > 1 && onCopyAsMermaid && { id: 'copy-mermaid', label: cm('copyAsMermaid'), icon: Code, onSelect: onCopyAsMermaid },
        ] : [],
        hasSelection ? [
          submenu('analyze', cm('analyze'), ScanSearch, [
            selectedCount === 1 && onFindSimilar && { id: 'find-similar', label: cm('findSimilar'), icon: Search, onSelect: onFindSimilar },
            selectedCount > 1 && onQueryFromSelection && { id: 'query-selection', label: cm('queryFromSelection'), icon: Search, onSelect: onQueryFromSelection },
          ]),
          selectedCount > 1 && onGroupSelection && { id: 'group', label: cm('group'), icon: Group, onSelect: onGroupSelection },
          onHideSelection && { id: 'hide', label: cm('hide'), icon: EyeOff, onSelect: onHideSelection },
        ] : [],
        [
          { id: 'add-element', label: cm('addElement'), icon: Plus, shortcut: 'E', onSelect: onCreateElement },
          { id: 'add-group', label: cm('addGroup'), icon: Group, shortcut: 'G', onSelect: onCreateGroup },
          { id: 'add-annotation', label: cm('addAnnotation'), icon: StickyNote, shortcut: 'N', onSelect: onCreateAnnotation },
        ],
        [{ id: 'paste', label: cm('paste'), icon: Clipboard, shortcut: 'Ctrl+V', onSelect: onPaste }],
        pluginItems,
        hasSelection && onDeleteSelection
          ? [{ id: 'delete', label: cm('delete'), icon: Trash2, danger: true, shortcut: 'Del', onSelect: onDeleteSelection }]
          : [],
      ]}
    />
  );
}

export const CanvasContextMenu = memo(CanvasContextMenuComponent);
