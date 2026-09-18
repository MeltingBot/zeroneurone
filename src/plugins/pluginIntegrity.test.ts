import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computeIntegrityHash, verifyIntegrity } from './pluginIntegrity';

describe('verifyIntegrity', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('accepts a source matching its declared hash', async () => {
    const source = 'export function register() {}';
    const hash = await computeIntegrityHash(source);
    expect(await verifyIntegrity(source, hash, 'demo')).toBe(true);
  });

  it('is case-insensitive on the declared hash', async () => {
    const source = 'export function register() {}';
    const hash = await computeIntegrityHash(source);
    expect(await verifyIntegrity(source, hash.toUpperCase(), 'demo')).toBe(true);
  });

  it('refuses a source that does not match', async () => {
    const hash = await computeIntegrityHash('original');
    expect(await verifyIntegrity('tampered', hash, 'demo')).toBe(false);
  });

  it('refuses an entry that declares no hash at all', async () => {
    // Used to return true: omitting `integrity` from the manifest was enough to
    // skip verification entirely. A plugin runs in the main realm, so choosing
    // which code loads is the only control point there is.
    expect(await verifyIntegrity('anything', undefined, 'demo')).toBe(false);
    expect(await verifyIntegrity('anything', '', 'demo')).toBe(false);
  });
});
