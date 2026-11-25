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

test('an extracted property labels the new link with its name', async ({ page }) => {
  test.setTimeout(120_000);
  await exposeImporter(page);
  await setupCleanEnvironment(page);
  await waitForAppLoad(page);
  const now = new Date().toISOString();
  const file = join(mkdtempSync(join(tmpdir(), 'zn-')), 'extract.json');
  writeFileSync(file, JSON.stringify({
    version: '1.0.0',
    elements: [{
      id: 'a', label: 'Alice', notes: '', tags: [], properties: [{ key: 'Email', value: 'alice@example.com', type: 'text' }],
      confidence: null, source: '', date: null, dateRange: null, position: { x: 0, y: 0 }, isPositionLocked: false,
      geo: null, events: [], assetIds: [], parentGroupId: null, isGroup: false, isAnnotation: false, childIds: [],
      visual: { color: '#93c5fd', borderColor: '#a8a29e', shape: 'rectangle', size: 'medium', icon: null, image: null },
      createdAt: now, updatedAt: now,
    }],
    links: [],
  }));
  await page.click('[data-testid="import-button"]');
  await page.setInputFiles('input[type="file"]', file);
  await page.waitForSelector('.react-flow__node');

  await page.locator('.react-flow__node').first().click();
  await page.getByRole('button', { name: /^(Properties|Propriétés)/i }).first().click();
  const extract = page.getByTitle(/Extract to element|Extraire en élément/).first();
  await extract.click({ force: true });

  await expect.poll(() => page.evaluate(async () => {
    const { useDossierStore } = await window.__znImport('/src/stores/dossierStore.ts');
    const { elements, links } = useDossierStore.getState();
    const created = elements.find((e: { label: string }) => e.label === 'alice@example.com');
    return { link: links[0]?.label ?? null, tags: created?.tags ?? null };
  })).toEqual({ link: 'Email', tags: ['Email'] });
});
