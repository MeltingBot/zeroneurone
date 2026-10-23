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
/** Members of every tab, by name, and the active tab's name. */
async function readTabs(page: import('@playwright/test').Page) {
  return page.evaluate(async () => {
    const s = (await import('/src/stores/tabStore.ts')).useTabStore.getState();
    return {
      active: s.tabs.find((t) => t.id === s.activeTabId)?.name ?? null,
      members: Object.fromEntries(s.tabs.map((t) => [t.name, [...t.memberElementIds].sort()])),
    };
  });
}

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
  // Made from inside Tab 1: the elements moved, they left Tab 1.
  const afterSplit = await readTabs(page);
  expect(afterSplit.members['Tab 1']).toEqual(ids.filter((id) => !ids2.includes(id)).sort());

  // Third, from the selection menu (right-click on the canvas background with
  // elements selected), the one a rubber-band selection leads to.
  const ids3 = await page.evaluate(async () => {
    (await import('/src/stores/tabStore.ts')).useTabStore.getState().setActiveTab(null);
    // Let the canvas settle on "All" (no ghost left on screen)
    await new Promise((r) => setTimeout(r, 1500));
    const ids = [...document.querySelectorAll('.react-flow__node')].slice(0, 4).map((n) => n.getAttribute('data-id')!);
    const sel = (await import('/src/stores/selectionStore.ts')).useSelectionStore;
    sel.getState().selectElements(ids);
    return [...sel.getState().selectedElementIds];
  });
  expect(ids3.length).toBeGreaterThan(1);
  await page.waitForTimeout(300);
  const pane = (await page.locator('.react-flow__pane').boundingBox())!;
  // Bottom-left: the grid fills the top, the minimap sits bottom-right.
  await page.mouse.click(pane.x + 40, pane.y + pane.height - 40, { button: 'right' });
  // The selection as the menu sees it (the app prunes what is not displayed)
  const menuSelection = await page.evaluate(async () =>
    [...(await import('/src/stores/selectionStore.ts')).useSelectionStore.getState().selectedElementIds]);
  await expect(page.getByText(`${menuSelection.length} selected`).last()).toBeVisible();
  await page.getByRole('menuitem', { name: 'Tabs' }).hover();
  await page.getByRole('menuitem', { name: 'New tab with selection' }).click();
  await page.waitForTimeout(500);
  const tab3 = await page.evaluate(async () => {
    const { useTabStore } = await import('/src/stores/tabStore.ts');
    const s = useTabStore.getState();
    const active = s.tabs.find((t) => t.id === s.activeTabId);
    return { count: s.tabs.length, members: active ? [...active.memberElementIds].sort() : [] };
  });
  expect(tab3.count).toBe(3);
  expect(tab3.members).toEqual([...menuSelection].sort());

  // Fourth, inside Tab 3: "Move to tab" sends the selection to Tab 1 and out
  // of Tab 3.
  const moved = menuSelection.slice(0, 2);
  await page.evaluate(async (ids) => {
    (await import('/src/stores/selectionStore.ts')).useSelectionStore.getState().selectElements(ids);
  }, moved);
  await page.waitForTimeout(300);
  await page.mouse.click(pane.x + 40, pane.y + pane.height - 40, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Tabs' }).hover();
  // Under the "Move to tab..." header, Tab 1 comes first
  await page.getByRole('menuitem', { name: 'Tab 1' }).first().click();
  await page.waitForTimeout(500);
  const afterMove = await readTabs(page);
  expect(afterMove.active).toBe('Tab 3');
  for (const id of moved) {
    expect(afterMove.members['Tab 1']).toContain(id);
    expect(afterMove.members['Tab 3']).not.toContain(id);
  }
});
