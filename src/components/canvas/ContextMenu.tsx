import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Focus, Eye, EyeOff, Trash2, X, Route, Waypoints, Copy, CopyPlus, Scissors, Image, Group, Ungroup,
  BoxSelect, Lock, LockOpen, Layers, ArrowRight, ArrowDownLeft, Plus, Combine, Search, ScanSearch, Boxes, ExternalLink, Link2,
} from 'lucide-react';
import type { CanvasTab, TabId } from '../../types';
import type { ContextMenuExtension, MenuContext } from '../../types/plugins';
import { ContextMenuShell } from './contextMenu/ContextMenuShell';
import { usePluginMenuItems } from './contextMenu/usePluginMenuItems';
import { submenu, type MenuItem } from './contextMenu/types';
import { copyAsItem } from './contextMenu/copyAsItem';

interface ContextMenuProps {
  x: number;
  y: number;
  elementId: string;
  elementLabel: string;
  isHidden: boolean;
  hasPreviewableAsset: boolean;
  // For path finding when 2 elements are selected
  otherSelectedId?: string;
  otherSelectedLabel?: string;
  onFocus: (depth: number) => void;
  onHide: () => void;
  onShowOnly: () => void;
  onShow: () => void;
  onDelete: () => void;
  onCopy: () => void;
  onCut: () => void;
  onDuplicate: () => void;
  onCopyAsMermaid?: () => void;
  onCopyAsDot?: () => void;
  onPreview?: () => void;
  onFindPaths?: (fromId: string, toId: string) => void;
  onFindAllPaths?: (fromId: string, toId: string) => void;
  onMerge?: () => void;
  // Group actions
  isGroup: boolean;
  isInGroup: boolean;
  hasMultipleSelected: boolean;
  /** Elements selected; the menu acts on all of them when there are several */
  selectedCount: number;
  onGroupSelection?: () => void;
  /** Group the selection after packing it in a grid */
  onGroupGather?: () => void;
  /** Pack the members of the group under the menu in a grid */
  onGatherGroup?: () => void;
  onDissolveGroup: () => void;
  onRemoveFromGroup: () => void;
  // Position lock
  isPositionLocked: boolean;
  onToggleLock: () => void;
  // Tab assignment
  tabs: CanvasTab[];
  activeTabId: TabId | null;
  onAddToTab: (tabId: TabId) => void;
  /** Create a tab holding the selection and open it; absent when no more tab fits */
  onNewTabFromSelection?: () => void;
  /** Send to another tab and out of the active one; absent outside a tab */
  onMoveToTab?: (tabId: TabId) => void;
  /** A ghost into the open tab, out of the tabs it is in */
  onMoveHere?: () => void;
  onRemoveFromTab: () => void;
  isGhostElement: boolean;
  elementTabIds: TabId[];
  /** Tabs the view shows: the open one and those combined with it */
  viewTabIds?: TabId[];
  onGoToTab: (tabId: TabId) => void;
  // Query actions
  onFindSimilar?: () => void;
  onQueryFromSelection?: () => void;
  /** URL properties on the element (open / copy from the context menu) */
  urls?: { key: string; url: string }[];
  onOpenUrl?: (url: string) => void;
  onCopyUrl?: (url: string) => void;
  // Plugin extensions
  pluginExtensions?: readonly ContextMenuExtension[];
  menuContext?: MenuContext;
  onClose: () => void;
}

const focusDepthOptions = [
  { depth: 1, labelKey: 'dossier.contextMenu.focusNeighbors1' },
  { depth: 2, labelKey: 'dossier.contextMenu.focusNeighbors2' },
  { depth: 3, labelKey: 'dossier.contextMenu.focusNeighbors3' },
] as const;

