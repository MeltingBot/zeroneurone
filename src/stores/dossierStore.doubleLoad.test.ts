// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { useDossierStore } from './dossierStore';
import { dossierRepository } from '../db/repositories/dossierRepository';
import { syncService } from '../services/syncService';

/**
 * React StrictMode (dev) mounts the dossier page twice: load, unload, load.
 * The second load takes the first one instead of opening the Y.Doc again.
 */
describe('loadDossier twice in a row', () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await syncService.close();
  });

  it('opens the Y.Doc once and loads the dossier', async () => {
    const dossier = await dossierRepository.create('Double', '');
    const openLocal = vi.spyOn(syncService, 'openLocal');
    const { loadDossier, unloadDossier } = useDossierStore.getState();

    const first = loadDossier(dossier.id);
    unloadDossier();
    const second = loadDossier(dossier.id);
    await Promise.all([first, second]);

    expect(openLocal).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
    const state = useDossierStore.getState();
    expect(state.currentDossier?.id).toBe(dossier.id);
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
  });

  it('loads again once the first load is over (reload after an import)', async () => {
    const dossier = await dossierRepository.create('Reload', '');
    const getById = vi.spyOn(dossierRepository, 'getById');
    const first = useDossierStore.getState().loadDossier(dossier.id);
    await first;
    const second = useDossierStore.getState().loadDossier(dossier.id);
    expect(second).not.toBe(first);
    await second;
    // Two full loads; the Y.Doc already open is kept, as before
    expect(getById).toHaveBeenCalledTimes(2);
    expect(useDossierStore.getState().currentDossier?.id).toBe(dossier.id);
    expect(useDossierStore.getState().error).toBeNull();
  });

  it('a later load of a dossier still loading runs on its own (reopened after a stuck load)', async () => {
    const dossier = await dossierRepository.create('Later', '');
    const first = useDossierStore.getState().loadDossier(dossier.id);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const second = useDossierStore.getState().loadDossier(dossier.id);
    expect(second).not.toBe(first);
    await Promise.all([first, second]);
    expect(useDossierStore.getState().currentDossier?.id).toBe(dossier.id);
  });

  it('opens another dossier while one is loading', async () => {
    const a = await dossierRepository.create('A', '');
    const b = await dossierRepository.create('B', '');
    const { loadDossier } = useDossierStore.getState();
    const first = loadDossier(a.id);
    const second = loadDossier(b.id);
    expect(second).not.toBe(first);
    await second;
    expect(useDossierStore.getState().currentDossier?.id).toBe(b.id);
  });
});
