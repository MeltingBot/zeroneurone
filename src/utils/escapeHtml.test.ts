import { describe, it, expect } from 'vitest';
import { escapeHtml, escapeJsonForScript, sanitizeUrl, safeColor, safeDataImageUrl } from './escapeHtml';

describe('escapeHtml', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(escapeHtml(`<img src="x" onerror='y'>&`)).toBe(
      '&lt;img src=&quot;x&quot; onerror=&#39;y&#39;&gt;&amp;'
    );
  });

  it('escapes the ampersand first so entities are not double-decoded', () => {
    expect(escapeHtml('&lt;script&gt;')).toBe('&amp;lt;script&amp;gt;');
  });

  it('leaves plain text untouched', () => {
    expect(escapeHtml('Jean Dupont — 42')).toBe('Jean Dupont — 42');
  });
});

describe('escapeJsonForScript', () => {
  it('prevents a </script> breakout', () => {
    const payload = '</script><img src=x onerror=alert(1)>';
    const out = escapeJsonForScript(payload);
    expect(out).not.toContain('</script>');
    expect(out).not.toContain('<');
    expect(JSON.parse(out)).toBe(payload);
  });

  it('escapes line separators that break older parsers', () => {
    const raw = 'a\u2028b\u2029c';
    const out = escapeJsonForScript(raw);
    expect(out).not.toContain('\u2028');
    expect(out).not.toContain('\u2029');
    expect(JSON.parse(out)).toBe(raw);
  });

  it('round-trips nested objects unchanged', () => {
    const value = { id: 'x', html: '<b>bold</b>', nested: { list: ['<a>', '>'] } };
    expect(JSON.parse(escapeJsonForScript(value))).toEqual(value);
  });
});

describe('sanitizeUrl', () => {
  it('accepts http, https, mailto and fragments', () => {
    expect(sanitizeUrl('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
    expect(sanitizeUrl('http://example.com')).toBe('http://example.com');
    expect(sanitizeUrl('mailto:a@b.c')).toBe('mailto:a@b.c');
    expect(sanitizeUrl('#section-1')).toBe('#section-1');
  });

  it('rejects script-bearing schemes, including obfuscated ones', () => {
    expect(sanitizeUrl('javascript:alert(1)')).toBeNull();
    expect(sanitizeUrl('JaVaScRiPt:alert(1)')).toBeNull();
    expect(sanitizeUrl('  javascript:alert(1)')).toBeNull();
    expect(sanitizeUrl('java\u0000script:alert(1)')).toBeNull();
    expect(sanitizeUrl('java\tscript:alert(1)')).toBeNull();
    expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(sanitizeUrl('vbscript:msgbox(1)')).toBeNull();
  });

  it('rejects protocol-relative and relative URLs', () => {
    expect(sanitizeUrl('//evil.com')).toBeNull();
    expect(sanitizeUrl('/local/path')).toBeNull();
  });
});

describe('safeColor', () => {
  const FALLBACK = '#f5f5f4';

  it('accepts hex, rgb(a), hsl and named colours', () => {
    expect(safeColor('#fff', FALLBACK)).toBe('#fff');
    expect(safeColor('#e07a5f', FALLBACK)).toBe('#e07a5f');
    expect(safeColor('rgb(1, 2, 3)', FALLBACK)).toBe('rgb(1, 2, 3)');
    expect(safeColor('rgba(1, 2, 3, 0.5)', FALLBACK)).toBe('rgba(1, 2, 3, 0.5)');
    expect(safeColor('hsl(210, 50%, 40%)', FALLBACK)).toBe('hsl(210, 50%, 40%)');
    expect(safeColor('tomato', FALLBACK)).toBe('tomato');
  });

  it('accepts our own theme tokens', () => {
    expect(safeColor('var(--color-accent)', FALLBACK)).toBe('var(--color-accent)');
  });

  it('falls back on attribute-breaking payloads', () => {
    expect(safeColor('x"/><img src=y onerror=alert(1)>', FALLBACK)).toBe(FALLBACK);
    expect(safeColor('red;background:url(javascript:alert(1))', FALLBACK)).toBe(FALLBACK);
    expect(safeColor("red'onload='alert(1)", FALLBACK)).toBe(FALLBACK);
    expect(safeColor('var(--x); background: url(evil)', FALLBACK)).toBe(FALLBACK);
    expect(safeColor('#'.padEnd(80, 'a'), FALLBACK)).toBe(FALLBACK);
  });

  it('falls back on empty values', () => {
    expect(safeColor(undefined, FALLBACK)).toBe(FALLBACK);
    expect(safeColor(null, FALLBACK)).toBe(FALLBACK);
    expect(safeColor('', FALLBACK)).toBe(FALLBACK);
  });
});

describe('safeDataImageUrl', () => {
  const valid = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD=';

  it('accepts a canvas-produced thumbnail', () => {
    expect(safeDataImageUrl(valid)).toBe(valid);
  });

  it('accepts the other raster types we generate', () => {
    expect(safeDataImageUrl('data:image/png;base64,iVBORw0KGgo=')).not.toBe('');
    expect(safeDataImageUrl('data:image/webp;base64,UklGRg==')).not.toBe('');
  });

  it('rejects a CSS url() breakout', () => {
    // The payload that reached background-image:url(${thumbnail}) in MapView.
    expect(safeDataImageUrl('x);"></div><img src=q onerror=alert(1)>')).toBe('');
  });

  it('rejects an attribute breakout', () => {
    expect(safeDataImageUrl('x" onerror="alert(1)')).toBe('');
  });

  it('rejects non-image and script-bearing schemes', () => {
    expect(safeDataImageUrl('javascript:alert(1)')).toBe('');
    expect(safeDataImageUrl('data:text/html,<script>alert(1)</script>')).toBe('');
    expect(safeDataImageUrl('https://example.com/a.png')).toBe('');
  });

  it('rejects SVG, which carries markup semantics', () => {
    expect(safeDataImageUrl('data:image/svg+xml;base64,PHN2Zz4=')).toBe('');
  });

  it('rejects anything appended after the base64 payload', () => {
    expect(safeDataImageUrl(valid + '");background:url(//evil')).toBe('');
  });

  it('returns an empty string for absent values', () => {
    expect(safeDataImageUrl(null)).toBe('');
    expect(safeDataImageUrl(undefined)).toBe('');
    expect(safeDataImageUrl('')).toBe('');
  });
});
