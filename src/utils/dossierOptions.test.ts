import { describe, it, expect } from 'vitest';
import { isDossierOptions, withDossierLinkDefaults } from './dossierOptions';

describe('withDossierLinkDefaults', () => {
  const arrow = { options: { linkArrowByDefault: true } };

  it('adds a forward arrow when the option is on', () => {
    expect(withDossierLinkDefaults(arrow, { label: 'x' })).toEqual({ label: 'x', directed: true, direction: 'forward' });
  });

  it('keeps a direction given by the caller', () => {
    expect(withDossierLinkDefaults(arrow, { direction: 'none' })).toEqual({ direction: 'none' });
  });

  it('changes nothing when the option is off or absent', () => {
    expect(withDossierLinkDefaults({ options: { linkArrowByDefault: false } }, { label: 'x' })).toEqual({ label: 'x' });
    expect(withDossierLinkDefaults({}, undefined)).toEqual({});
    expect(withDossierLinkDefaults(null)).toEqual({});
  });
});

describe('isDossierOptions', () => {
  it('accepts an options object and rejects other shapes', () => {
    expect(isDossierOptions({})).toBe(true);
    expect(isDossierOptions({ linkArrowByDefault: true })).toBe(true);
    expect(isDossierOptions({ linkArrowByDefault: 'yes' })).toBe(false);
    expect(isDossierOptions(null)).toBe(false);
    expect(isDossierOptions([])).toBe(false);
  });
});
