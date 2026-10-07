import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Focus, Eye, EyeOff, Trash2, X, Route, Waypoints, Copy, CopyPlus, Scissors, Image, Group, Ungroup,
  BoxSelect, Lock, LockOpen, Layers, ArrowRight, Combine, Search, ScanSearch, Boxes, ExternalLink, Link2, Code,
} from 'lucide-react';
import type { CanvasTab, TabId } from '../../types';
import type { ContextMenuExtension, MenuContext } from '../../types/plugins';
import { ContextMenuShell } from './contextMenu/ContextMenuShell';
import { usePluginMenuItems } from './contextMenu/usePluginMenuItems';
import { submenu, type MenuItem } from './contextMenu/types';

interface ContextMenuProps {
  x: number;
  y: number;
  elementId: string;
  elementLabel: string;
  isFocused: boolean;
  isHidden: boolean;
  hasPreviewableAsset: boolean;
  // For path finding when 2 elements are selected
  otherSelectedId?: string;
  otherSelectedLabel?: string;
  onFocus: (depth: number) => void;
  onClearFocus: () => void;
  onHide: () => void;
  onShow: () => void;
  onDelete: () => void;
  onCopy: () => void;
  onCut: () => void;
  onDuplicate: () => void;
  onCopyAsMermaid?: () => void;
  onPreview?: () => void;
  onFindPaths?: (fromId: string, toId: string) => void;
  onFindAllPaths?: (fromId: string, toId: string) => void;
  onMerge?: () => void;
  // Group actions
  isGroup: boolean;
  isInGroup: boolean;
  hasMultipleSelected: boolean;
  onGroupSelection?: () => void;
  onDissolveGroup: () => void;
  onRemoveFromGroup: () => void;
  // Position lock
  isPositionLocked: boolean;
  onToggleLock: () => void;
  // Tab assignment
  tabs: CanvasTab[];
  activeTabId: TabId | null;
  onAddToTab: (tabId: TabId) => void;
  onRemoveFromTab: () => void;
  isGhostElement: boolean;
  elementTabIds: TabId[];
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
  isFocused,
  isHidden,
  hasPreviewableAsset,
  otherSelectedId,
  otherSelectedLabel,
  onFocus,
  onClearFocus,
  onHide,
  onShow,
  onDelete,
  onCopy,
  onCut,
  onDuplicate,
  onCopyAsMermaid,
  onPreview,
  onFindPaths,
  onFindAllPaths,
  onMerge,
  isGroup,
  isInGroup,
  hasMultipleSelected,
  onGroupSelection,
  onDissolveGroup,
  onRemoveFromGroup,
  isPositionLocked,
  onToggleLock,
  tabs,
  activeTabId,
  onAddToTab,
  onRemoveFromTab,
  isGhostElement,
  elementTabIds,
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

  const focusItem: MenuItem | null = isFocused
    ? { id: 'exit-focus', label: cm('exitFocus'), icon: X, onSelect: onClearFocus }
    : submenu('focus', cm('focusMode'), Focus, focusDepthOptions.map((o) => ({
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
    isGroup && { id: 'dissolve-group', label: cm('dissolveGroup'), icon: Ungroup, onSelect: onDissolveGroup },
    isInGroup && { id: 'remove-from-group', label: cm('removeFromGroup'), icon: BoxSelect, onSelect: onRemoveFromGroup },
    hasTwoSelected && onMerge && { id: 'merge', label: cm('merge'), icon: Combine, onSelect: onMerge },
    {
      id: 'toggle-lock',
      label: isPositionLocked ? cm('unlockPosition') : cm('lockPosition'),
      icon: isPositionLocked ? LockOpen : Lock,
      onSelect: onToggleLock,
    },
  ]);

  // ── Tabs: go to source tab (ghosts), add to tab, remove from the active tab ──
  const tabsItem = tabs.length > 0 ? submenu('tabs', cm('tabs'), Layers, [
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
    { id: 'add-to-tab-header', label: t('dossier.tabs.addToTab'), kind: 'header' as const },
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
    // Remove: ghost → dismiss, member in >1 tab → unassign
    !!activeTabId && (isGhostElement || (elementTabIds.includes(activeTabId) && elementTabIds.length > 1)) && {
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
          {hasTwoSelected ? `${elementLabel} ↔ ${otherSelectedLabel}` : elementLabel}
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
          hasMultipleSelected && onCopyAsMermaid && { id: 'copy-mermaid', label: cm('copyAsMermaid'), icon: Code, onSelect: onCopyAsMermaid },
        ],
        [
          focusItem,
          analyzeItem,
          organizeItem,
          tabsItem,
          isHidden
            ? { id: 'show', label: cm('showElement'), icon: Eye, onSelect: onShow }
            : { id: 'hide', label: hasMultipleSelected ? cm('hideSelection') : cm('hideElement'), icon: EyeOff, onSelect: onHide },
        ],
        pluginItems,
        [{ id: 'delete', label: cm('delete'), icon: Trash2, danger: true, onSelect: onDelete }],
      ]}
    />
  );
}

export const ContextMenu = memo(ContextMenuComponent);
