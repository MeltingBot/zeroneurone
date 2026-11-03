import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Eye, EyeOff, Trash2, X, Copy, CopyPlus, Scissors, Image, Layers, ArrowRight, ArrowDownLeft, Plus, ExternalLink, Link2,
} from 'lucide-react';
import type { CanvasTab, TabId } from '../../types';
import type { ContextMenuExtension, MenuContext } from '../../types/plugins';
import { ContextMenuShell } from './contextMenu/ContextMenuShell';
import { usePluginMenuItems } from './contextMenu/usePluginMenuItems';
import { submenu, type MenuItem } from './contextMenu/types';
import { copyAsItem } from './contextMenu/copyAsItem';
import { analyzeSubmenu, focusSubmenu, linkSelectionItem, organizeSubmenu, selectFromItems } from './contextMenu/selectionItems';

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
  /** Selects the element and opens its detail panel */
  onOpenDetail: () => void;
  onHide: () => void;
  onShowOnly: () => void;
  onShow: () => void;
  /** Elements hidden while the target is the only one shown: 0 otherwise */
  shownAloneHiddenCount?: number;
  onShowHidden?: () => void;
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
  /** Move the free elements of the selection into its one group */
  onAddToGroup?: () => void;
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
  onSuggestLinks?: () => void;
  /** Extend the selection to the linked elements, or to the links */
  onSelectNeighbors?: () => void;
  onSelectLinks?: () => void;
  /** Exactly two linkable elements selected: a link between them */
  onLinkSelection?: () => void;
  /** URL properties on the element (open / copy from the context menu) */
  urls?: { key: string; url: string }[];
  onOpenUrl?: (url: string) => void;
  onCopyUrl?: (url: string) => void;
  // Plugin extensions
  pluginExtensions?: readonly ContextMenuExtension[];
  menuContext?: MenuContext;
  onClose: () => void;
}

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
  onOpenDetail,
  onHide,
  onShowOnly,
  onShow,
  shownAloneHiddenCount = 0,
  onShowHidden,
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
  onAddToGroup,
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
  onSuggestLinks,
  onSelectNeighbors,
  onSelectLinks,
  onLinkSelection,
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

  const focusItem = focusSubmenu(cm, onFocus);

  const analyzeItem = analyzeSubmenu(cm, {
    pathPair: hasTwoSelected ? [elementId, otherSelectedId!] : null,
    onFindPaths,
    onFindAllPaths,
    onFindSimilar,
    onQueryFromSelection,
    onSuggestLinks,
  });

  const organizeItem = organizeSubmenu(cm, {
    onGroup: hasMultipleSelected && !isGroup ? onGroupSelection : undefined,
    onGroupGather: hasMultipleSelected && !isGroup ? onGroupGather : undefined,
    onAddToGroup,
    onGatherGroup: isGroup ? onGatherGroup : undefined,
    onDissolveGroup: isGroup ? onDissolveGroup : undefined,
    onRemoveFromGroup: isInGroup ? onRemoveFromGroup : undefined,
    // Two elements or more selected (the caller passes onMerge only then)
    onMerge,
    locked: isPositionLocked,
    onToggleLock,
  });

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
            ? `${elementLabel}, ${otherSelectedLabel}`
            : selectedCount > 2
              ? t('dossier.toolbar.selectedCount', { count: selectedCount })
              : elementLabel}
        </span>
      }
      onHeaderClick={!hasTwoSelected && selectedCount <= 1 ? onOpenDetail : undefined}
      headerTitle={cm('openDetail')}
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
        [linkSelectionItem(cm, onLinkSelection)],
        [
          focusItem,
          analyzeItem,
          organizeItem,
          tabsItem,
          // Already the only one shown: hiding it or showing it alone means nothing
          ...(shownAloneHiddenCount > 0 && onShowHidden
            ? [{ id: 'show-hidden', label: t('dossier.contextMenu.showHidden', { count: shownAloneHiddenCount }), icon: Eye, onSelect: onShowHidden }]
            : [
                isHidden
                  ? { id: 'show', label: cm('showElement'), icon: Eye, onSelect: onShow }
                  : { id: 'hide', label: cm('hide'), icon: EyeOff, onSelect: onHide },
                { id: 'show-only', label: cm('showOnly'), icon: Eye, onSelect: onShowOnly },
              ]),
        ],
        selectFromItems(cm, onSelectNeighbors, onSelectLinks),
        pluginItems,
        [{ id: 'delete', label: cm('delete'), icon: Trash2, danger: true, onSelect: onDelete }],
      ]}
    />
  );
}

export const ContextMenu = memo(ContextMenuComponent);
