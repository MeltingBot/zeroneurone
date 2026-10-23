import { test, expect } from '@playwright/test';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setupCleanEnvironment, waitForAppLoad } from './fixtures/test-utils';
import { buildLargeDossierJson } from './fixtures/large-dossier';

/**
 * Undoing a deletion brings every element and link back at once, into the tab
 * they were deleted from. It used to re-create them one by one, one render
 * each: a few hundred elements took tens of seconds to come back.
 * Dev server only: reaches the stores through Vite's module URLs.
 */
test('undoing a deletion restores the lot at once, in its tab', async ({ page }) => {
  test.setTimeout(180_000);
  await setupCleanEnvironment(page);
  await waitForAppLoad(page);
  const file = join(mkdtempSync(join(tmpdir(), 'zn-')), 'undo.json');
  writeFileSync(file, buildLargeDossierJson(2000));
  await page.click('[data-testid="import-button"]');
  await page.setInputFiles('input[type="file"]', file);
  await page.waitForSelector('.react-flow__node', { timeout: 60_000 });
  await page.waitForTimeout(3000);

  // Work inside a tab holding everything
  const before = await page.evaluate(async () => {
    const d = (await import('/src/stores/dossierStore.ts')).useDossierStore.getState();
    const tabs = (await import('/src/stores/tabStore.ts')).useTabStore;
    const tab = await tabs.getState().createTab(d.currentDossier!.id, 'Initial');
    await tabs.getState().addMembers(tab.id, d.elements.map((e) => e.id));
    tabs.getState().setActiveTab(tab.id);
    return { elements: d.elements.length, links: d.links.length };
  });
  await page.waitForTimeout(1500);

  await page.evaluate(async () => {
    const d = (await import('/src/stores/dossierStore.ts')).useDossierStore.getState();
    (await import('/src/stores/selectionStore.ts')).useSelectionStore.getState()
      .selectElements(d.elements.slice(0, 300).map((e) => e.id));
  });
  await page.keyboard.press('Delete');
  await page.waitForTimeout(1500);
  const afterDelete = await page.evaluate(async () => (await import('/src/stores/dossierStore.ts')).useDossierStore.getState().elements.length);
  expect(afterDelete).toBe(before.elements - 300);

  await page.keyboard.press('Control+z');
  // All back within a couple of seconds, not one by one
  await expect.poll(async () => page.evaluate(async () => {
    const d = (await import('/src/stores/dossierStore.ts')).useDossierStore.getState();
    const t = (await import('/src/stores/tabStore.ts')).useTabStore.getState();
    return {
      elements: d.elements.length,
      links: d.links.length,
      inTab: t.memberSet.size,
    };
  }), { timeout: 3000 }).toEqual({ elements: before.elements, links: before.links, inTab: before.elements });
});