function ContextMenuComponent({
  x,
  y,
  elementId,
  elementLabel,
  isHidden,
  hasPreviewableAsset,
  otherSelectedId,
  otherSelectedLabel,
  onFocus,
  onHide,
  onShowOnly,
  onShow,
  onDelete,
  onCopy,
  onCut,
  onDuplicate,
  onCopyAsMermaid,
  onCopyAsDot,
  onPreview,
  onFindPaths,
  onFindAllPaths,
  onMerge,
  isGroup,
  isInGroup,
  hasMultipleSelected,
  selectedCount,
  onGroupSelection,
  onGroupGather,
  onGatherGroup,
  onDissolveGroup,
  onRemoveFromGroup,
  isPositionLocked,
  onToggleLock,
  tabs,
  activeTabId,
  onAddToTab,
  onNewTabFromSelection,
  onMoveToTab,
  onMoveHere,
  onRemoveFromTab,
  isGhostElement,
  elementTabIds,
  viewTabIds = [],
  onGoToTab,
  onFindSimilar,
  onQueryFromSelection,
  urls,
  onOpenUrl,
  onCopyUrl,
  pluginExtensions,
  menuContext,
  onClose,
}: ContextMenuProps) {
  const { t } = useTranslation('pages');
  const cm = (key: string) => t(`dossier.contextMenu.${key}`);
  const hasTwoSelected = !!otherSelectedId && !!otherSelectedLabel;
  const pluginItems = usePluginMenuItems(pluginExtensions, menuContext);

  // ── URLs: one URL inline, several grouped under "Links (N)" ──
  let urlItems: MenuItem[] = [];
  if (urls && urls.length === 1 && onOpenUrl) {
    urlItems = [
      { id: 'open-url', label: cm('openUrl'), icon: ExternalLink, title: urls[0].url, onSelect: () => onOpenUrl(urls[0].url) },
      onCopyUrl && { id: 'copy-url', label: cm('copyUrl'), icon: Link2, title: urls[0].url, onSelect: () => onCopyUrl(urls[0].url) },
    ].filter(Boolean) as MenuItem[];
  } else if (urls && urls.length > 1 && onOpenUrl) {
    urlItems = [{
      id: 'urls',
      label: t('dossier.contextMenu.links', { count: urls.length }),
      icon: Link2,
      children: urls.flatMap((u, i) => [
        { id: `url-${i}-key`, label: u.key, title: u.url, kind: 'header' as const },
        { id: `url-${i}-open`, label: cm('openUrl'), icon: ExternalLink, title: u.url, onSelect: () => onOpenUrl(u.url) },
        ...(onCopyUrl ? [{ id: `url-${i}-copy`, label: cm('copyUrl'), icon: Link2, title: u.url, onSelect: () => onCopyUrl(u.url) }] : []),
      ]),
    }];
  }

  const focusItem: MenuItem | null = submenu('focus', cm('focusMode'), Focus, focusDepthOptions.map((o) => ({
        id: `focus-${o.depth}`,
        label: t(o.labelKey),
        icon: Focus,
        onSelect: () => onFocus(o.depth),
      })));

  const analyzeItem = submenu('analyze', cm('analyze'), ScanSearch, [
    hasTwoSelected && onFindPaths && { id: 'find-paths', label: cm('findPaths'), icon: Route, onSelect: () => onFindPaths(elementId, otherSelectedId!) },
    hasTwoSelected && onFindAllPaths && { id: 'find-all-paths', label: cm('findAllPaths'), icon: Waypoints, onSelect: () => onFindAllPaths(elementId, otherSelectedId!) },
    onFindSimilar && { id: 'find-similar', label: cm('findSimilar'), icon: Search, onSelect: onFindSimilar },
    onQueryFromSelection && { id: 'query-selection', label: cm('queryFromSelection'), icon: Search, onSelect: onQueryFromSelection },
  ]);

  const organizeItem = submenu('organize', cm('organize'), Boxes, [
    hasMultipleSelected && !isGroup && onGroupSelection && { id: 'group-selection', label: cm('groupSelection'), icon: Group, onSelect: onGroupSelection },
    hasMultipleSelected && !isGroup && onGroupGather && { id: 'group-gather', label: cm('groupGather'), icon: Group, onSelect: onGroupGather },
    isGroup && onGatherGroup && { id: 'gather-group', label: cm('gatherGroup'), icon: Group, onSelect: onGatherGroup },
    isGroup && { id: 'dissolve-group', label: cm('dissolveGroup'), icon: Ungroup, onSelect: onDissolveGroup },
    isInGroup && { id: 'remove-from-group', label: cm('removeFromGroup'), icon: BoxSelect, onSelect: onRemoveFromGroup },
    // Two elements or more selected (the caller passes onMerge only then)
    onMerge && { id: 'merge', label: cm('merge'), icon: Combine, onSelect: onMerge },
    {
      id: 'toggle-lock',
      label: isPositionLocked ? cm('unlockPosition') : cm('lockPosition'),
      icon: isPositionLocked ? LockOpen : Lock,
      onSelect: onToggleLock,
    },
  ]);

  // ── Tabs: go to source tab (ghosts), add to tab, remove from the active tab ──
  const tabsItem = tabs.length > 0 || onNewTabFromSelection ? submenu('tabs', cm('tabs'), Layers, [
    ...(isGhostElement
      ? elementTabIds
          .filter((tid) => tid !== activeTabId)
          .map((tid) => tabs.find((tab) => tab.id === tid))
          .filter((tab): tab is CanvasTab => !!tab)
          .map((tab) => ({
            id: `goto-tab-${tab.id}`,
            label: t('dossier.tabs.navigateTo', { name: tab.name }),
            icon: ArrowRight,
            onSelect: () => onGoToTab(tab.id),
          }))
      : []),
    isGhostElement && !!onMoveHere && {
      id: 'move-here',
      label: t('dossier.tabs.moveHere'),
      icon: ArrowDownLeft,
      onSelect: onMoveHere,
    },
    !!onNewTabFromSelection && {
      id: 'new-tab-from-selection',
      label: t('dossier.tabs.newFromSelection'),
      icon: Plus,
      onSelect: onNewTabFromSelection,
    },
    ...(onMoveToTab && tabs.some((tab) => tab.id !== activeTabId) ? [
      { id: 'move-to-tab-header', label: t('dossier.tabs.moveToTab'), kind: 'header' as const },
      ...tabs.filter((tab) => tab.id !== activeTabId).map((tab) => ({
        id: `move-to-tab-${tab.id}`,
        label: tab.name,
        icon: ArrowRight,
        onSelect: () => onMoveToTab(tab.id),
      })),
    ] : []),
    tabs.length > 0 && { id: 'add-to-tab-header', label: t('dossier.tabs.addToTab'), kind: 'header' as const },
    ...tabs.map((tab) => {
      const isInTab = elementTabIds.includes(tab.id);
      return {
        id: `add-to-tab-${tab.id}`,
        label: tab.name,
        icon: Layers,
        checked: isInTab,
        disabled: isInTab,
        onSelect: () => onAddToTab(tab.id),
      };
    }),
    // Any member of the tabs in view can leave them (it stays in "All"); a ghost is set aside
    !!activeTabId && (isGhostElement || elementTabIds.some((id) => viewTabIds.includes(id))) && {
      id: 'remove-from-tab',
      label: t('dossier.tabs.removeFromTab'),
      icon: X,
      onSelect: onRemoveFromTab,
    },
  ]) : null;

  return (
    <ContextMenuShell
      x={x}
      y={y}
      onClose={onClose}
      header={
        <span className="text-xs font-medium text-text-primary truncate block max-w-56">
          {hasTwoSelected
            ? `${elementLabel} ↔ ${otherSelectedLabel}`
            : selectedCount > 2
              ? t('dossier.toolbar.selectedCount', { count: selectedCount })
              : elementLabel}
        </span>
      }
      sections={[
        [
          hasPreviewableAsset && onPreview && { id: 'preview', label: cm('preview'), icon: Image, onSelect: onPreview },
          ...urlItems,
        ],
        [
          { id: 'copy', label: cm('copy'), icon: Copy, shortcut: 'Ctrl+C', onSelect: onCopy },
          { id: 'cut', label: cm('cut'), icon: Scissors, shortcut: 'Ctrl+X', onSelect: onCut },
          { id: 'duplicate', label: cm('duplicate'), icon: CopyPlus, shortcut: 'Ctrl+D', onSelect: onDuplicate },
          hasMultipleSelected && copyAsItem(cm, onCopyAsMermaid, onCopyAsDot),
        ],
        [
          focusItem,
          analyzeItem,
          organizeItem,
          tabsItem,
          isHidden
            ? { id: 'show', label: cm('showElement'), icon: Eye, onSelect: onShow }
            : { id: 'hide', label: hasMultipleSelected ? cm('hideSelection') : cm('hideElement'), icon: EyeOff, onSelect: onHide },
          { id: 'show-only', label: hasMultipleSelected ? cm('showOnlySelection') : cm('showOnlyElement'), icon: Eye, onSelect: onShowOnly },
        ],
        pluginItems,
        [{ id: 'delete', label: cm('delete'), icon: Trash2, danger: true, onSelect: onDelete }],
      ]}
    />
  );
}

export const ContextMenu = memo(ContextMenuComponent);
