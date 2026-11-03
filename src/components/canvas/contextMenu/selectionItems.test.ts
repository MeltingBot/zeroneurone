import { describe, it, expect, vi } from 'vitest';
import { analyzeSubmenu, organizeSubmenu, selectFromItems, linkSelectionItem, focusSubmenu } from './selectionItems';

const cm = (key: string) => key;
const ids = (item: { children?: { id: string }[] } | null) => item?.children?.map((c) => c.id);

describe('selection menu entries', () => {
  it('offers paths only for a pair, from its first element to the second', () => {
    const onFindPaths = vi.fn();
    expect(analyzeSubmenu(cm, { onFindPaths, onSuggestLinks: () => {} })?.id).toBe('suggest-links');
    const analyze = analyzeSubmenu(cm, { pathPair: ['a', 'b'], onFindPaths, onSuggestLinks: () => {} });
    expect(ids(analyze)).toEqual(['find-paths', 'suggest-links']);
    analyze!.children![0].onSelect!();
    expect(onFindPaths).toHaveBeenCalledWith('a', 'b');
  });

  it('keeps one order for the organize entries, lock last', () => {
    const fn = () => {};
    const organize = organizeSubmenu(cm, {
      onToggleLock: fn, locked: true, onMerge: fn, onAddToGroup: fn, onGroup: fn, onGroupGather: fn,
    });
    expect(ids(organize)).toEqual(['group', 'group-gather', 'add-to-group', 'merge', 'toggle-lock']);
    expect(organize!.children!.at(-1)!.label).toBe('unlockPosition');
  });

  it('collapses a submenu of one entry and drops an empty one', () => {
    expect(organizeSubmenu(cm, { locked: false, onToggleLock: () => {} })?.label).toBe('lockPosition');
    expect(organizeSubmenu(cm, { locked: false })).toBeNull();
    expect(focusSubmenu(cm)).toBeNull();
    expect(ids(focusSubmenu(cm, () => {}))).toEqual(['focus-1', 'focus-2', 'focus-3']);
  });

  it('shows connect and the selection extensions only when available', () => {
    expect(linkSelectionItem(cm)).toBeNull();
    expect(linkSelectionItem(cm, () => {})?.label).toBe('linkSelection');
    expect(selectFromItems(cm, undefined, () => {}).map((i) => i.id)).toEqual(['select-links']);
    expect(selectFromItems(cm, () => {}, () => {}).map((i) => i.id)).toEqual(['select-neighbors', 'select-links']);
  });
});
