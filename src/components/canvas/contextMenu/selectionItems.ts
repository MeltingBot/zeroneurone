import {
  Focus, Route, Waypoints, Search, ScanSearch, Lightbulb, Boxes, Group, Ungroup, SquarePlus, BoxSelect,
  Combine, Lock, LockOpen, Spline, Share2, Cable,
} from 'lucide-react';
import { submenu, type MenuItem } from './types';

/**
 * Entries shared by the element menu and the selection menu (lasso, canvas
 * with a selection): the same selection gets the same actions, at the same
 * place, whatever was right-clicked.
 */

type Translate = (key: string) => string;

const FOCUS_DEPTHS = [1, 2, 3] as const;

export function focusSubmenu(cm: Translate, onFocus?: (depth: number) => void): MenuItem | null {
  if (!onFocus) return null;
  return submenu('focus', cm('focusMode'), Focus, FOCUS_DEPTHS.map((depth) => ({
    id: `focus-${depth}`,
    label: cm(`focusNeighbors${depth}`),
    icon: Focus,
    onSelect: () => onFocus(depth),
  })));
}

export interface AnalyzeOptions {
  /** Exactly two elements: [the one under the menu or the first, the other] */
  pathPair?: [string, string] | null;
  onFindPaths?: (fromId: string, toId: string) => void;
  onFindAllPaths?: (fromId: string, toId: string) => void;
  onFindSimilar?: () => void;
  onQueryFromSelection?: () => void;
  onSuggestLinks?: () => void;
}

export function analyzeSubmenu(cm: Translate, o: AnalyzeOptions): MenuItem | null {
  const pair = o.pathPair;
  return submenu('analyze', cm('analyze'), ScanSearch, [
    pair && o.onFindPaths && { id: 'find-paths', label: cm('findPaths'), icon: Route, onSelect: () => o.onFindPaths!(pair[0], pair[1]) },
    pair && o.onFindAllPaths && { id: 'find-all-paths', label: cm('findAllPaths'), icon: Waypoints, onSelect: () => o.onFindAllPaths!(pair[0], pair[1]) },
    o.onFindSimilar && { id: 'find-similar', label: cm('findSimilar'), icon: Search, onSelect: o.onFindSimilar },
    o.onQueryFromSelection && { id: 'query-selection', label: cm('queryFromSelection'), icon: Search, onSelect: o.onQueryFromSelection },
    o.onSuggestLinks && { id: 'suggest-links', label: cm('suggestLinks'), icon: Lightbulb, onSelect: o.onSuggestLinks },
  ]);
}

export interface OrganizeOptions {
  /** Two elements or more, no group among the targets */
  onGroup?: () => void;
  onGroupGather?: () => void;
  onAddToGroup?: () => void;
  /** The target is a group */
  onGatherGroup?: () => void;
  onDissolveGroup?: () => void;
  /** The target is in a group */
  onRemoveFromGroup?: () => void;
  onMerge?: () => void;
  locked: boolean;
  onToggleLock?: () => void;
}

export function organizeSubmenu(cm: Translate, o: OrganizeOptions): MenuItem | null {
  return submenu('organize', cm('organize'), Boxes, [
    o.onGroup && { id: 'group', label: cm('group'), icon: Group, onSelect: o.onGroup },
    o.onGroupGather && { id: 'group-gather', label: cm('groupGather'), icon: Group, onSelect: o.onGroupGather },
    o.onAddToGroup && { id: 'add-to-group', label: cm('addToGroup'), icon: SquarePlus, onSelect: o.onAddToGroup },
    o.onGatherGroup && { id: 'gather-group', label: cm('gatherGroup'), icon: Group, onSelect: o.onGatherGroup },
    o.onDissolveGroup && { id: 'dissolve-group', label: cm('dissolveGroup'), icon: Ungroup, onSelect: o.onDissolveGroup },
    o.onRemoveFromGroup && { id: 'remove-from-group', label: cm('removeFromGroup'), icon: BoxSelect, onSelect: o.onRemoveFromGroup },
    o.onMerge && { id: 'merge', label: cm('merge'), icon: Combine, onSelect: o.onMerge },
    o.onToggleLock && {
      id: 'toggle-lock',
      label: o.locked ? cm('unlockPosition') : cm('lockPosition'),
      icon: o.locked ? LockOpen : Lock,
      onSelect: o.onToggleLock,
    },
  ]);
}

/** "Connect": a link between the two selected elements */
export function linkSelectionItem(cm: Translate, onLink?: () => void): MenuItem | null {
  return onLink ? { id: 'link-selection', label: cm('linkSelection'), icon: Cable, onSelect: onLink } : null;
}

/** Extend the selection: linked elements, links */
export function selectFromItems(cm: Translate, onSelectNeighbors?: () => void, onSelectLinks?: () => void): MenuItem[] {
  return [
    onSelectNeighbors && { id: 'select-neighbors', label: cm('selectNeighbors'), icon: Share2, onSelect: onSelectNeighbors },
    onSelectLinks && { id: 'select-links', label: cm('selectLinks'), icon: Spline, onSelect: onSelectLinks },
  ].filter(Boolean) as MenuItem[];
}
