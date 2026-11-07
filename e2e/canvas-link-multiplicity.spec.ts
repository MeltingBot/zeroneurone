import { test, expect, type Page } from '@playwright/test';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setupCleanEnvironment, waitForAppLoad } from './fixtures/test-utils';

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

/** A and B joined by two links (one each way), A and C by one. */
function dossierJson(): string {
  const now = new Date().toISOString();
  const element = (id: string, label: string, x: number, y: number) => ({
    id, label, notes: '', tags: [], properties: [], confidence: null, source: '', date: null, dateRange: null,
    position: { x, y }, isPositionLocked: false, geo: null, events: [], assetIds: [], parentGroupId: null,
    isGroup: false, isAnnotation: false, childIds: [],
    visual: { color: '#93c5fd', borderColor: '#a8a29e', shape: 'rectangle', size: 'medium', icon: null, image: null },
    createdAt: now, updatedAt: now,
  });
  const link = (id: string, fromId: string, toId: string, label: string, color: string) => ({
    id, fromId, toId, label, notes: '', tags: [], properties: [], confidence: null, source: '', date: null,
    dateRange: null, direction: 'forward', directed: true, visual: { color, style: 'solid', thickness: 2 },
    createdAt: now, updatedAt: now,
  });
  return JSON.stringify({
    version: '1.0.0',
    elements: [element('a', 'Alpha', 0, 0), element('b', 'Bravo', 500, 0), element('c', 'Charlie', 0, 300), element('d', 'Delta', 500, 250)],
    links: [
      link('ab', 'a', 'b', 'appelle', '#e07a5f'), link('ba', 'b', 'a', 'rencontre', '#4a8c59'), link('ac', 'a', 'c', 'connaît', '#6b6560'),
      // Leaves Alpha by the same side as its links to Bravo
      { ...link('ad', 'a', 'd', 'paie', '#c9952c'), sourceHandle: 'source-right', targetHandle: 'target-left' },
    ],
  });
}

const store = (page: Page) => page.evaluate(async () => {
  const { useDossierStore } = await window.__znImport('/src/stores/dossierStore.ts');
  const { useSelectionStore } = await window.__znImport('/src/stores/selectionStore.ts');
  const s = useDossierStore.getState();
  return {
    ids: Object.fromEntries(s.links.map((l: { id: string; label: string }) => [l.label, l.id])) as Record<string, string>,
    selected: [...useSelectionStore.getState().selectedLinkIds] as string[],
  };
});

test('links between two elements merge into one line: labels on hover, selected together', async ({ page }) => {
  test.setTimeout(120_000);
  await exposeImporter(page);
  await setupCleanEnvironment(page);
  await waitForAppLoad(page);
  const file = join(mkdtempSync(join(tmpdir(), 'zn-')), 'multiplicity.json');
  writeFileSync(file, dossierJson());
  await page.click('[data-testid="import-button"]');
  await page.setInputFiles('input[type="file"]', file);
  await page.waitForSelector('.react-flow__node');
  // Anchors as stored (both of Alpha's links to Charlie and Delta leave its right side)
  await page.evaluate(async () => {
    const { useDossierStore } = await window.__znImport('/src/stores/dossierStore.ts');
    await useDossierStore.getState().setLinkAnchorMode('manual');
  });
  const { ids } = await store(page);
  const line = (label: string) => page.locator(`path[id="${ids[label]}"]`);

  /** Where a link leaves its source: the first point of its path */
  const start = (label: string) => line(label).getAttribute('d').then((d) => d!.match(/^M ([-\d.]+) ([-\d.]+)/)!.slice(1).join(','));
  // Two links leaving Alpha by its right side, with no arrow there (an arrow moves the line's start)
  const outOfAlpha = async () => [await start('connaît'), await start('paie')];

  // Separate (default): three lines, each with its label
  await expect(line('appelle')).toHaveCount(1);
  await expect(line('rencontre')).toHaveCount(1);
  await expect(page.locator('.react-flow__edges text', { hasText: 'appelle' })).toHaveCount(1);
  // Links leaving Alpha by its right side each have their own point along it
  const [toCharlie, toDelta] = await outOfAlpha();
  expect(toCharlie).not.toBe(toDelta);

  // One line for all the links of a pair: Views panel, Multiple links → Single
  await page.getByRole('button', { name: 'Views' }).click();
  await page.getByRole('button', { name: 'Single', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Single', exact: true })).toHaveAttribute('aria-pressed', 'true');
  // One line for "appelle" and "rencontre", drawn by whichever comes first
  const pair = page.locator(`path[id="${ids.appelle}"], path[id="${ids.rencontre}"]`);
  await expect(pair).toHaveCount(1);
  await expect(line('connaît')).toHaveCount(1);
  // The merged links are not drawn again under it by the links layer (a second, offset line)
  await expect.poll(() => page.evaluate(() =>
    Number((document.querySelector('[data-testid="canvas-links-layer"]') as HTMLElement | null)?.dataset.sceneLinks ?? 0))).toBe(0);
  // One line leaves Alpha's side, then branches off to Charlie and Delta
  await expect.poll(async () => { const [b, d] = await outOfAlpha(); return b === d; }).toBe(true);
  // No label on the merged line; the lone link keeps its own
  await expect(page.locator('.react-flow__edges text', { hasText: 'appelle' })).toHaveCount(0);
  await expect(page.locator('.react-flow__edges text', { hasText: 'connaît' })).toHaveCount(1);

  // Hover: the labels of the merged links, each behind its colour
  const box = (await pair.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const tooltip = page.getByTestId('link-bundle-tooltip');
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText('appelle');
  await expect(tooltip).toContainText('rencontre');
  const swatches = await tooltip.locator('span.rounded-sm').evaluateAll((spans) => spans.map((s) => getComputedStyle(s).backgroundColor));
  // The order of the hover list, which the click list repeats
  const tooltipOrder = tooltip.locator('span.truncate').allInnerTexts();
  expect(swatches.sort()).toEqual(['rgb(224, 122, 95)', 'rgb(74, 140, 89)'].sort());

  // A click selects both links, and lists them where it was clicked (the hover list gives way)
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(async () => (await store(page)).selected.sort()).toEqual([ids.appelle, ids.rencontre].sort());
  const picker = page.getByTestId('link-bundle-picker');
  await expect(picker).toBeVisible();
  await expect(tooltip).toHaveCount(0);
  await expect(picker.getByRole('menuitem')).toHaveText(await tooltipOrder);

  // Picking one label selects that link alone, opens its detail, and closes the list
  await picker.getByRole('menuitem', { name: 'rencontre' }).click();
  await expect.poll(async () => (await store(page)).selected).toEqual([ids.rencontre]);
  await expect(picker).toHaveCount(0);
  await expect(page.locator('input[value="rencontre"]').first()).toBeVisible();
  await page.mouse.move(5, 5);
  await expect(tooltip).toHaveCount(0);

  // One line per direction: the two links go opposite ways, both drawn again
  await page.evaluate(async () => {
    const { useDossierStore } = await window.__znImport('/src/stores/dossierStore.ts');
    await useDossierStore.getState().setLinkMultiplicity('directed');
  });
  await expect(line('rencontre')).toHaveCount(1);
  await expect(line('appelle')).toHaveCount(1);
});
