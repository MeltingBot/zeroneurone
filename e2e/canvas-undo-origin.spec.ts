import { test, expect } from '@playwright/test';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setupCleanEnvironment, waitForAppLoad } from './fixtures/test-utils';
import { buildLargeDossierJson } from './fixtures/large-dossier';

/**
 * Ctrl+Z on the canvas replays through the history store: plugins receive
 * the restored element with origin "undo", not as a fresh user action.
 * Dev server only: reaches the stores through Vite's module URLs.
 */
test('Ctrl+Z on the canvas marks the replayed events as undo', async ({ page }) => {
  test.setTimeout(120_000);
  await setupCleanEnvironment(page);
  await waitForAppLoad(page);
  const file = join(mkdtempSync(join(tmpdir(), 'zn-')), 'undo-origin.json');
  writeFileSync(file, buildLargeDossierJson(3));
  await page.click('[data-testid="import-button"]');
  await page.setInputFiles('input[type="file"]', file);
  await page.waitForSelector('.react-flow__node');
  await page.waitForTimeout(1000);

  const id = await page.evaluate(async () => {
    const d = (await import('/src/stores/dossierStore.ts')).useDossierStore.getState();
    const target = d.elements[0].id;
    (await import('/src/stores/selectionStore.ts')).useSelectionStore.getState().selectElements([target]);
    return target;
  });
  await page.keyboard.press('Delete');
  await expect.poll(() => page.evaluate(async (target) =>
    (await import('/src/stores/dossierStore.ts')).useDossierStore.getState().elements.some((e) => e.id === target), id)).toBe(false);

  await page.evaluate(async () => {
    const bus = await import('/src/plugins/pluginEventBus.ts');
    const w = window as unknown as { __origins: string[] };
    w.__origins = [];
    bus.onAnyPluginEvent((event) => {
      if (event.type === 'element:created') w.__origins.push(event.origin);
    });
  });
  await page.keyboard.press('Control+z');

  await expect.poll(() => page.evaluate(() => (window as unknown as { __origins: string[] }).__origins)).toEqual(['undo']);
});

test('cut, undo and redo restore then remove elements, links and tab membership', async ({ page }) => {
  test.setTimeout(120_000);
  await setupCleanEnvironment(page);
  await waitForAppLoad(page);
  const file = join(mkdtempSync(join(tmpdir(), 'zn-')), 'cut.json');
  writeFileSync(file, buildLargeDossierJson(20));
  await page.click('[data-testid="import-button"]');
  await page.setInputFiles('input[type="file"]', file);
  await page.waitForSelector('.react-flow__node');
  await page.waitForTimeout(1000);

  const state = () => page.evaluate(async () => {
    const d = (await import('/src/stores/dossierStore.ts')).useDossierStore.getState();
    const t = (await import('/src/stores/tabStore.ts')).useTabStore.getState();
    return { elements: d.elements.length, links: d.links.length, inTab: t.memberSet.size };
  });

  await page.evaluate(async () => {
    const d = (await import('/src/stores/dossierStore.ts')).useDossierStore.getState();
    const tabs = (await import('/src/stores/tabStore.ts')).useTabStore;
    const tab = await tabs.getState().createTab(d.currentDossier!.id, 'Tab');
    await tabs.getState().addMembers(tab.id, d.elements.map((e) => e.id));
    tabs.getState().setActiveTab(tab.id);
  });
  await page.waitForTimeout(800);
  const before = await state();

  await page.evaluate(async () => {
    const d = (await import('/src/stores/dossierStore.ts')).useDossierStore.getState();
    (await import('/src/stores/selectionStore.ts')).useSelectionStore.getState()
      .selectElements(d.elements.slice(0, 5).map((e) => e.id));
  });
  await page.keyboard.press('Control+x');
  // The tab cleanup finishes after the elements leave the state
  await expect.poll(state).toMatchObject({ elements: before.elements - 5, inTab: before.inTab - 5 });
  const afterCut = await state();
  expect(afterCut.links).toBeLessThan(before.links);

  await page.keyboard.press('Control+z');
  await expect.poll(state).toEqual(before);

  await page.keyboard.press('Control+Shift+z');
  await expect.poll(state).toEqual(afterCut);
});

test('an undo right after a cut, before the tab cleanup ends, still restores the tab', async ({ page }) => {
  test.setTimeout(120_000);
  await setupCleanEnvironment(page);
  await waitForAppLoad(page);
  const file = join(mkdtempSync(join(tmpdir(), 'zn-')), 'fast-undo.json');
  writeFileSync(file, buildLargeDossierJson(20));
  await page.click('[data-testid="import-button"]');
  await page.setInputFiles('input[type="file"]', file);
  await page.waitForSelector('.react-flow__node');
  await page.waitForTimeout(1000);

  const inTab = () => page.evaluate(async () =>
    (await import('/src/stores/tabStore.ts')).useTabStore.getState().memberSet.size);
  await page.evaluate(async () => {
    const d = (await import('/src/stores/dossierStore.ts')).useDossierStore.getState();
    const tabs = (await import('/src/stores/tabStore.ts')).useTabStore;
    const tab = await tabs.getState().createTab(d.currentDossier!.id, 'Tab');
    await tabs.getState().addMembers(tab.id, d.elements.map((e) => e.id));
    tabs.getState().setActiveTab(tab.id);
    (await import('/src/stores/selectionStore.ts')).useSelectionStore.getState()
      .selectElements(d.elements.slice(0, 5).map((e) => e.id));
  });
  await page.waitForTimeout(800);
  expect(await inTab()).toBe(20);

  // Cut then undo at once, the way a quick Ctrl+X, Ctrl+Z goes
  await page.keyboard.press('Control+x');
  await page.keyboard.press('Control+z');

  await page.waitForTimeout(2000);
  expect(await inTab()).toBe(20);
});
