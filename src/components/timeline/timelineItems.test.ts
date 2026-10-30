import { describe, it, expect } from 'vitest';
import type { Element, Link } from '../../types';
import { buildTimelineItems, type TimelineItemsInput } from './timelineItems';

function element(id: string, events: { id: string; date: Date; label?: string }[] = []): Element {
  return {
    id, label: id, tags: [], properties: [], events,
    visual: { color: '#fcd34d', shape: 'circle' }, createdAt: new Date(2024, 0, 1),
  } as unknown as Element;
}

function input(overrides: Partial<TimelineItemsInput> = {}): TimelineItemsInput {
  return {
    elements: [], links: [], comments: [],
    viewHiddenIds: new Set(), dimmedElementIds: new Set(),
    activeTabId: null, tabMemberSet: new Set(), tabGhostIds: new Set(),
    queryFilterActive: false, queryMatchLinkIds: new Set(),
    showCreatedAt: false,
    includedDateProperties: undefined, excludedDateProperties: undefined, dateRangeProperties: undefined,
    t: (key) => key, language: 'fr',
    ...overrides,
  } as TimelineItemsInput;
}

describe('buildTimelineItems', () => {
  const a = element('a', [{ id: 'ev1', date: new Date(2024, 2, 15), label: 'Rencontre' }]);
  const b = element('b', [{ id: 'ev2', date: new Date(2024, 5, 1) }]);
  const link = { id: 'l1', fromId: 'a', toId: 'b', label: 'appel', dateRange: { start: new Date(2024, 3, 10) }, visual: { color: '#999' } } as unknown as Link;

  it('turns element events and dated links into items, within the time bounds', () => {
    const { items, timeBounds } = buildTimelineItems(input({ elements: [a, b], links: [link] }));
    expect(items.map((i) => i.type).sort()).toEqual(['event', 'event', 'link']);
    for (const item of items) {
      expect(item.start.getTime()).toBeGreaterThanOrEqual(timeBounds.min.getTime());
      expect(item.start.getTime()).toBeLessThanOrEqual(timeBounds.max.getTime());
    }
  });

  it('leaves out hidden elements and what lies outside the open tab', () => {
    expect(buildTimelineItems(input({ elements: [a, b], viewHiddenIds: new Set(['a']) })).items.map((i) => i.sourceId)).toEqual(['b']);
    expect(buildTimelineItems(input({ elements: [a, b], activeTabId: 't', tabMemberSet: new Set(['b']) })).items.map((i) => i.sourceId)).toEqual(['b']);
  });
});
