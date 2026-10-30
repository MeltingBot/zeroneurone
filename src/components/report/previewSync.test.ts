import { describe, it, expect } from 'vitest';
import { previewOnValue } from './previewSync';

describe('previewOnValue', () => {
  const pending = { sent: 'mon texte', before: 'ancien' };

  it('keeps what was sent while the value is still the old one', () => {
    expect(previewOnValue('ancien', pending)).toEqual({ show: 'mon texte', pending });
  });

  it('takes our echo and stops waiting', () => {
    expect(previewOnValue('mon texte', pending)).toEqual({ show: 'mon texte', pending: null });
  });

  it("takes a collaborator's edit merged with ours instead of freezing on it", () => {
    expect(previewOnValue('mon texte + ajout distant', pending)).toEqual({ show: 'mon texte + ajout distant', pending: null });
  });
});
