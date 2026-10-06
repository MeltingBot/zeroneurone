import { describe, it, expect } from 'vitest';
import type { Element, ElementEvent, Link } from '../types';
import {
  computeCanvasTemporalClassification,
  closestDateIndex,
  collectTemporalDates,
  eventInterval,
  linkInterval,
  shiftNavigator,
  summarizeActiveEvents,
  overlaps,
} from './temporalUtils';

function el(id: string, events: Partial<ElementEvent>[] = [], extra: Partial<Element> = {}): Element {
  return {
    id,
    events: events.map((e, i) => ({ id: `${id}-ev${i}`, label: `ev${i}`, ...e })),
    dateRange: null,
    date: null,
    isGroup: false,
    isAnnotation: false,
    ...extra,
  } as unknown as Element;
}

function link(id: string, fromId: string, toId: string, extra: Partial<Link> = {}): Link {
  return { id, fromId, toId, date: null, dateRange: null, ...extra } as unknown as Link;
}

const d = (s: string) => new Date(s);

describe('intervals', () => {
  it('treats a day-only point event as the whole day', () => {
    const i = eventInterval({ id: 'e', label: 'x', date: d('2024-03-12T00:00:00') })!;
    expect(overlaps(i, { from: d('2024-03-12T18:00:00').getTime(), until: d('2024-03-12T19:00:00').getTime() })).toBe(true);
    expect(overlaps(i, { from: d('2024-03-13T00:00:00').getTime(), until: d('2024-03-13T01:00:00').getTime() })).toBe(false);
  });

  it('treats a timed point event as an instant', () => {
    const i = eventInterval({ id: 'e', label: 'x', date: d('2024-03-12T10:30:00') })!;
    expect(i.from).toBe(i.until);
  });

  it('keeps open-ended link ranges open', () => {
    const i = linkInterval(link('l', 'a', 'b', { dateRange: { start: d('2020-01-01T00:00:00'), end: null } }))!;
    expect(i.until).toBe(Infinity);
  });

  it('merges link date and dateRange', () => {
    const i = linkInterval(link('l', 'a', 'b', {
      date: d('2019-06-01T00:00:00'),
      dateRange: { start: d('2020-01-01T00:00:00'), end: d('2020-02-01T00:00:00') },
    }))!;
    expect(i.from).toBe(d('2019-06-01T00:00:00').getTime());
    expect(i.until).toBe(d('2020-02-02T00:00:00').getTime() - 1);
  });

  it('returns null for undated links', () => {
    expect(linkInterval(link('l', 'a', 'b'))).toBeNull();
  });
});

describe('closestDateIndex', () => {
  it('picks the nearest date', () => {
    const dates = [d('2024-01-01T00:00:00'), d('2024-06-01T00:00:00'), d('2024-12-01T00:00:00')];
    expect(closestDateIndex(dates, d('2024-05-20T00:00:00').getTime())).toBe(1);
    expect(closestDateIndex(dates, d('2030-01-01T00:00:00').getTime())).toBe(2);
  });
});

describe('collectTemporalDates', () => {
  it('ignores the collection date (Element.date)', () => {
    expect(collectTemporalDates([el('a', [], { date: d('2024-01-01T00:00:00') })], [])).toEqual([]);
  });

  it('returns distinct sorted dates from events and links', () => {
    const dates = collectTemporalDates(
      [el('a', [{ date: d('2024-03-12T00:00:00') }, { date: d('2024-01-01T00:00:00') }])],
      [link('l', 'a', 'b', { dateRange: { start: d('2024-01-01T00:00:00'), end: d('2024-02-01T00:00:00') } })],
    );
    expect(dates.map((x) => x.getTime())).toEqual([
      d('2024-01-01T00:00:00').getTime(),
      d('2024-02-01T00:00:00').getTime(),
      d('2024-03-12T00:00:00').getTime(),
    ]);
  });
});

describe('computeCanvasTemporalClassification', () => {
  const elements = [
    el('a', [{ date: d('2024-03-01T00:00:00'), dateEnd: d('2024-03-20T00:00:00'), label: 'old' }, { date: d('2024-03-12T00:00:00'), label: 'recent' }]),
    el('b', [{ date: d('2023-01-01T00:00:00') }]),
    el('c'),
    el('d'),
    el('e'),
    el('g', [], { isGroup: true }),
  ];
  const links = [
    link('l-active', 'c', 'd', { dateRange: { start: d('2024-03-01T00:00:00'), end: d('2024-03-31T00:00:00') } }),
    link('l-old', 'b', 'a', { dateRange: { start: d('2022-01-01T00:00:00'), end: d('2022-12-31T00:00:00') } }),
    link('l-undated', 'a', 'e'),
  ];
  const s = computeCanvasTemporalClassification(elements, links, d('2024-03-12T00:00:00'));

  it('classifies links', () => {
    expect([...s.activeLinkIds]).toEqual(['l-active']);
    expect([...s.inactiveLinkIds]).toEqual(['l-old']);
    expect([...s.undatedLinkIds]).toEqual(['l-undated']);
  });

  it('marks elements with an event at the instant as active, events oldest first', () => {
    expect(s.activeElementIds.has('a')).toBe(true);
    expect(s.activeEventsByElement.get('a')?.map((e) => e.label)).toEqual(['old', 'recent']);
  });

  it('dims dated elements with nothing at the instant', () => {
    expect(s.inactiveElementIds.has('b')).toBe(true);
  });

  it('leaves endpoints of an active link as related (no set)', () => {
    for (const id of ['c', 'd']) {
      expect(s.activeElementIds.has(id)).toBe(false);
      expect(s.inactiveElementIds.has(id)).toBe(false);
      expect(s.undatedElementIds.has(id)).toBe(false);
    }
  });

  it('flags elements without any factual date as undated', () => {
    expect(s.undatedElementIds.has('e')).toBe(true);
  });

  it('never classifies groups', () => {
    expect(s.undatedElementIds.has('g')).toBe(false);
  });
});

