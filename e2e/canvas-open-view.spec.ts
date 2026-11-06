import { test, expect, type Page } from '@playwright/test';
import { setupCleanEnvironment } from './fixtures/test-utils';

const CSV = ['type,label', 'element,Jean Martin', 'element,Paul Durand'].join('\n');

/** The canvas pan and zoom, from its transform (written differently by each browser) */
async function canvasViewport(page: Page) {
  return page.locator('.react-flow__viewport').evaluate((el) => {
    const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
    return { x: m.e, y: m.f, zoom: m.a };
  });
}

/** Whether a node of the canvas shows in the canvas area */
async function someNodeShown(page: Page) {
  return page.evaluate(() => {
    const pane = document.querySelector('.react-flow')!.getBoundingClientRect();
    return [...document.querySelectorAll('.react-flow__node')].some((n) => {
      const r = n.getBoundingClientRect();
      return r.right > pane.left && r.left < pane.right && r.bottom > pane.top && r.top < pane.bottom;
    });
  });
}

async function openImported(page: Page) {
  await setupCleanEnvironment(page);
  await page.click('[data-testid="import-button"]');
  await page.locator('[data-testid="import-file-input"]').setInputFiles({
    name: 'personnes.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV, 'utf-8'),
  });
  await expect(page.locator('.react-flow__node')).toHaveCount(2, { timeout: 15000 });
  return page.url().match(/dossier\/([^/?#]+)/)![1];
}

test('a dossier saved on an empty area opens framed on its elements', async ({ page }) => {
  const id = await openImported(page);
  await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({ x: -50000, y: -50000, zoom: 1 })), `viewport_${id}`);
  await page.reload();
  await expect(page.locator('.react-flow__node').first()).toBeAttached({ timeout: 15000 });
  await expect.poll(() => someNodeShown(page), { timeout: 5000 }).toBe(true);
});

test('a dossier saved on a view showing elements opens on that view', async ({ page }) => {
  const id = await openImported(page);
  await page.waitForTimeout(800);
  // The current view (it shows both), slightly moved: kept as is on reopening
  const shown = await canvasViewport(page);
  const saved = { x: shown.x + 20, y: shown.y + 10, zoom: shown.zoom };
  await page.evaluate(([key, v]) => localStorage.setItem(key as string, v as string), [`viewport_${id}`, JSON.stringify(saved)]);
  await page.reload();
  await expect(page.locator('.react-flow__node').first()).toBeAttached({ timeout: 15000 });
  await page.waitForTimeout(1500);
  const after = await canvasViewport(page);
  expect(after.x).toBeCloseTo(saved.x, 0);
  expect(after.y).toBeCloseTo(saved.y, 0);
  expect(after.zoom).toBeCloseTo(saved.zoom, 2);
});
