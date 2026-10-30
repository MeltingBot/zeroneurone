import { describe, it, expect } from 'vitest';
import { toBase64Url } from './base64url';

describe('toBase64Url', () => {
  it('uses the URL-safe alphabet and drops the padding', () => {
    // 0xfb 0xff → "+/8=" in standard base64
    expect(toBase64Url(new Uint8Array([0xfb, 0xff]))).toBe('-_8');
    expect(toBase64Url(new Uint8Array([0xfb, 0xff]).buffer)).toBe('-_8');
  });
});
