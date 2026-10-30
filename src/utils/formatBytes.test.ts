import { describe, it, expect } from 'vitest';
import { formatBytes } from './formatBytes';

const plain = (s: string) => s.replace(/\u00a0|\u202f/g, ' ');

describe('formatBytes', () => {
  it('uses the units of the language', () => {
    expect(plain(formatBytes(1536, 'fr'))).toBe('1,5 ko');
    expect(plain(formatBytes(1536, 'en'))).toBe('1.5 kB');
    expect(plain(formatBytes(12.34 * 1024 * 1024, 'fr'))).toBe('12,3 Mo');
  });

  it('starts at the kilobyte and maps ua to Ukrainian', () => {
    expect(plain(formatBytes(512, 'en'))).toBe('0.5 kB');
    expect(plain(formatBytes(0, 'fr'))).toBe('0 ko');
    expect(plain(formatBytes(2 * 1024 ** 3, 'ua'))).toBe('2 ГБ');
  });
});
