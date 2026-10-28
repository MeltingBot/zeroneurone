// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/database';
import { useDossierStore } from './dossierStore';
import { useReportStore } from './reportStore';
import { snapshotBeforeImport } from '../services/importCommit';
import { DossierLockedError, getOpenDossierLock, retentionExpiresAt } from '../utils/dossierLock';
import { onPluginEvent } from '../plugins/pluginEventBus';
import type { Dossier, DossierId } from '../types';

const DAY = 86400000;

async function openDossier(): Promise<Dossier> {
  const dossier = await useDossierStore.getState().createDossier('Clôture', '');
  useDossierStore.setState({ currentDossier: dossier, isReadOnly: false });
  return dossier;
}

const current = () => useDossierStore.getState().currentDossier!;

describe('dossier closure', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    useDossierStore.setState({ currentDossier: null, dossiers: [], isReadOnly: false });
  });

  it('closes: read-only, persisted, event emitted', async () => {
    const d = await openDossier();
    const events: string[] = [];
    const off = onPluginEvent('dossier:caseClosed', (e) => events.push(e.dossierId));

    await useDossierStore.getState().closeDossier(d.id);
    off();

    expect(current().closedAt).toBeInstanceOf(Date);
    expect((await db.dossiers.get(d.id))?.closedAt).toBeInstanceOf(Date);
    expect(getOpenDossierLock()).toBe('closed');
    expect(events).toEqual([d.id]);
    await expect(useDossierStore.getState().createElement('x', { x: 0, y: 0 })).rejects.toBeInstanceOf(DossierLockedError);
    await expect(useDossierStore.getState().updateDossier(d.id, { name: 'autre' })).rejects.toBeInstanceOf(DossierLockedError);
    await expect(useReportStore.getState().addSection('s')).rejects.toBeInstanceOf(DossierLockedError);
    await expect(snapshotBeforeImport(d.id as DossierId)).rejects.toBeInstanceOf(DossierLockedError);
  });

  it('keeps lifecycle fields editable while closed', async () => {
    const d = await openDossier();
    await useDossierStore.getState().closeDossier(d.id);
    await useDossierStore.getState().updateDossier(d.id, { isFavorite: true, retentionDays: 30 });
    expect(current().retentionDays).toBe(30);
  });

  it('reopens: writable again, past closure kept', async () => {
    const d = await openDossier();
    await useDossierStore.getState().closeDossier(d.id);
    const firstClosure = current().closedAt!;
    await useDossierStore.getState().reopenDossier(d.id);

    expect(current().closedAt).toBeNull();
    expect(getOpenDossierLock()).toBeNull();
    expect(current().closureHistory).toHaveLength(1);
    expect(current().closureHistory![0].closedAt.getTime()).toBe(new Date(firstClosure).getTime());
    expect((await db.dossiers.get(d.id))?.closureHistory).toHaveLength(1);
    await useDossierStore.getState().updateDossier(d.id, { name: 'renommé' });
    expect(current().name).toBe('renommé');
  });
});

describe('retentionExpiresAt', () => {
  const createdAt = new Date('2026-01-01T00:00:00Z');
  const closedAt = new Date('2026-03-01T00:00:00Z');

  it('counts from creation by default', () => {
    expect(retentionExpiresAt({ createdAt, closedAt }, 10)?.getTime()).toBe(createdAt.getTime() + 10 * DAY);
  });

  it('counts from closure when asked, and never expires while open', () => {
    expect(retentionExpiresAt({ createdAt, closedAt, retentionFrom: 'closed' }, 10)?.getTime()).toBe(closedAt.getTime() + 10 * DAY);
    expect(retentionExpiresAt({ createdAt, closedAt: null, retentionFrom: 'closed' }, 10)).toBeNull();
  });

  it('keeps counting from the first closure after a reopening', () => {
    const reclosed = new Date('2026-06-01T00:00:00Z');
    const closureHistory = [{ closedAt, reopenedAt: new Date('2026-04-01T00:00:00Z') }];
    const first = closedAt.getTime() + 10 * DAY;
    expect(retentionExpiresAt({ createdAt, closedAt: reclosed, closureHistory, retentionFrom: 'closed' }, 10)?.getTime()).toBe(first);
    expect(retentionExpiresAt({ createdAt, closedAt: null, closureHistory, retentionFrom: 'closed' }, 10)?.getTime()).toBe(first);
  });
});
