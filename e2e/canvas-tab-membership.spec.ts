import { test, expect, type Page } from '@playwright/test';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setupCleanEnvironment, waitForAppLoad } from './fixtures/test-utils';
import { buildLargeDossierJson } from './fixtures/large-dossier';

/**
 * An element may belong to no tab: "All" is the dossier, tabs are views of
 * part of it. It can leave its last tab (undoable), and one created in "All"
 * stays out of every tab, reopening included (no automatic filing).
 * Dev server only: reaches the stores through Vite's module URLs.
 */

async function tabsOf(page: Page, id: string) {
  return page.evaluate(async (elementId) => {
    const t = (await import('/src/stores/tabStore.ts')).useTabStore.getState();
    return t.tabs.filter((tab) => tab.memberElementIds.includes(elementId)).map((tab) => tab.name);
  }, id);
}

test('elements can live outside every tab', async ({ page }) => {
  test.setTimeout(120_000);
  await setupCleanEnvironment(page);
  await waitForAppLoad(page);
  const file = join(mkdtempSync(join(tmpdir(), 'zn-')), 'tabs.json');
  writeFileSync(file, buildLargeDossierJson(30));
  await page.click('[data-testid="import-button"]');
  await page.setInputFiles('input[type="file"]', file);
  await page.waitForSelector('.react-flow__node');
  await page.waitForTimeout(1500);

  // One tab holding every element, opened
  await page.evaluate(async () => {
    const d = (await import('/src/stores/dossierStore.ts')).useDossierStore.getState();
    const tabs = (await import('/src/stores/tabStore.ts')).useTabStore;
    const tab = await tabs.getState().createTab(d.currentDossier!.id, 'Tab 1');
    await tabs.getState().addMembers(tab.id, d.elements.map((e) => e.id));
    tabs.getState().setActiveTab(tab.id);
  });
  await page.waitForTimeout(1000);

  // Remove an element from its only tab, through the element menu
  const id = await page.evaluate(() => document.querySelector('.react-flow__node')!.getAttribute('data-id')!);
  await page.evaluate(async (elementId) => {
    (await import('/src/stores/selectionStore.ts')).useSelectionStore.getState().selectElements([elementId]);
  }, id);
  await page.locator(`.react-flow__node[data-id="${id}"]`).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Tabs' }).hover();
  await page.getByRole('menuitem', { name: 'Remove from tab' }).click();
  await page.waitForTimeout(500);
  expect(await tabsOf(page, id)).toEqual([]);
  // Still in the dossier
  expect(await page.evaluate(async (elementId) =>
    (await import('/src/stores/dossierStore.ts')).useDossierStore.getState().elements.some((e) => e.id === elementId), id)).toBe(true);

  // Ctrl+Z puts it back in its tab
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(500);
  expect(await tabsOf(page, id)).toEqual(['Tab 1']);

  // Created in "All": in no tab, and still in none after reopening
  const created = await page.evaluate(async () => {
    (await import('/src/stores/tabStore.ts')).useTabStore.getState().setActiveTab(null);
    const store = (await import('/src/stores/dossierStore.ts')).useDossierStore.getState();
    return (await store.createElement('Made in All', { x: -400, y: -400 })).id;
  });
  await page.waitForTimeout(1000);
  expect(await tabsOf(page, created)).toEqual([]);
  await page.reload();
  await page.waitForSelector('.react-flow__node', { timeout: 60_000 });
  await page.waitForTimeout(2000);
  expect(await tabsOf(page, created)).toEqual([]);
});
