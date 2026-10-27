import { test, expect } from '@playwright/test';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setupCleanEnvironment, waitForAppLoad } from './fixtures/test-utils';
import { buildLargeDossierJson } from './fixtures/large-dossier';

/**
 * A dense graph, with more links on screen than React Flow renders (800):
 * - the links it leaves out are drawn by the links layer, so none goes missing;
 * - clicking an element must not make the links blink. Before the fix, the
 *   click reordered the capped links and restarted the progressive rendering,
 *   which dropped the canvas to 250 links and refilled it over a few frames.
 * Dev server only: reaches the stores through Vite's module URLs.
 */
/** 3000 elements × 1.5 links (e2e/fixtures/large-dossier.ts), no self-loop. */
const LINK_COUNT = 4500;
const MAX_RENDERED_EDGES = 800;
test.use({ viewport: { width: 1920, height: 1200 } });

test('clicking an element keeps the links on screen', async ({ page }) => {
  test.setTimeout(300_000);
  await setupCleanEnvironment(page);
  await waitForAppLoad(page);
  // The overview layer would draw everything on a canvas: test the DOM path
  await page.evaluate(async () => (await import('/src/stores/uiStore.ts')).useUIStore.getState().setCanvasOverviewLayer(false));
  const file = join(mkdtempSync(join(tmpdir(), 'zn-')), 'dense.json');
  writeFileSync(file, buildLargeDossierJson(3000));
  await page.click('[data-testid="import-button"]');
  await page.setInputFiles('input[type="file"]', file);
  await page.waitForSelector('.react-flow__node', { timeout: 120_000 });
  await page.evaluate(async () => (await import('/src/stores/viewStore.ts')).useViewStore.getState()
    .requestViewportChange({ x: -800, y: -200, zoom: 0.2 }));
  await page.waitForTimeout(4000);

  const before = await page.evaluate(() => document.querySelectorAll('.react-flow__edge').length);
  expect(before).toBeGreaterThan(500);

  // Every link React Flow leaves out is on the links layer, and some are on screen
  const layer = await page.evaluate(() => {
    const c = document.querySelector('[data-testid="canvas-links-layer"]') as HTMLElement;
    return { scene: Number(c.dataset.sceneLinks), drawn: Number(c.dataset.linksDrawn) };
  });
  expect(layer.scene).toBeGreaterThanOrEqual(LINK_COUNT - MAX_RENDERED_EDGES);
  expect(layer.drawn).toBeGreaterThan(0);

  // An element near the middle of the screen
  const box = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('.react-flow__node')].map((n) => n.getBoundingClientRect());
    const cx = innerWidth / 2, cy = innerHeight / 2;
    nodes.sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
    const r = nodes[0];
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });

  // Count the drawn links on every frame from the click on
  await page.evaluate(() => {
    const w = window as unknown as { __edgeCounts: number[] };
    w.__edgeCounts = [];
    const end = performance.now() + 1500;
    const sample = () => {
      w.__edgeCounts.push(document.querySelectorAll('.react-flow__edge').length);
      if (performance.now() < end) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.mouse.click(box.x, box.y);
  await page.waitForTimeout(1800);
  const counts = await page.evaluate(() => (window as unknown as { __edgeCounts: number[] }).__edgeCounts);

  // The click may swap a few links for those of the element, never empty the screen
  expect(Math.min(...counts), `before ${before}, frames ${counts.join(',')}`).toBeGreaterThan(before * 0.9);
});
