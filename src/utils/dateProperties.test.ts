import { describe, it, expect } from 'vitest';
import type { Element, ElementEvent } from '../types';
import { DEFAULT_FILTERS } from '../types';
import {
  collectTemporalDates,
  computeCanvasTemporalClassification,
  datePropertyKeeper,
  elementDateIntervals,
  propertyDateIntervals,
  propertyDateSpans,
} from './temporalUtils';
import { elementMatchesFilters, getDimmedElementIds } from './filterUtils';

type Prop = { key: string; value: string; type: string };

function el(id: string, props: Prop[] = [], extra: Partial<Element> = {}, events: Partial<ElementEvent>[] = []): Element {
  return {
    id,
    label: id,
    notes: '',
    tags: [],
    properties: props,
    events: events.map((e, i) => ({ id: `${id}-ev${i}`, label: `ev${i}`, ...e })),
    dateRange: null,
    date: null,
    geo: null,
    confidence: null,
    isGroup: false,
    isAnnotation: false,
    ...extra,
  } as unknown as Element;
}

const d = (s: string) => new Date(s);
const dateProp = (key: string, value: string): Prop => ({ key, value, type: 'date' });
const all = () => true;

describe('datePropertyKeeper', () => {
  it('keeps every key without a selection', () => {
    const keep = datePropertyKeeper({});
    expect(keep('Début des faits')).toBe(true);
    expect(keep('Date de naissance')).toBe(true);
  });

  it('keeps only the selected keys, so a key imported later is left out', () => {
    const keep = datePropertyKeeper({ includedDateProperties: ['Début des faits'] });
    expect(keep('Début des faits')).toBe(true);
    expect(keep('Date ajoutée plus tard')).toBe(false);
  });

  it('reads the former form (keys left out) when nothing is selected', () => {
    const keep = datePropertyKeeper({ excludedDateProperties: ['Date de naissance'] });
    expect(keep('Date de naissance')).toBe(false);
    expect(keep('Début des faits')).toBe(true);
  });

  it('prefers the selection over the former form', () => {
    const keep = datePropertyKeeper({ includedDateProperties: ['A'], excludedDateProperties: ['A'] });
    expect(keep('A')).toBe(true);
  });
});

describe('propertyDateIntervals', () => {
  it('covers the whole day for a date, the minute for a date-time', () => {
    const e = el('a', [
      dateProp('Jour', '2024-03-12'),
      { key: 'Heure', value: '2024-03-12T10:30', type: 'datetime' },
    ]);
    const [day, minute] = propertyDateIntervals(e, all);
    expect(day.from).toBe(d('2024-03-12T00:00:00').getTime());
    expect(day.until).toBe(d('2024-03-13T00:00:00').getTime() - 1);
    expect(minute.from).toBe(minute.until);
  });

  it('ignores other property types, empty values and keys not kept', () => {
    const e = el('a', [
      { key: 'Nom', value: 'x', type: 'text' },
      dateProp('Vide', ''),
      dateProp('Exclue', '2024-01-01'),
      dateProp('Gardée', '2024-01-02'),
    ]);
    expect(propertyDateIntervals(e, (k) => k !== 'Exclue')).toHaveLength(1);
  });
});

describe('elementDateIntervals', () => {
  it('leaves the collection date out', () => {
    expect(elementDateIntervals(el('a', [], { date: d('2024-01-01T00:00:00') }), all)).toEqual([]);
  });

  it('gathers the period, the dated events and the date properties kept', () => {
    const e = el(
      'a',
      [dateProp('Début des faits', '2024-01-05')],
      { dateRange: { start: d('2024-01-01T00:00:00'), end: d('2024-01-31T00:00:00') } } as Partial<Element>,
      [{ date: d('2024-02-01T00:00:00') }, { label: 'sans date' }],
    );
    expect(elementDateIntervals(e, all)).toHaveLength(3);
    expect(elementDateIntervals(e, () => false)).toHaveLength(2);
  });
});

