import { test, expect, type Page } from '@playwright/test';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setupCleanEnvironment, waitForAppLoad } from './fixtures/test-utils';
import { buildLargeDossierJson } from './fixtures/large-dossier';

/**
 * "Show" on a duplicate name cycles through every element of that name, one
 * nested in a group included (its position is relative to the group), and a
 * tab strip wider than the window stays reachable (scroll arrows, list), with
 * no ceiling on the number of tabs.
 * Dev server only: reaches the stores through Vite's module URLs.
 */

async function openDossier(page: Page, count: number) {
  await setupCleanEnvironment(page);
  await waitForAppLoad(page);
  const file = join(mkdtempSync(join(tmpdir(), 'zn-')), 'dossier.json');
  writeFileSync(file, buildLargeDossierJson(count));
  await page.click('[data-testid="import-button"]');
  await page.setInputFiles('input[type="file"]', file);
  await page.waitForSelector('.react-flow__node');
  await page.waitForTimeout(1000);
}

/** The node's centre lies inside the canvas pane (off-screen nodes are not rendered). */
async function isOnScreen(page: Page, id: string) {
  const locator = page.locator(`.react-flow__node[data-id="${id}"]`);
  if ((await locator.count()) === 0) return false;
  const node = await locator.boundingBox();
  const pane = await page.locator('.react-flow').boundingBox();
  if (!node || !pane) return false;
  const cx = node.x + node.width / 2;
  const cy = node.y + node.height / 2;
  return cx >= pane.x && cx <= pane.x + pane.width && cy >= pane.y && cy <= pane.y + pane.height;
}

test('Show cycles through duplicates, one inside a group included', async ({ page }) => {
  test.setTimeout(120_000);
  await openDossier(page, 3);

  const { a, b } = await page.evaluate(async () => {
    const store = (await import('/src/stores/dossierStore.ts')).useDossierStore;
    const a = await store.getState().createElement('Doublon', { x: 0, y: 0 });
    const group = await store.getState().createGroup('Groupe', { x: 4000, y: 3000 }, { width: 400, height: 300 });
    const b = await store.getState().createElement('Doublon', { x: 4100, y: 3100 });
    // The store mirrors the Y.Doc with a short delay: wait for both to be there
    while (!store.getState().elements.some((el) => el.id === b.id)
      || !store.getState().elements.some((el) => el.id === group.id)) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    await store.getState().addToGroup([b.id], group.id);
    while (store.getState().elements.find((el) => el.id === b.id)?.parentGroupId !== group.id) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    (await import('/src/stores/selectionStore.ts')).useSelectionStore.getState().selectElements([a.id]);
    return { a: a.id, b: b.id };
  });
  await page.waitForTimeout(800);

  const show = page.getByRole('button', { name: 'Show', exact: true });
  await show.click();
  await page.waitForTimeout(800);
  expect(await isOnScreen(page, b)).toBe(true);

  // Back to the element we started from, then round again
  await show.click();
  await page.waitForTimeout(800);
  expect(await isOnScreen(page, a)).toBe(true);
  expect(await isOnScreen(page, b)).toBe(false);

  await show.click();
  await page.waitForTimeout(800);
  expect(await isOnScreen(page, b)).toBe(true);
});

test('every tab stays reachable when the strip overflows', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1100, height: 800 });
  await openDossier(page, 3);

  const names = await page.evaluate(async () => {
    const d = (await import('/src/stores/dossierStore.ts')).useDossierStore.getState();
    const tabs = (await import('/src/stores/tabStore.ts')).useTabStore;
    const names: string[] = [];
    for (let i = 1; i <= 12; i++) {
      const name = `Onglet au nom vraiment très long ${i}`;
      await tabs.getState().createTab(d.currentDossier!.id, name);
      names.push(name);
    }
    return names;
  });
  await page.waitForTimeout(500);

  const last = page.locator('[data-tab-id]').filter({ hasText: new RegExp(`^${names[11]}$`) });
  const next = page.getByRole('button', { name: 'Next tabs' });
  await expect(next).toBeVisible();
  await expect(page.getByTitle('New tab')).toBeInViewport();
  await expect(last).not.toBeInViewport();

  // The arrow scrolls the strip, and disappears at its end
  // (smooth scrolling may still be running: the arrow can vanish right before a click)
  for (let i = 0; i < 10 && (await next.isVisible()); i++) {
    await next.click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(600);
  }
  await expect(next).toBeHidden();
  await expect(last).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Previous tabs' })).toBeVisible();

  // No ceiling on the number of tabs: + still adds one past the old limit of 10
  await page.getByTitle('New tab').click();
  // The new tab opens in rename mode once created
  await expect(page.locator('[data-tab-id] input')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(async () =>
    (await import('/src/stores/tabStore.ts')).useTabStore.getState().tabs.length)).toBe(13);

  // The list opens any tab directly, and the strip follows it
  await page.getByRole('button', { name: 'All tabs' }).click();
  await page.getByRole('menuitem', { name: names[0], exact: true }).click();
  await page.waitForTimeout(800);
  const first = page.locator('[data-tab-id]').filter({ hasText: new RegExp(`^${names[0]}$`) });
  await expect(first).toBeInViewport();
  const activeName = await page.evaluate(async () => {
    const t = (await import('/src/stores/tabStore.ts')).useTabStore.getState();
    return t.tabs.find((tab) => tab.id === t.activeTabId)?.name;
  });
  expect(activeName).toBe(names[0]);
});
