import { test, expect } from '@playwright/test';

/**
 * A full backup carries what lives only in a dossier's Y.Doc once it has been
 * worked on: comments, tabs, groups and saved queries, for a dossier that is
 * no longer open. Backups before format 2.0 read the flat tables and lost them.
 * Dev server only: reaches the stores through Vite's module URLs.
 */
test('full backup restores comments, tabs, groups and queries of a worked dossier', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const dossierId = await page.evaluate(async () => {
    const { useDossierStore } = await import('/src/stores/dossierStore.ts');
    return (await useDossierStore.getState().createDossier('Travaillé', '')).id;
  });
  await page.goto(`/dossier/${dossierId}`);
  await page.waitForSelector('.react-flow__pane', { timeout: 30_000 });

  await page.evaluate(async () => {
    const { useDossierStore } = await import('/src/stores/dossierStore.ts');
    const { useTabStore } = await import('/src/stores/tabStore.ts');
    const { db } = await import('/src/db/database.ts');
    const d = useDossierStore.getState();
    const a = await d.createElement('A', { x: 0, y: 0 });
    const b = await d.createElement('B', { x: 300, y: 0 });
    await d.createLink(a.id, b.id, { label: 'lien' });
    await d.createGroup('Groupe', { x: -50, y: -50 }, { width: 200, height: 200 }, [a.id]);
    await d.createComment(a.id, 'element', 'un commentaire');
    const tab = await useTabStore.getState().createTab(d.currentDossier!.id, 'Piste');
    await useTabStore.getState().addMembers(tab.id, [b.id]);
    const now = new Date();
    await db.savedQueries.add({ id: crypto.randomUUID(), dossierId: d.currentDossier!.id, name: 'Ma requête', query: 'label = "A"', createdAt: now, updatedAt: now } as never);
  });
  // Let the Y.Doc persist, then leave the dossier: it is now closed
  await page.waitForTimeout(1500);
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const restoredId = await page.evaluate(async (sourceId) => {
    const { backupService } = await import('/src/services/backupService.ts');
    const { db } = await import('/src/db/database.ts');
    const blob = await backupService.exportAll();
    const result = await backupService.importAll(new File([blob], 'backup.zip'));
    if (!result.success) throw new Error(result.errors.join(', '));
    const copy = (await db.dossiers.toArray()).find((d) => d.name === 'Travaillé' && d.id !== sourceId);
    return copy!.id;
  }, dossierId);

  await page.goto(`/dossier/${restoredId}`);
  await page.waitForSelector('.react-flow__pane', { timeout: 30_000 });
  await expect.poll(async () => page.evaluate(async () => {
    const { useDossierStore } = await import('/src/stores/dossierStore.ts');
    const { useTabStore } = await import('/src/stores/tabStore.ts');
    const { db } = await import('/src/db/database.ts');
    const d = useDossierStore.getState();
    const group = d.elements.find((e) => e.isGroup);
    const a = d.elements.find((e) => e.label === 'A');
    return {
      elements: d.elements.filter((e) => !e.isGroup).map((e) => e.label).sort(),
      links: d.links.map((l) => l.label),
      inGroup: !!group && a?.parentGroupId === group.id,
      comments: d.comments.map((c) => c.content),
      tabs: useTabStore.getState().tabs.map((t) => t.name),
      queries: (await db.savedQueries.where({ dossierId: d.currentDossier!.id }).toArray()).map((q) => q.name),
    };
  }), { timeout: 15_000 }).toEqual({
    elements: ['A', 'B'],
    links: ['lien'],
    inGroup: true,
    comments: ['un commentaire'],
    tabs: ['Piste'],
    queries: ['Ma requête'],
  });
});
