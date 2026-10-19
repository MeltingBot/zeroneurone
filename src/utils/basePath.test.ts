import { describe, it, expect } from 'vitest';
import { joinBase } from './basePath';

describe('joinBase', () => {
  it('keeps root-served paths unchanged', () => {
    expect(joinBase('/', '/plugins/manifest.json')).toBe('/plugins/manifest.json');
    expect(joinBase('/', '/')).toBe('/');
  });

  it('prefixes a sub-directory base', () => {
    expect(joinBase('/Zeroneurone/', '/plugins/manifest.json')).toBe('/Zeroneurone/plugins/manifest.json');
    expect(joinBase('/Zeroneurone/', 'logo.png')).toBe('/Zeroneurone/logo.png');
    expect(joinBase('/Zeroneurone/', '/')).toBe('/Zeroneurone/');
  });

  it('tolerates a base without trailing slash', () => {
    expect(joinBase('/Zeroneurone', '/join/abc')).toBe('/Zeroneurone/join/abc');
  });
});
