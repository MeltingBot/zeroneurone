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

/** Alpha → Bravo goes down through a vertical middle segment; Charlie → Delta runs across it. */
function dossierJson(): string {
  const now = new Date().toISOString();
  const element = (id: string, label: string, x: number, y: number) => ({
    id, label, notes: '', tags: [], properties: [], confidence: null, source: '', date: null, dateRange: null,
    position: { x, y }, isPositionLocked: false, geo: null, events: [], assetIds: [], parentGroupId: null,
    isGroup: false, isAnnotation: false, childIds: [],
    visual: { color: '#93c5fd', borderColor: '#a8a29e', shape: 'rectangle', size: 'medium', icon: null, image: null },
    createdAt: now, updatedAt: now,
  });
  const link = (id: string, fromId: string, toId: string, label: string) => ({
    id, fromId, toId, label, notes: '', tags: [], properties: [], confidence: null, source: '', date: null,
    dateRange: null, direction: 'none', directed: false, visual: { color: '#6b6560', style: 'solid', thickness: 2 },
    sourceHandle: 'source-right', targetHandle: 'target-left', createdAt: now, updatedAt: now,
  });
  return JSON.stringify({
    version: '1.0.0',
    elements: [element('a', 'Alpha', 0, -250), element('b', 'Bravo', 300, 400), element('c', 'Charlie', 0, 200), element('d', 'Delta', 500, 200)],
    links: [link('ab', 'a', 'b', 'appelle'), link('cd', 'c', 'd', 'connaît')],
  });
}

const setSettings = (page: Page, jumps: boolean) => page.evaluate(async (on) => {
  const { useDossierStore } = await window.__znImport('/src/stores/dossierStore.ts');
  const s = useDossierStore.getState();
  await s.setLinkAnchorMode('manual');
  await s.setLinkCurveMode('orthogonal');
  await s.setLinkJumps(on);
}, jumps);

test('right-angle links jump over the ones they cross, when the option is on', async ({ page }) => {
  test.setTimeout(120_000);
  await exposeImporter(page);
  await setupCleanEnvironment(page);
  await waitForAppLoad(page);
  const file = join(mkdtempSync(join(tmpdir(), 'zn-')), 'jumps.json');
  writeFileSync(file, dossierJson());
  await page.click('[data-testid="import-button"]');
  await page.setInputFiles('input[type="file"]', file);
  await page.waitForSelector('.react-flow__node');
  const ids = await page.evaluate(async () => {
    const { useDossierStore } = await window.__znImport('/src/stores/dossierStore.ts');
    return Object.fromEntries(useDossierStore.getState().links.map((l: { id: string; label: string }) => [l.label, l.id])) as Record<string, string>;
  });
  const path = (label: string) => page.locator(`path[id="${ids[label]}"]`);

  await setSettings(page, false);
  await expect(path('connaît')).not.toHaveAttribute('d', / A /);

  await setSettings(page, true);
  // The horizontal line jumps; the vertical middle segment it crosses does not
  await expect(path('connaît')).toHaveAttribute('d', / A 5 5 0 0 1 /);
  await expect(path('appelle')).not.toHaveAttribute('d', / A /);
  await page.screenshot({ path: test.info().outputPath('line-jumps.png') });

  await setSettings(page, false);
  await expect(path('connaît')).not.toHaveAttribute('d', / A /);
});