describe('canvas temporal cursor with date properties', () => {
  const dated = el('a', [dateProp('Début des faits', '2024-03-12')]);

  it('adds the kept date properties to the navigator steps', () => {
    expect(collectTemporalDates([dated], [])).toEqual([]);
    expect(collectTemporalDates([dated], [], all)).toEqual([d('2024-03-12T00:00:00')]);
  });

  it('classifies an element dated by its properties only', () => {
    const at = (s: string) => computeCanvasTemporalClassification([dated], [], d(s), null, all);
    expect(at('2024-03-12T15:00:00').activeElementIds.has('a')).toBe(true);
    expect(at('2024-03-20T00:00:00').inactiveElementIds.has('a')).toBe(true);
    // Without the date properties, the element is undated as before
    const without = computeCanvasTemporalClassification([dated], [], d('2024-03-12T15:00:00'));
    expect(without.undatedElementIds.has('a')).toBe(true);
  });
});

describe('period filter', () => {
  const inMarch = el('a', [dateProp('Début des faits', '2024-03-12')]);
  const inJune = el('b', [dateProp('Début des faits', '2024-06-01')]);
  const undated = el('c');
  const march = { ...DEFAULT_FILTERS, dateFrom: d('2024-03-01T00:00:00'), dateTo: d('2024-03-31T00:00:00') };

  it('keeps the elements whose dates meet the period', () => {
    expect(elementMatchesFilters(inMarch, march)).toBe(true);
    expect(elementMatchesFilters(inJune, march)).toBe(false);
  });

  it('keeps an undated element', () => {
    expect(elementMatchesFilters(undated, march)).toBe(true);
  });

  it('reads only the date properties kept', () => {
    const otherKey = { ...march, includedDateProperties: ['Autre date'] };
    expect(elementMatchesFilters(inJune, otherKey)).toBe(true);
  });

  it('dims what the period leaves out', () => {
    expect([...getDimmedElementIds([inMarch, inJune, undated], march, new Set())]).toEqual(['b']);
  });
});

describe('date property periods', () => {
  const facts = { keep: all, ranges: [{ start: 'Début des faits', end: 'Fin des faits' }] };

  it('reads a declared pair as one span from start to end', () => {
    const e = el('a', [dateProp('Début des faits', '2024-03-01'), dateProp('Fin des faits', '2024-03-10')]);
    const spans = propertyDateSpans(e, facts);
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({ key: 'Début des faits', endKey: 'Fin des faits', index: 0 });
    expect(spans[0].from).toBe(d('2024-03-01T00:00:00').getTime());
    expect(spans[0].until).toBe(d('2024-03-11T00:00:00').getTime() - 1);
  });

  it('keeps points when only one end is filled, or the end comes first', () => {
    const onlyStart = el('a', [dateProp('Début des faits', '2024-03-01')]);
    expect(propertyDateSpans(onlyStart, facts)).toHaveLength(1);
    expect(propertyDateSpans(onlyStart, facts)[0].endKey).toBeUndefined();
    const reversed = el('b', [dateProp('Début des faits', '2024-03-10'), dateProp('Fin des faits', '2024-03-01')]);
    expect(propertyDateSpans(reversed, facts)).toHaveLength(2);
  });

  it('leaves the other dates as points', () => {
    const e = el('a', [
      dateProp('Début des faits', '2024-03-01'),
      dateProp('Plainte', '2024-04-01'),
      dateProp('Fin des faits', '2024-03-10'),
    ]);
    const spans = propertyDateSpans(e, facts);
    expect(spans.map((s) => s.key)).toEqual(['Début des faits', 'Plainte']);
  });

  it('dates a period on the canvas cursor across its whole span', () => {
    const e = el('a', [dateProp('Début des faits', '2024-03-01'), dateProp('Fin des faits', '2024-03-10')]);
    const at = (s: string) => computeCanvasTemporalClassification([e], [], d(s), null, facts);
    expect(at('2024-03-05T12:00:00').activeElementIds.has('a')).toBe(true);
    // Read as two points, the middle of the period would be inactive
    expect(computeCanvasTemporalClassification([e], [], d('2024-03-05T12:00:00'), null, all).inactiveElementIds.has('a')).toBe(true);
  });
});
