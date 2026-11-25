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

/** A triangle Alpha–Bravo–Charlie; Alpha–Bravo has a period, Bravo–Charlie a start only. */
function dossierJson(): string {
  const now = new Date().toISOString();
  const element = (id: string, label: string, x: number, y: number) => ({
    id, label, notes: '', tags: [], properties: [], confidence: null, source: '', date: null, dateRange: null,
    position: { x, y }, isPositionLocked: false, geo: null, events: [], assetIds: [], parentGroupId: null,
    isGroup: false, isAnnotation: false, childIds: [],
    visual: { color: '#93c5fd', borderColor: '#a8a29e', shape: 'rectangle', size: 'medium', icon: null, image: null },
    createdAt: now, updatedAt: now,
  });
  const link = (id: string, fromId: string, toId: string, label: string, dateRange: unknown) => ({
    id, fromId, toId, label, notes: '', tags: [], properties: [], confidence: null, source: '', date: null,
    dateRange, direction: 'none', directed: false, visual: { color: '#6b6560', style: 'solid', thickness: 2 },
    sourceHandle: 'source-right', targetHandle: 'target-left', createdAt: now, updatedAt: now,
  });
  return JSON.stringify({
    version: '1.0.0',
    elements: [element('a', 'Alpha', 0, 0), element('b', 'Bravo', 400, 0), element('c', 'Charlie', 200, 300)],
    links: [
      link('ab', 'a', 'b', 'appelle', { start: '2019-03-12T10:00:00', end: '2020-01-05T10:00:00' }),
      link('bc', 'b', 'c', 'connaît', { start: '2021-06-01T10:00:00', end: null }),
      link('ca', 'c', 'a', 'paie', null),
    ],
  });
}

async function openDossier(page: Page) {
  await exposeImporter(page);
  await setupCleanEnvironment(page);
  await waitForAppLoad(page);
  const file = join(mkdtempSync(join(tmpdir(), 'zn-')), 'triangle.json');
  writeFileSync(file, dossierJson());
  await page.click('[data-testid="import-button"]');
  await page.setInputFiles('input[type="file"]', file);
  await page.waitForSelector('.react-flow__node');
  await expect.poll(() => page.evaluate(async () => {
    const { useDossierStore } = await window.__znImport('/src/stores/dossierStore.ts');
    return useDossierStore.getState().links.length;
  })).toBe(3);
  await expect(page.locator('.react-flow__edge').first()).toBeVisible();
}

const selection = (page: Page) => page.evaluate(async () => {
  const { useSelectionStore } = await window.__znImport('/src/stores/selectionStore.ts');
  const s = useSelectionStore.getState();
  return { elements: s.selectedElementIds.size as number, links: s.selectedLinkIds.size as number };
});

test('link dates are written on the lines when the view option is on', async ({ page }) => {
  test.setTimeout(120_000);
  await openDossier(page);
  const dates = page.locator('[data-testid="link-dates"]');
  await expect(dates).toHaveCount(0);

  await page.evaluate(async () => {
    const { useDossierStore } = await window.__znImport('/src/stores/dossierStore.ts');
    await useDossierStore.getState().setShowLinkDates(true);
  });
  // The undated link writes nothing
  await expect(dates).toHaveCount(2);
  // Language of the browser: only the years and the open bound are checked
  const texts = await dates.allTextContents();
  expect(texts.some((text) => /2019.* → .*2020/.test(text))).toBe(true);
  expect(texts.some((text) => /2021.* → …$/.test(text))).toBe(true);
  await page.screenshot({ path: test.info().outputPath('link-dates.png') });

  await page.evaluate(async () => {
    const { useDossierStore } = await window.__znImport('/src/stores/dossierStore.ts');
    await useDossierStore.getState().setShowLinkDates(false);
  });
  await expect(dates).toHaveCount(0);
});

test('a cycle and a path can be selected from the Insights panel', async ({ page }) => {
  test.setTimeout(120_000);
  await openDossier(page);
  await page.evaluate(async () => {
    const { useUIStore } = await window.__znImport('/src/stores/uiStore.ts');
    useUIStore.getState().setSidePanelTab('insights');
  });

  const select = page.locator('[data-testid="route-select"]');

  // Shortest path Alpha → Bravo, searched as the context menu does: two elements, one link
  await page.evaluate(async () => {
    const { insightsService } = await window.__znImport('/src/services/insightsService.ts');
    const { useDossierStore } = await window.__znImport('/src/stores/dossierStore.ts');
    const { useInsightsStore } = await window.__znImport('/src/stores/insightsStore.ts');
    const { elements, links } = useDossierStore.getState();
    const id = (label: string) => elements.find((e: { label: string }) => e.label === label)!.id;
    insightsService.buildGraph(elements, links);
    useInsightsStore.getState().findPaths(id('Alpha'), id('Bravo'));
  });
  await expect(select).toHaveCount(1);
  await select.click();
  await expect.poll(() => selection(page)).toEqual({ elements: 2, links: 1 });
  await expect(select).toHaveAttribute('aria-pressed', 'true');
  // Second click clears it
  await select.click();
  await expect.poll(() => selection(page)).toEqual({ elements: 0, links: 0 });

  // Cycle: its three elements and three links
  await page.getByRole('button', { name: /cycles/i }).first().click();
  await expect(select).toHaveCount(2);
  await select.last().click();
  await expect.poll(() => selection(page)).toEqual({ elements: 3, links: 3 });
  await expect(select.last()).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: test.info().outputPath('cycle-selected.png') });
});
