import { test, expect, type Page } from '@playwright/test';
import { existsSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setupCleanEnvironment, waitForAppLoad } from './fixtures/test-utils';
import { buildLargeDossierJson } from './fixtures/large-dossier';

/**
 * An .anb imported into the open dossier goes through placement mode, like
 * every other format: the user clicks where it lands, and its elements join
 * the open tab. Dev server only: reaches the stores through Vite's module URLs.
 * The chart is a private i2 file (doc_perso, not versioned): skipped without it.
 */

const ANB = join(process.cwd(), 'doc_perso/fixtures/anb/Test ANB pour import ZN.anb');

declare global {
  interface Window { __znImport: (path: string) => Promise<Record<string, unknown>> }
}

// The store instance the app runs, even after a hot reload (?t=)
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

test('an .anb imported into the open dossier is placed, then filed in the open tab', async ({ page }) => {
  test.skip(!existsSync(ANB), 'i2 chart not available');
  test.setTimeout(120_000);
  await exposeImporter(page);
  await setupCleanEnvironment(page);
  await waitForAppLoad(page);

  const file = join(mkdtempSync(join(tmpdir(), 'zn-anb-')), 'base.json');
  writeFileSync(file, buildLargeDossierJson(3));
  await page.click('[data-testid="import-button"]');
  await page.setInputFiles('input[type="file"]', file);
  await page.waitForSelector('.react-flow__node');
  await page.waitForTimeout(1000);

  // An empty tab, opened
  const tabId = await page.evaluate(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = (await window.__znImport('/src/stores/dossierStore.ts') as any).useDossierStore.getState();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tabs = (await window.__znImport('/src/stores/tabStore.ts') as any).useTabStore;
    const tab = await tabs.getState().createTab(d.currentDossier.id, 'Synthèse');
    tabs.getState().setActiveTab(tab.id);
    return tab.id as string;
  });
  await page.waitForTimeout(500);
  const before = await page.evaluate(async () =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (await window.__znImport('/src/stores/dossierStore.ts') as any).useDossierStore.getState().elements.length as number);

  await page.locator('button[title="Import"]').click();
  await page.setInputFiles('input[type="file"]', ANB);

  // Placement mode: nothing written until the click
  await expect(page.locator('[data-testid="import-placement-cancel"]')).toBeVisible({ timeout: 10000 });
  await page.locator('.react-flow__pane').click({ position: { x: 300, y: 250 } });
  await expect(page.locator('[data-testid="import-placement-cancel"]')).toBeHidden({ timeout: 30000 });

  const state = await page.evaluate(async (id) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const els = (await window.__znImport('/src/stores/dossierStore.ts') as any).useDossierStore.getState().elements;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tab = (await window.__znImport('/src/stores/tabStore.ts') as any).useTabStore.getState().tabs.find((t: any) => t.id === id);
    return { total: els.length as number, inTab: (tab?.memberElementIds.length ?? 0) as number };
  }, tabId);
  expect(state.total).toBeGreaterThan(before);
  expect(state.inTab).toBe(state.total - before);
});
