import { test, expect } from '@playwright/test';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setupCleanEnvironment, waitForAppLoad } from './fixtures/test-utils';
import { buildLargeDossierJson } from './fixtures/large-dossier';

/**
 * Right-click on a selection → Tabs → "New tab with selection": a tab holding
 * exactly the selection is created and opened, even when the dossier has no
 * tab yet. Dev server only: reaches the stores through Vite's module URLs.
 */
test('a new tab can be made from the selection', async ({ page }) => {
  test.setTimeout(120_000);
  await setupCleanEnvironment(page);
  await waitForAppLoad(page);
  const file = join(mkdtempSync(join(tmpdir(), 'zn-')), 'small.json');
  writeFileSync(file, buildLargeDossierJson(30));
  await page.click('[data-testid="import-button"]');
  await page.setInputFiles('input[type="file"]', file);
  await page.waitForSelector('.react-flow__node');
  await page.waitForTimeout(1500);

  // Select three nodes that are on screen.
  const ids = await page.evaluate(async () => {
    const ids = [...document.querySelectorAll('.react-flow__node')].slice(0, 3).map((n) => n.getAttribute('data-id')!);
    (await import('/src/stores/selectionStore.ts')).useSelectionStore.getState().selectElements(ids);
    return ids;
  });
  await page.waitForTimeout(300);

  await page.locator(`.react-flow__node[data-id="${ids[0]}"]`).click({ button: 'right' });
  // With no tab yet, the Tabs submenu holds this one entry and the menu
  // shows it inline; with tabs, it sits in the submenu.
  const tabsMenu = page.getByRole('menuitem', { name: 'Tabs' });
  if (await tabsMenu.count()) await tabsMenu.hover();
  await page.getByRole('menuitem', { name: 'New tab with selection' }).click();
  await page.waitForTimeout(500);

  const tab = await page.evaluate(async () => {
    const { useTabStore } = await import('/src/stores/tabStore.ts');
    const s = useTabStore.getState();
    const active = s.tabs.find((t) => t.id === s.activeTabId);
    return { count: s.tabs.length, name: active?.name, members: active ? [...active.memberElementIds].sort() : [] };
  });
  expect(tab.count).toBe(1);
  expect(tab.name).toBe('Tab 1');
  expect(tab.members).toEqual([...ids].sort());

  // Second time, a tab exists: the entry sits in the Tabs submenu.
  const ids2 = await page.evaluate(async (first) => {
    const ids = [...document.querySelectorAll('.react-flow__node')]
      .map((n) => n.getAttribute('data-id')!).filter((id) => first.includes(id)).slice(0, 2);
    (await import('/src/stores/selectionStore.ts')).useSelectionStore.getState().selectElements(ids);
    return ids;
  }, ids);
  await page.waitForTimeout(300);
  await page.locator(`.react-flow__node[data-id="${ids2[0]}"]`).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Tabs' }).hover();
  await page.getByRole('menuitem', { name: 'New tab with selection' }).click();
  await page.waitForTimeout(500);
  const tab2 = await page.evaluate(async () => {
    const { useTabStore } = await import('/src/stores/tabStore.ts');
    const s = useTabStore.getState();
    const active = s.tabs.find((t) => t.id === s.activeTabId);
    return { count: s.tabs.length, name: active?.name, members: active ? [...active.memberElementIds].sort() : [] };
  });
  expect(tab2.count).toBe(2);
  expect(tab2.name).toBe('Tab 2');
  expect(tab2.members).toEqual([...ids2].sort());
});
