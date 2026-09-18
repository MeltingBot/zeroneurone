import { describe, it, expect } from 'vitest';
import { getExtension } from './index';

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
