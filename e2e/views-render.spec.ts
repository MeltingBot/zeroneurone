import { test, expect } from '@playwright/test';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setupCleanEnvironment, waitForAppLoad } from './fixtures/test-utils';
import { buildLargeDossierJson } from './fixtures/large-dossier';

/**
 * Map, timeline and matrix open on a dossier with located and dated elements
 * without a script error: a smoke test over the modules they are built from.
 * Dev server only: reaches the stores through Vite's module URLs.
 */
test('the map, timeline and matrix views open without errors', async ({ page, browserName }) => {
  // MapLibre fails its WebGL setup in headless Firefox, before and after this change alike
  test.skip(browserName === 'firefox', 'no WebGL map in headless Firefox');
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await setupCleanEnvironment(page);
  await waitForAppLoad(page);
  const file = join(mkdtempSync(join(tmpdir(), 'zn-')), 'views.json');
  writeFileSync(file, buildLargeDossierJson(30));
  await page.click('[data-testid="import-button"]');
  await page.setInputFiles('input[type="file"]', file);
  await page.waitForSelector('.react-flow__node');
  await page.waitForTimeout(1000);

  // Give a few elements a position and a dated event
  await page.evaluate(async () => {
    const store = (await import('/src/stores/dossierStore.ts')).useDossierStore.getState();
    const els = store.elements.slice(0, 6);
    for (const [i, el] of els.entries()) {
      await store.updateElement(el.id, {
        geo: { type: 'point', lat: 48.85 + i * 0.01, lng: 2.35 + i * 0.01 },
        events: [{ id: `ev-${i}`, label: `Évènement ${i}`, date: new Date(2024, i, 10), geo: { type: 'point', lat: 48.8 + i * 0.02, lng: 2.3 } }],
      } as never);
    }
  });

  for (const [mode, selector] of [['map', '.maplibregl-canvas'], ['timeline', '[data-testid="timeline-view"], .timeline-view, svg'], ['matrix', '[data-testid="matrix-view"], .matrix-view, [role="grid"], table, div']] as const) {
    await page.evaluate(async (m) => {
      (await import('/src/stores/viewStore.ts')).useViewStore.getState().setDisplayMode(m as never);
    }, mode);
    await page.waitForTimeout(1500);
    await expect(page.locator(selector).first()).toBeVisible();
  }
  await page.evaluate(async () => {
    (await import('/src/stores/viewStore.ts')).useViewStore.getState().setDisplayMode('canvas' as never);
  });
  await page.waitForTimeout(800);

  expect(errors).toEqual([]);
});
