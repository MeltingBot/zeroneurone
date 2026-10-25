import { test, expect, type Page } from '@playwright/test';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setupCleanEnvironment, waitForAppLoad } from './fixtures/test-utils';
import { buildLargeDossierJson } from './fixtures/large-dossier';

/**
 * Canvas overview layer (flag canvasOverviewLayer): zoomed far out on a large
 * board, React Flow's nodes are hidden and one <canvas> draws every node and
 * link. Clicks, Shift+box and double-click are hit-tested on that canvas.
 */

const COUNT = 1000;

test.describe.configure({ mode: 'serial', timeout: 3 * 60 * 1000 });

/** Labels of the selected elements (the import gives elements new ids). */
async function selectedLabels(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const { useSelectionStore } = await import('/src/stores/selectionStore.ts');
    const { useDossierStore } = await import('/src/stores/dossierStore.ts');
    const ids = useSelectionStore.getState().selectedElementIds;
    return useDossierStore.getState().elements.filter((e) => ids.has(e.id)).map((e) => e.label).sort();
  });
}

/** Screen point of a flow point, from React Flow's current transform. */
async function toScreen(page: Page, fx: number, fy: number) {
  return page.evaluate(([x, y]) => {
    const viewport = document.querySelector('.react-flow__viewport') as HTMLElement;
    const m = new DOMMatrix(getComputedStyle(viewport).transform);
    const r = document.querySelector('.react-flow__pane')!.getBoundingClientRect();
    return { x: r.left + m.e + x * m.a, y: r.top + m.f + y * m.d };
  }, [fx, fy]);
}

test('the overview layer draws the whole graph and keeps selection working', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  await setupCleanEnvironment(page);
  await waitForAppLoad(page);
  await page.evaluate(async () => {
    const { useUIStore } = await import('/src/stores/uiStore.ts');
    useUIStore.getState().setCanvasOverviewLayer(true);
  });

  const json = buildLargeDossierJson(COUNT, 0);
  const expectedLinks = (JSON.parse(json).links as unknown[]).length;
  const dir = mkdtempSync(join(tmpdir(), 'zn-overview-'));
  const file = join(dir, 'overview.json');
  writeFileSync(file, json);

  await page.click('[data-testid="import-button"]');
  await page.setInputFiles('input[type="file"]', file);
  await page.waitForSelector('.react-flow__node', { timeout: 60_000 });

  // Whole graph on screen: far below the overview threshold
  await page.click('[data-testid="fit-view"]');
  const overview = page.locator('[data-testid="canvas-overview"]');
  await expect(overview).toHaveAttribute('data-active', 'true');
  await expect(page.locator('.react-flow__node')).toHaveCount(0);
  await expect(page.locator('.react-flow__edge')).toHaveCount(0);
  await expect(overview).toHaveAttribute('data-scene-nodes', String(COUNT));
  await expect(overview).toHaveAttribute('data-scene-links', String(expectedLinks));
  // Every link drawn, not the 800 React Flow would get
  await expect.poll(async () => Number(await overview.getAttribute('data-links-drawn'))).toBe(expectedLinks);

  // Click on the first element (a rectangle whose top-left corner is the flow origin)
  const p0 = await toScreen(page, 20, 20);
  await page.mouse.click(p0.x, p0.y);
  await expect.poll(() => selectedLabels(page)).toEqual(['Jean Dupont 0']);

  // A click on empty canvas clears it
  const empty = await toScreen(page, -600, -600);
  await page.mouse.click(empty.x, empty.y);
  await expect.poll(() => selectedLabels(page)).toEqual([]);

  // Shift+box from empty canvas over the first two elements (x 0 and 180)
  const end = await toScreen(page, 200, 100);
  await page.keyboard.down('Shift');
  await page.mouse.move(empty.x, empty.y);
  await page.mouse.down();
  await page.mouse.move((empty.x + end.x) / 2, (empty.y + end.y) / 2, { steps: 4 });
  await page.mouse.move(end.x, end.y, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await expect.poll(() => selectedLabels(page)).toEqual(['Jean Dupont 0', 'Marie Martin 1']);

  // Double-click zooms in: React Flow's nodes come back, the canvas goes
  const mid = await toScreen(page, 9000, 700);
  await page.mouse.dblclick(mid.x, mid.y);
  await expect(overview).toHaveAttribute('data-active', 'false', { timeout: 5000 });
  await expect.poll(() => page.locator('.react-flow__node').count()).toBeGreaterThan(0);
  // Zooming in creates nothing
  const elementCount = await page.evaluate(async () => {
    const { useDossierStore } = await import('/src/stores/dossierStore.ts');
    return useDossierStore.getState().elements.length;
  });
  expect(elementCount).toBe(COUNT);

  expect(consoleErrors).toEqual([]);
});