describe('period window', () => {
  const elements = [
    el('a', [{ date: d('2024-03-12T00:00:00') }]),
    el('b', [{ date: d('2023-01-05T00:00:00') }]),
  ];
  const links = [link('l', 'a', 'b', { dateRange: { start: d('2022-01-01T00:00:00'), end: d('2022-12-31T00:00:00') } })];

  it('activates everything that overlaps the period', () => {
    const s = computeCanvasTemporalClassification(elements, links, d('2022-06-01T00:00:00'), d('2023-06-01T00:00:00'));
    expect(s.activeElementIds.has('b')).toBe(true);
    expect(s.activeLinkIds.has('l')).toBe(true);
    expect(s.activeElementIds.has('a')).toBe(false);
  });
});

describe('shiftNavigator', () => {
  const dates = [d('2024-01-01T00:00:00'), d('2024-02-01T00:00:00'), d('2024-03-01T00:00:00'), d('2024-04-01T00:00:00')];

  it('moves an instant one step', () => {
    expect(shiftNavigator(dates, dates[1], null, 1)).toEqual({ start: dates[2], periodEnd: null });
  });

  it('slides a period keeping its width', () => {
    expect(shiftNavigator(dates, dates[0], dates[2], 1)).toEqual({ start: dates[1], periodEnd: dates[3] });
  });

  it('stops at the boundary', () => {
    expect(shiftNavigator(dates, dates[1], dates[3], 1)).toBeNull();
    expect(shiftNavigator(dates, dates[0], null, -1)).toBeNull();
  });
});

describe('summarizeActiveEvents', () => {
  it('shows the span of events with an end date', () => {
    const summary = summarizeActiveEvents([
      { id: '1', label: 'Alerte', date: d('2025-01-28T00:00:00'), dateEnd: d('2025-06-30T00:00:00') },
      { id: '2', label: 'Salon', date: d('2025-06-15T11:00:00') },
    ], 'fr');
    expect(summary.label).toBe('Salon');
    expect(summary.moreCount).toBe(1);
    expect(summary.events[0].dateLabel).toContain('→');
    expect(summary.events[1].dateLabel).not.toContain('→');
  });
});

describe('precision', () => {
  it('makes a year event cover the whole year', () => {
    const els = [el('a', [{ date: d('2019-01-01T00:00:00'), precision: 'year' }])];
    expect(computeCanvasTemporalClassification(els, [], d('2019-07-14T12:00:00')).activeElementIds.has('a')).toBe(true);
    expect(computeCanvasTemporalClassification(els, [], d('2020-01-01T00:00:00')).activeElementIds.has('a')).toBe(false);
  });

  it('makes a month range cover through the end of its last month', () => {
    const links = [link('l', 'a', 'b', { dateRange: { start: d('2019-03-01T00:00:00'), end: d('2019-05-01T00:00:00'), precision: 'month' } })];
    const s = computeCanvasTemporalClassification([], links, d('2019-05-31T23:00:00'));
    expect(s.activeLinkIds.has('l')).toBe(true);
  });

  it('shows dates at their precision in the summary', () => {
    const summary = summarizeActiveEvents([{ id: '1', label: 'Arrivée', date: d('2019-01-01T00:00:00'), precision: 'year', approximate: true }], 'fr');
    expect(summary.events[0].dateLabel).toBe('~2019');
  });
});

describe('source time zone in summaries', () => {
  it('shows the source hour in parentheses', () => {
    const previous = process.env.TZ;
    process.env.TZ = 'Europe/Paris';
    try {
      const summary = summarizeActiveEvents([
        { id: '1', label: 'Appel', date: new Date('2024-06-12T00:12:00Z'), timeZone: 'Asia/Beirut' },
      ], 'fr');
      expect(summary.events[0].dateLabel).toContain('(03:12 Beirut)');
    } finally {
      process.env.TZ = previous;
    }
  });
});
