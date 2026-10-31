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

function dossierJson(): string {
  const now = new Date().toISOString();
  const spec: [string, Record<string, string>][] = [
    ['Jean Dupont', { 'Téléphone': '06 12 34 56 78' }],
    ['Jean Dupond', { tel: '+33 6 12 34 56 78' }],
    ['Marie Curie', {}],
    ['Pierre Durand', { tel: '+44 7911 123456' }],
    ['P. Durand', { tel: '+44 (0)7911 123456' }],
  ];
  const elements = spec.map(([label, props], i) => ({
    id: `e${i}`, label, notes: '', tags: [], confidence: null, source: '',
    properties: Object.entries(props).map(([key, value]) => ({ key, value, type: 'text' })),
    date: null, dateRange: null, position: { x: i * 220, y: 0 }, isPositionLocked: false,
    geo: null, events: [], assetIds: [], parentGroupId: null, isGroup: false, isAnnotation: false, childIds: [],
    visual: { color: '#93c5fd', borderColor: '#a8a29e', shape: 'rectangle', size: 'medium', icon: null, image: null },
    createdAt: now, updatedAt: now,
  }));
  return JSON.stringify({ version: '1.0.0', elements, links: [] });
}

const labels = (page: Page) =>
  page.evaluate(async () => {
    const { useDossierStore } = await window.__znImport('/src/stores/dossierStore.ts');
    return useDossierStore.getState().elements.map((e: { label: string }) => e.label).sort();
  });

test('possible duplicates: scored, merged from Suggestions, undone with Ctrl+Z', async ({ page }) => {
  await exposeImporter(page);
  await setupCleanEnvironment(page);
  await waitForAppLoad(page);

  const file = join(mkdtempSync(join(tmpdir(), 'zn-dupes-')), 'dupes.json');
  writeFileSync(file, dossierJson());
  await page.click('[data-testid="import-button"]');
  await page.setInputFiles('input[type="file"]', file);
  await page.waitForSelector('.react-flow__node', { timeout: 60_000 });

  await page.evaluate(async () => {
    const { useUIStore } = await window.__znImport('/src/stores/uiStore.ts');
    useUIStore.getState().setSidePanelTab('suggestions');
  });
  const rule = page.locator('[data-testid="suggestions-rule-duplicates"]');
  if (!(await rule.isChecked())) await rule.check();
  await page.locator('[data-testid="suggestions-analyze"]').click();

  // Both pairs, the foreign number read by libphonenumber
  const reasons = page.locator('[data-testid="suggestion-merge-reasons"]');
  await expect(reasons).toHaveCount(2, { timeout: 15_000 });
  await expect(reasons.first()).toContainText(/\d+/);
  if (process.env.ZN_SHOT) await page.screenshot({ path: process.env.ZN_SHOT });

  // Merge the first pair through the dialog
  await page.locator('[data-testid="suggestion-merge"]').first().click();
  await page.getByRole('dialog').getByRole('button', { name: /fusionner|merge/i }).last().click();
  await expect.poll(() => labels(page).then((l) => l.length)).toBe(4);
  await expect(reasons).toHaveCount(1);

  // One undo brings both elements back, and the pair with them
  await page.locator('.react-flow__pane').click({ position: { x: 20, y: 300 } });
  await page.keyboard.press('Control+z');
  await expect.poll(() => labels(page).then((l) => l.length)).toBe(5);
  await page.locator('[data-testid="suggestions-analyze"]').click();
  await expect(reasons).toHaveCount(2);
});
