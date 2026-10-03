import { describe, it, expect } from 'vitest';
import {
  countEvaluationsOutsideModel,
  evaluationSortKey,
  formatEvaluation,
  getEvaluationModel,
  matchesEvaluationFilters,
  sanitizeEvaluation,
} from './evaluation';

describe('evaluation utils', () => {
  it('defaults the dossier model to zeroneurone', () => {
    expect(getEvaluationModel(undefined)).toBe('zeroneurone');
    expect(getEvaluationModel({})).toBe('zeroneurone');
    expect(getEvaluationModel({ evaluationModel: 'bogus' as never })).toBe('zeroneurone');
    expect(getEvaluationModel({ evaluationModel: 'admiralty' })).toBe('admiralty');
  });

  it('sanitizes untrusted evaluations', () => {
    expect(sanitizeEvaluation({ scale: 'europol', source: 'b', info: 2 })).toEqual({ scale: 'europol', source: 'B', info: '2' });
    expect(sanitizeEvaluation({ scale: 'europol', source: 'E', info: '5' })).toBeNull();
    expect(sanitizeEvaluation({ scale: 'nato', source: 'A', info: '1' })).toBeNull();
    expect(sanitizeEvaluation('B2')).toBeNull();
    expect(sanitizeEvaluation(null)).toBeNull();
  });

  it('formats evaluations', () => {
    expect(formatEvaluation({ scale: 'europol', source: 'B', info: '2' })).toBe('B2');
    expect(formatEvaluation({ scale: 'europol', source: 'X', info: null })).toBe('X-');
    expect(formatEvaluation(null)).toBe('');
  });

  it('sorts by grid order and puts out-of-model evaluations last', () => {
    const a1 = evaluationSortKey({ scale: 'europol', source: 'A', info: '1' }, 'europol');
    const b1 = evaluationSortKey({ scale: 'europol', source: 'B', info: '1' }, 'europol');
    const x4 = evaluationSortKey({ scale: 'europol', source: 'X', info: '4' }, 'europol');
    expect(a1).toBeLessThan(b1);
    expect(b1).toBeLessThan(x4);
    expect(evaluationSortKey({ scale: 'admiralty', source: 'A', info: '1' }, 'europol')).toBe(Infinity);
  });

  it('counts evaluations outside a model', () => {
    const items = [
      { evaluation: { scale: 'europol' as const, source: 'A', info: '1' } },
      { evaluation: { scale: 'admiralty' as const, source: 'B', info: '2' } },
      { evaluation: null },
      {},
    ];
    expect(countEvaluationsOutsideModel(items, 'europol')).toBe(1);
    expect(countEvaluationsOutsideModel(items, 'zeroneurone')).toBe(2);
  });

  it('applies view filters only in grading models', () => {
    const b2 = { scale: 'europol' as const, source: 'B', info: '2' };
    expect(matchesEvaluationFilters(b2, 'europol', ['A', 'B'], null)).toBe(true);
    expect(matchesEvaluationFilters(b2, 'europol', ['A'], null)).toBe(false);
    expect(matchesEvaluationFilters(b2, 'europol', null, ['1'])).toBe(false);
    expect(matchesEvaluationFilters(null, 'europol', ['A'], null)).toBe(false);
    expect(matchesEvaluationFilters(b2, 'admiralty', ['B'], null)).toBe(false);
    expect(matchesEvaluationFilters(null, 'zeroneurone', ['A'], null)).toBe(true);
    expect(matchesEvaluationFilters(null, 'europol', [], [])).toBe(true);
  });
});
