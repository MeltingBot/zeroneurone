import { describe, it, expect } from 'vitest';
import { dataUrlMimeType, dataUrlToFile } from './dataUrl';

describe('dataUrl', () => {
  it('reads the mime type, with a fallback when the URL has none', () => {
    expect(dataUrlMimeType('data:image/png;base64,AAAA')).toBe('image/png');
    expect(dataUrlMimeType('data:;base64,AAAA', 'image/jpeg')).toBe('image/jpeg');
  });

  it('turns a base64 data URL into a file with the right bytes and type', async () => {
    const file = dataUrlToFile(`data:text/plain;base64,${btoa('bonjour')}`, 'note.txt');
    expect(file.name).toBe('note.txt');
    expect(file.type).toBe('text/plain');
    expect(await file.text()).toBe('bonjour');
  });
});
