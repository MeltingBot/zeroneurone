// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '../database';
import { dossierRepository } from './dossierRepository';

// Every table that stores rows scoped to a dossier.
const SCOPED_TABLES = [
  'elements',
  'links',
  'assets',
  'views',
  'reports',
  'canvasTabs',
  'pluginData',
  'savedQueries',
  'comments',
] as const;

async function seedDossier(dossierId: string) {
  await db.dossiers.add({ id: dossierId, name: `Case ${dossierId}` } as never);
  await db.elements.add({ id: `el-${dossierId}`, dossierId, label: 'E' } as never);
  await db.links.add({ id: `li-${dossierId}`, dossierId } as never);
  await db.assets.add({ id: `as-${dossierId}`, dossierId } as never);
  await db.views.add({ id: `vi-${dossierId}`, dossierId } as never);
  await db.reports.add({ id: `re-${dossierId}`, dossierId } as never);
  await db.canvasTabs.add({ id: `ct-${dossierId}`, dossierId } as never);
  await db.pluginData.add({ pluginId: 'p', investigationId: dossierId, dossierId, key: 'k', value: 1 } as never);
  await db.savedQueries.add({ id: `sq-${dossierId}`, dossierId, name: 'Q' } as never);
  await db.comments.add({ id: `co-${dossierId}`, dossierId, targetId: 't' } as never);
}

async function countFor(dossierId: string) {
  const counts: Record<string, number> = {};
  for (const table of SCOPED_TABLES) {
    counts[table] = await db.table(table).where({ dossierId }).count();
  }
  return counts;
}

describe('dossierRepository.delete', () => {
  beforeEach(async () => {
    if (!db.isOpen()) await db.open();
    await Promise.all([
      db.dossiers.clear(),
      ...SCOPED_TABLES.map((t) => db.table(t).clear()),
    ]);
  });

  afterEach(async () => {
    await Promise.all([
      db.dossiers.clear(),
      ...SCOPED_TABLES.map((t) => db.table(t).clear()),
    ]);
  });

  it('leaves no rows behind in any dossier-scoped table', async () => {
    await seedDossier('d1');
    // Guard: the fixture really populated every table we check.
    expect(Object.values(await countFor('d1')).every((n) => n === 1)).toBe(true);

    await dossierRepository.delete('d1');

    expect(await countFor('d1')).toEqual(
      Object.fromEntries(SCOPED_TABLES.map((t) => [t, 0]))
    );
    expect(await db.dossiers.get('d1')).toBeUndefined();
  });

  it('does not touch other dossiers', async () => {
    await seedDossier('d1');
    await seedDossier('d2');

    await dossierRepository.delete('d1');

    expect(await countFor('d2')).toEqual(
      Object.fromEntries(SCOPED_TABLES.map((t) => [t, 1]))
    );
    expect(await db.dossiers.get('d2')).toBeDefined();
  });

  it('covers savedQueries and comments, which the delete used to miss', async () => {
    await seedDossier('d1');

    await dossierRepository.delete('d1');

    expect(await db.savedQueries.where({ dossierId: 'd1' }).count()).toBe(0);
    expect(await db.comments.where({ dossierId: 'd1' }).count()).toBe(0);
  });
});
