import { memo } from 'react';
import { Plus, Clipboard, Group, StickyNote, Copy, Scissors, CopyPlus, Trash2, EyeOff, Search, ScanSearch, Spline, Lightbulb, Lock, LockOpen, Layers, ArrowRight, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { CanvasTab, TabId } from '../../types';
import type { ContextMenuExtension, MenuContext } from '../../types/plugins';
import { ContextMenuShell } from './contextMenu/ContextMenuShell';
import { usePluginMenuItems } from './contextMenu/usePluginMenuItems';
import { submenu } from './contextMenu/types';
import { copyAsItem } from './contextMenu/copyAsItem';

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
  // Position lock: "unlock" when every selected element is already locked
  selectionLocked?: boolean;
  onToggleLockSelection?: () => void;
  onGroupSelection?: () => void;
  /** Group the selection after packing it in a grid */
  onGroupGather?: () => void;
  onCopyAsMermaid?: () => void;
  onCopyAsDot?: () => void;
  // Query actions
  onFindSimilar?: () => void;
  onQueryFromSelection?: () => void;
  // Select the links of the selection (all links when nothing is selected)
  onSelectLinks?: () => void;
  // Link suggestions restricted to the selection
  onSuggestLinks?: () => void;
  // Canvas tabs: add the selection to one, or make a new one from it
  tabs?: CanvasTab[];
  onAddSelectionToTab?: (tabId: TabId) => void;
  onNewTabFromSelection?: () => void;
  activeTabId?: TabId | null;
  /** Send the selection to another tab and out of the active one; absent outside a tab */
  onMoveSelectionToTab?: (tabId: TabId) => void;
  /** Take the selection out of the open tab; absent outside a tab */
  onRemoveSelectionFromTab?: () => void;
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
  selectionLocked = false,
  onToggleLockSelection,
  onGroupSelection,
  onGroupGather,
  onCopyAsMermaid,
  onCopyAsDot,
  onFindSimilar,
  onQueryFromSelection,
  onSelectLinks,
  onSuggestLinks,
  tabs = [],
  onAddSelectionToTab,
  onNewTabFromSelection,
  activeTabId = null,
  onMoveSelectionToTab,
  onRemoveSelectionFromTab,
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
          selectedCount > 1 && copyAsItem(cm, onCopyAsMermaid, onCopyAsDot),
        ] : [],
        hasSelection ? [
          submenu('analyze', cm('analyze'), ScanSearch, [
            selectedCount === 1 && onFindSimilar && { id: 'find-similar', label: cm('findSimilar'), icon: Search, onSelect: onFindSimilar },
            selectedCount > 1 && onQueryFromSelection && { id: 'query-selection', label: cm('queryFromSelection'), icon: Search, onSelect: onQueryFromSelection },
            onSuggestLinks && { id: 'suggest-links', label: cm('suggestLinks'), icon: Lightbulb, onSelect: onSuggestLinks },
          ]),
          selectedCount > 1 && onGroupSelection && { id: 'group', label: cm('group'), icon: Group, onSelect: onGroupSelection },
          selectedCount > 1 && onGroupGather && { id: 'group-gather', label: cm('groupGather'), icon: Group, onSelect: onGroupGather },
          (onNewTabFromSelection || onRemoveSelectionFromTab || (tabs.length > 0 && onAddSelectionToTab)) && submenu('tabs', cm('tabs'), Layers, [
            onNewTabFromSelection && {
              id: 'new-tab-from-selection',
              label: t('dossier.tabs.newFromSelection'),
              icon: Plus,
              onSelect: onNewTabFromSelection,
            },
            ...(onMoveSelectionToTab && tabs.some((tab) => tab.id !== activeTabId) ? [
              { id: 'move-to-tab-header', label: t('dossier.tabs.moveToTab'), kind: 'header' as const },
              ...tabs.filter((tab) => tab.id !== activeTabId).map((tab) => ({
                id: `move-to-tab-${tab.id}`,
                label: tab.name,
                icon: ArrowRight,
                onSelect: () => onMoveSelectionToTab(tab.id),
              })),
            ] : []),
            tabs.length > 0 && onAddSelectionToTab && { id: 'add-to-tab-header', label: t('dossier.tabs.addToTab'), kind: 'header' as const },
            ...(onAddSelectionToTab ? tabs.map((tab) => ({
              id: `add-to-tab-${tab.id}`,
              label: tab.name,
              icon: Layers,
              onSelect: () => onAddSelectionToTab(tab.id),
            })) : []),
            onRemoveSelectionFromTab && {
              id: 'remove-from-tab',
              label: t('dossier.tabs.removeFromTab'),
              icon: X,
              onSelect: onRemoveSelectionFromTab,
            },
          ]),
          onHideSelection && { id: 'hide', label: cm('hide'), icon: EyeOff, onSelect: onHideSelection },
          onToggleLockSelection && {
            id: 'lock',
            label: selectionLocked ? cm('unlockPosition') : cm('lockPosition'),
            icon: selectionLocked ? LockOpen : Lock,
            onSelect: onToggleLockSelection,
          },
        ] : [],
        onSelectLinks ? [
          { id: 'select-links', label: cm(hasSelection ? 'selectLinks' : 'selectAllLinks'), icon: Spline, shortcut: hasSelection ? undefined : 'Ctrl+Shift+A', onSelect: onSelectLinks },
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
