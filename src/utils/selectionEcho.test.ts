import { describe, it, expect } from 'vitest';
import { isRenderedPartOf } from './selectionEcho';

const set = (...ids: string[]) => new Set(ids);

describe('isRenderedPartOf', () => {
  it('recognises the echo of a selection partly off screen', () => {
    // Store: a, b, c selected; only a and b rendered; React Flow reports a, b
    expect(isRenderedPartOf(['a', 'b'], set('a', 'b', 'c'), set('a', 'b', 'x'))).toBe(true);
  });

  it('sees a new selection made on the canvas', () => {
    // The user selects x alone
    expect(isRenderedPartOf(['x'], set('a', 'b', 'c'), set('a', 'b', 'x'))).toBe(false);
  });

  it('sees a rendered item dropped from the selection', () => {
    expect(isRenderedPartOf(['a'], set('a', 'b'), set('a', 'b'))).toBe(false);
  });

  it('recognises an empty echo when nothing selected is rendered', () => {
    expect(isRenderedPartOf([], set('c'), set('a', 'b'))).toBe(true);
  });
});
