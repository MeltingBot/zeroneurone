import { test, expect, type Page } from '@playwright/test';
import { setupCleanEnvironment, waitForAppLoad, createTestDossier } from './fixtures/test-utils';

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    __znImport(path: string): Promise<any>;
  }
}

/** Import an app module as the app loaded it (a reused dev server adds `?t=`) */
const exposeImporter = (page: Page) =>
  page.addInitScript(() => {
    window.__znImport = (path: string) => {
      const loaded = performance
        .getEntriesByType('resource')
        .map((e) => e.name)
        .filter((name) => new URL(name).pathname === path);
      return import(/* @vite-ignore */ loaded.length > 0 ? loaded[loaded.length - 1] : path);
    };
  });

const element = (page: Page, id: string) =>
  page.evaluate(async (id) => {
    const { useDossierStore } = await window.__znImport('/src/stores/dossierStore.ts');
    const el = useDossierStore.getState().elements.find((e: { id: string }) => e.id === id);
    return { locked: !!el?.isPositionLocked };
  }, id);

test('a right-click on a map marker opens the element menu', async ({ page, browserName }) => {
  test.skip(browserName === 'firefox', 'no WebGL map in headless Firefox');
  test.setTimeout(120_000);
  await exposeImporter(page);
  await setupCleanEnvironment(page);
  await waitForAppLoad(page);
  await createTestDossier(page, 'Carte menu');

  const ids = await page.evaluate(async () => {
    const { useDossierStore } = await window.__znImport('/src/stores/dossierStore.ts');
    const s = useDossierStore.getState();
    const a = await s.createElement('Paris', { x: 0, y: 0 }, { tags: ['ville'], geo: { type: 'point', lat: 48.8566, lng: 2.3522 } });
    const b = await s.createElement('Lyon', { x: 200, y: 0 }, { tags: ['ville'], geo: { type: 'point', lat: 45.764, lng: 4.8357 } });
    await s.createLink(a.id, b.id, {});
    const { useViewStore } = await window.__znImport('/src/stores/viewStore.ts');
    useViewStore.getState().setDisplayMode('map');
    return [a.id, b.id];
  });

  const marker = page.locator('.maplibregl-marker[title="Lyon"]');
  await marker.waitFor({ timeout: 20_000 });
  await page.waitForTimeout(1500);

  // Lock: the element is locked and its marker no longer draggable
  await marker.click({ button: 'right' });
  await expect(page.getByRole('menu')).toBeVisible();
  await page.getByRole('menuitem', { name: 'Lock position' }).click();
  await expect(page.getByRole('menu')).toHaveCount(0);
  const selectedId = await page.evaluate(async () => {
    const { useSelectionStore } = await window.__znImport('/src/stores/selectionStore.ts');
    return [...useSelectionStore.getState().selectedElementIds][0] as string;
  });
  expect(ids).toContain(selectedId);
  await expect.poll(() => element(page, selectedId)).toEqual({ locked: true });

  // Unlock from the same menu
  await marker.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Unlock position' }).click();
  await expect.poll(() => element(page, selectedId)).toEqual({ locked: false });

  // Find similar: a query in the side panel
  await marker.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Analyze' }).hover();
  await page.getByRole('menuitem', { name: 'Find similar' }).click();
  await expect.poll(() => page.evaluate(async () => {
    const { useQueryStore } = await window.__znImport('/src/stores/queryStore.ts');
    return useQueryStore.getState().currentText as string;
  })).toContain('ville');

  // Select neighbours: both elements selected
  await marker.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Select neighbors' }).click();
  await expect.poll(() => page.evaluate(async () => {
    const { useSelectionStore } = await window.__znImport('/src/stores/selectionStore.ts');
    return useSelectionStore.getState().selectedElementIds.size as number;
  })).toBe(2);
});

test('an element selected before opening the map is zoomed on, once', async ({ page, browserName }) => {
  test.skip(browserName === 'firefox', 'no WebGL map in headless Firefox');
  test.setTimeout(120_000);
  await exposeImporter(page);
  await setupCleanEnvironment(page);
  await waitForAppLoad(page);
  await createTestDossier(page, 'Carte zoom');

  await page.evaluate(async () => {
    const { useDossierStore } = await window.__znImport('/src/stores/dossierStore.ts');
    const s = useDossierStore.getState();
    await s.createElement('Paris', { x: 0, y: 0 }, { geo: { type: 'point', lat: 48.8566, lng: 2.3522 } });
    const b = await s.createElement('Lyon', { x: 200, y: 0 }, { geo: { type: 'point', lat: 45.764, lng: 4.8357 } });
    (await window.__znImport('/src/stores/selectionStore.ts')).useSelectionStore.getState().selectElement(b.id);
    (await window.__znImport('/src/stores/viewStore.ts')).useViewStore.getState().setDisplayMode('map');
  });

  // Lyon ends up in the middle of the map, Paris far out of it
  const map = page.locator('.maplibregl-canvas');
  await map.waitFor();
  const centred = async () => {
    const m = await map.boundingBox();
    const l = await page.locator('.maplibregl-marker[title="Lyon"]').boundingBox();
    if (!m || !l) return false;
    return Math.abs(l.x + l.width / 2 - (m.x + m.width / 2)) < 30;
  };
  await expect.poll(centred, { timeout: 15_000 }).toBe(true);
});
