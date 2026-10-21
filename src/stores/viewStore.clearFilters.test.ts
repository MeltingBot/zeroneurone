// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { useViewStore } from './viewStore';

describe('viewStore.clearFilters', () => {
  it('clears the filters but keeps the date periods, which are a setting', () => {
    const periods = [{ start: 'Début des faits', end: 'Fin des faits' }];
    useViewStore.getState().setFilters({
      includeTags: ['Infraction'],
      includedDateProperties: ['Début des faits'],
      dateRangeProperties: periods,
    });
    useViewStore.getState().clearFilters();
    const { filters } = useViewStore.getState();
    expect(filters.includeTags).toEqual([]);
    expect(filters.includedDateProperties).toEqual([]);
    expect(filters.dateRangeProperties).toEqual(periods);
  });
});
