import { test, expect, type Page } from '@playwright/test';
import { writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
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

/** Two places in Paris and Lyon linked, and a zone around Marseille */
function dossierJson(): string {
  const now = new Date().toISOString();
  const element = (id: string, label: string, x: number, geo: unknown) => ({
    id, label, notes: '', tags: [], properties: [], confidence: null, source: '', date: null, dateRange: null,
    position: { x, y: 0 }, isPositionLocked: false, geo, events: [], assetIds: [], parentGroupId: null,
    isGroup: false, isAnnotation: false, childIds: [],
    visual: { color: '#93c5fd', borderColor: '#a8a29e', shape: 'circle', size: 'medium', icon: null, image: null },
    createdAt: now, updatedAt: now,
  });
  return JSON.stringify({
    version: '1.0.0',
    elements: [
      element('a', 'Paris', 0, { type: 'point', lat: 48.8566, lng: 2.3522 }),
      element('b', 'Lyon', 300, { type: 'point', lat: 45.764, lng: 4.8357 }),
      element('c', 'Marseille', 600, { type: 'polygon', coordinates: [[5.3, 43.25], [5.45, 43.25], [5.45, 43.35], [5.3, 43.35]], center: { lat: 43.3, lng: 5.375 } }),
    ],
    links: [{
      id: 'ab', fromId: 'a', toId: 'b', label: 'livre', notes: '', tags: [], properties: [], confidence: null,
      source: '', date: null, dateRange: null, direction: 'forward', directed: true,
      visual: { color: '#c75d5d', style: 'dashed', thickness: 3 },
      sourceHandle: 'source-right', targetHandle: 'target-left', createdAt: now, updatedAt: now,
    }],
  });
}

test('the map exports as SVG: basemap image, vector links, zones and markers', async ({ page, browserName }) => {
  test.skip(browserName === 'firefox', 'no WebGL map in headless Firefox');
  test.setTimeout(120_000);
  await exposeImporter(page);
  await setupCleanEnvironment(page);
  await waitForAppLoad(page);
  const file = join(mkdtempSync(join(tmpdir(), 'zn-')), 'map.json');
  writeFileSync(file, dossierJson());
  await page.click('[data-testid="import-button"]');
  await page.setInputFiles('input[type="file"]', file);
  await page.waitForSelector('.react-flow__node');
  await page.evaluate(async () => {
    const { useViewStore } = await window.__znImport('/src/stores/viewStore.ts');
    useViewStore.getState().setDisplayMode('map');
  });
  await expect(page.locator('.map-marker-simple').first()).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(2000);

  await page.click('[data-testid="map-export"]');
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), page.click('[data-testid="map-export-svg"]')]);
  expect(download.suggestedFilename()).toMatch(/_carte_.*\.svg$/);
  const svg = readFileSync((await download.path())!, 'utf-8');

  expect(svg).toMatch(/<image href="data:image\/png/);
  for (const label of ['Paris', 'Lyon', 'livre']) expect(svg).toContain(label);
  // The link as a vector: dashed polyline in its colour, with its arrow
  expect(svg).toMatch(/<polyline [^>]*stroke="#c75d5d"[^>]*stroke-dasharray/);
  expect(svg).toMatch(/<path d="M10 2 L18 18 L10 13 L2 18 Z"/);
  // The zone as a vector path
  expect(svg).toMatch(/<g id="zones"><path d="M/);

  await page.setContent(`<body style="margin:0">${svg}</body>`);
  await page.screenshot({ path: test.info().outputPath('map.png') });
});
