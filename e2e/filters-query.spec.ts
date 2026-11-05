import { test, expect, type Page } from '@playwright/test';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setupCleanEnvironment, waitForAppLoad } from './fixtures/test-utils';
import { buildLargeDossierJson } from './fixtures/large-dossier';

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

async function openDossier(page: Page) {
  await exposeImporter(page);
  await setupCleanEnvironment(page);
  await waitForAppLoad(page);
  const file = join(mkdtempSync(join(tmpdir(), 'zn-')), 'small.json');
  writeFileSync(file, buildLargeDossierJson(10));
  await page.click('[data-testid="import-button"]');
  await page.setInputFiles('input[type="file"]', file);
  await page.waitForSelector('.react-flow__node');
  await page.waitForTimeout(500);
}

const openTab = (page: Page, tab: string) =>
  page.evaluate(async (tab) => {
    (await window.__znImport('/src/stores/uiStore.ts')).useUIStore.getState().setSidePanelTab(tab);
  }, tab);

const queryText = (page: Page) =>
  page.evaluate(async () => (await window.__znImport('/src/stores/queryStore.ts')).useQueryStore.getState().currentText as string);

test('the filters panel writes its filters as a ZNQuery', async ({ page }) => {
  await openDossier(page);
  await openTab(page, 'filters');

  await page.getByRole('button', { name: /^tag-3\b/ }).first().click();
  await expect(page.getByTestId('filters-query')).toHaveText('type = "element" AND tag = "tag-3"');
  expect(await queryText(page)).toBe('type = "element" AND tag = "tag-3"');

  // A text search has no exact query: listed apart, it keeps filtering
  await page.getByPlaceholder(/./).first().fill('xyz');
  await expect(page.getByTestId('filters-query-gaps')).toBeVisible();

  // The line opens the query panel, where the same text is
  await page.getByTestId('filters-query').click();
  await expect(page.locator('textarea').first()).toHaveValue('type = "element" AND tag = "tag-3"');

  // Cleared in the query panel: the tag filter goes with it
  await page.getByRole('button', { name: /^(Clear|Effacer)$/ }).first().click();
  await expect(page.locator('textarea').first()).toHaveValue('');
  const tags = await page.evaluate(async () => (await window.__znImport('/src/stores/viewStore.ts')).useViewStore.getState().filters.includeTags);
  expect(tags).toEqual([]);
});
