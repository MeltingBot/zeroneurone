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

/**
 * React Flow 12.12 no longer flags its own nodes during a selection box, and
 * fires onResizeEnd after a press on a resize handle that did not move.
 * Dev server only: reaches the stores through Vite's module URLs.
 */

/** Import an app module as the app loaded it (a reused dev server adds `?t=`). */
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
  await page.waitForTimeout(1000);
}

const selectedCount = (page: Page) => page.evaluate(async () =>
  (await window.__znImport('/src/stores/selectionStore.ts')).useSelectionStore.getState().selectedElementIds.size);

test('Shift + drag selects the elements the box touches', async ({ page }) => {
  await openDossier(page);
  const boxes = await page.locator('.react-flow__node').evaluateAll((nodes) =>
    nodes.map((n) => n.getBoundingClientRect()).map((r) => ({ left: r.left, top: r.top, bottom: r.bottom })));
  // From empty canvas below the row, up to the left: every node but the first
  const start = { x: Math.max(...boxes.map((b) => b.left)) + 10, y: Math.max(...boxes.map((b) => b.bottom)) + 40 };
  const end = { x: Math.min(...boxes.map((b) => b.left)) + 60, y: Math.min(...boxes.map((b) => b.top)) - 40 };

  await page.keyboard.down('Shift');
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move((start.x + end.x) / 2, (start.y + end.y) / 2, { steps: 5 });
  await page.mouse.move(end.x, end.y, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up('Shift');

  await expect.poll(() => selectedCount(page)).toBeGreaterThan(1);
  expect(await selectedCount(page)).toBe(await page.locator('.react-flow__node.selected').count());
});

test('a press on a resize handle without moving keeps the automatic size', async ({ page }) => {
  await openDossier(page);
  const node = page.locator('.react-flow__node').first();
  const id = await node.getAttribute('data-id');
  await node.click();
  const handle = node.locator('.react-flow__resize-control.handle').last();
  await expect(handle).toBeVisible();
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(500);

  const visual = await page.evaluate(async (elementId) =>
    (await window.__znImport('/src/stores/dossierStore.ts')).useDossierStore.getState()
      .elements.find((e: { id: string }) => e.id === elementId)?.visual, id);
  expect(visual?.customWidth).toBeUndefined();
  expect(visual?.customHeight).toBeUndefined();
});
