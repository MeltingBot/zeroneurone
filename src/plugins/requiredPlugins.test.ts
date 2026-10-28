// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadExternalPlugins } from '../services/pluginLoaderService';
import { getRequiredPluginFailures, isPluginRequired, resetRequiredPlugins } from './requiredPlugins';
import { disablePlugin, isPluginDisabled } from './pluginRegistry';
import { DossierLockedError, setPluginWriteLock } from '../utils/dossierLock';
import { useDossierStore } from '../stores/dossierStore';

const sha256 = async (text: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

/** Serve a manifest and plugin files from a fake fetch */
function serve(files: Record<string, string>) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const name = Object.keys(files).find((f) => String(url).endsWith(f));
    return name
      ? { ok: true, status: 200, text: async () => files[name], json: async () => JSON.parse(files[name]) }
      : { ok: false, status: 404, text: async () => '', json: async () => ({}) };
  }));
}

describe('required plugins', () => {
  beforeEach(() => resetRequiredPlugins());
  afterEach(() => vi.unstubAllGlobals());

  it('a required plugin that cannot be loaded blocks the app', async () => {
    serve({
      'manifest.json': JSON.stringify({
        manifestVersion: '2',
        plugins: [
          { id: 'audit', file: 'audit.js', name: 'Audit', integrity: 'a'.repeat(64), trust: 'trusted', required: true },
          { id: 'extra', file: 'extra.js', integrity: 'b'.repeat(64), trust: 'trusted' },
        ],
      }),
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await loadExternalPlugins();
    warn.mockRestore();
    // The optional plugin is missing too, but only the required one blocks
    expect(getRequiredPluginFailures()).toEqual([{ id: 'audit', name: 'Audit', reason: 'missing' }]);
  });

  it('a required plugin with a wrong fingerprint blocks the app', async () => {
    serve({
      'manifest.json': JSON.stringify({
        manifestVersion: '2',
        plugins: [{ id: 'audit', file: 'audit.js', integrity: 'c'.repeat(64), trust: 'trusted', required: true }],
      }),
      'audit.js': 'export function register() {}',
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await loadExternalPlugins();
    warn.mockRestore();
    error.mockRestore();
    expect(getRequiredPluginFailures().map((f) => f.reason)).toEqual(['integrity']);
  });

  it('a required plugin is enabled and cannot be switched off', async () => {
    const source = 'export function register() {}';
    serve({
      'manifest.json': JSON.stringify({
        manifestVersion: '2',
        plugins: [{ id: 'audit', file: 'audit.js', integrity: await sha256(source), trust: 'trusted', required: true }],
      }),
      'audit.js': source,
    });
    await loadExternalPlugins().catch(() => {}); // blob import is not available in jsdom
    expect(isPluginRequired('audit')).toBe(true);
    expect(isPluginDisabled('audit')).toBe(false);
    disablePlugin('audit');
    expect(isPluginDisabled('audit')).toBe(false);
  });
});

describe('plugin write lock', () => {
  afterEach(() => setPluginWriteLock('audit', null));

  it('suspends every write, creation and deletion of dossiers included, until lifted', async () => {
    const dossier = await useDossierStore.getState().createDossier('D', '');
    useDossierStore.setState({ currentDossier: dossier, isReadOnly: false });

    setPluginWriteLock('audit', 'journal unreachable');
    await expect(useDossierStore.getState().createElement('x', { x: 0, y: 0 })).rejects.toBeInstanceOf(DossierLockedError);
    await expect(useDossierStore.getState().createDossier('E', '')).rejects.toBeInstanceOf(DossierLockedError);
    await expect(useDossierStore.getState().deleteDossier(dossier.id)).rejects.toBeInstanceOf(DossierLockedError);
    await expect(useDossierStore.getState().updateDossier(dossier.id, { name: 'n' })).rejects.toBeInstanceOf(DossierLockedError);

    setPluginWriteLock('audit', null);
    await useDossierStore.getState().updateDossier(dossier.id, { name: 'n' });
    expect(useDossierStore.getState().currentDossier?.name).toBe('n');
  });
});
