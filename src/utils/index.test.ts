import { describe, it, expect } from 'vitest';
import { getExtension, parseFlexibleDate, stripLocalOnlyDossierFields } from './index';
import type { Dossier } from '../types';

describe('getExtension', () => {
  it('returns the extension of an ordinary filename', () => {
    expect(getExtension('rapport.PDF')).toBe('pdf');
    expect(getExtension('photo.jpeg')).toBe('jpeg');
  });

  it('keeps only the last segment of a double extension', () => {
    expect(getExtension('photo.jpg.svg')).toBe('svg');
  });

  it('does not return the whole name when there is no dot', () => {
    // Used to return 'readme', which then became an OPFS handle suffix.
    expect(getExtension('README')).toBe('bin');
  });

  it('rejects a path smuggled through the extension', () => {
    // '<hash>.' + this used to be passed to getFileHandle().
    expect(getExtension('a.b/../../evil')).toBe('bin');
    expect(getExtension('a.b\\..\\evil')).toBe('bin');
  });

  it('rejects implausibly long or non-alphanumeric extensions', () => {
    expect(getExtension('x.verylongextension')).toBe('bin');
    expect(getExtension('x.p h p')).toBe('bin');
    expect(getExtension('x.')).toBe('bin');
  });
});

describe('stripLocalOnlyDossierFields', () => {
  it('drops the shared-session key and the other device-local fields', () => {
    const dossier = {
      id: 'd1',
      name: 'Enquête',
      lastSharedKey: 'secret-e2e-key',
      lastSharedAsync: true,
      origin: 'joined',
    } as unknown as Dossier;
    const out = stripLocalOnlyDossierFields(dossier);
    expect(out).not.toHaveProperty('lastSharedKey');
    expect(out).not.toHaveProperty('lastSharedAsync');
    expect(out).not.toHaveProperty('origin');
    expect(out.name).toBe('Enquête');
    expect(JSON.stringify(out)).not.toContain('secret-e2e-key');
  });
});

describe('parseFlexibleDate', () => {
  it('keeps zoned ISO timestamps exact', () => {
    expect(parseFlexibleDate('2024-03-12T10:00:00Z')!.getTime()).toBe(Date.UTC(2024, 2, 12, 10));
    expect(parseFlexibleDate('2024-03-12 10:00+02:00')!.getTime()).toBe(Date.UTC(2024, 2, 12, 8));
  });

  it('reads a date without time as the local day (midnight)', () => {
    expect(parseFlexibleDate('2024-03-12')).toEqual(new Date(2024, 2, 12));
    expect(parseFlexibleDate('12/03/2024')).toEqual(new Date(2024, 2, 12));
  });

  it('reads a zone-less time as local', () => {
    expect(parseFlexibleDate('12/03/2024 14:30')).toEqual(new Date(2024, 2, 12, 14, 30));
  });

  it('rejects impossible dates', () => {
    expect(parseFlexibleDate('31/02/2024')).toBeNull();
  });
});
