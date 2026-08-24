import { test, expect } from '@playwright/test';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setupCleanEnvironment, waitForAppLoad } from './fixtures/test-utils';
import { buildLargeDossierJson } from './fixtures/large-dossier';

/**
 * Render benchmark on a heavy dossier.
 *
 * Not a pass/fail test of the product: it prints numbers so that "ZeroNeurone
 * handles heavy graphs" becomes a measured claim. Run it explicitly:
 *
 *   npx playwright test render-perf --reporter=list
 *
 * The compute paths are benchmarked separately by `npm run bench`; this covers
 * what the compute benchmark cannot — layout, paint and interaction.
 */

const ELEMENT_COUNT = Number(process.env.BENCH_ELEMENTS ?? 5000);

test.describe.configure({ mode: 'serial', timeout: 10 * 60 * 1000 });

test('render performance on a heavy dossier', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  await setupCleanEnvironment(page);
  await waitForAppLoad(page);

  // Write the fixture where the file chooser can reach it.
  const dir = mkdtempSync(join(tmpdir(), 'zn-bench-'));
  const file = join(dir, 'heavy.json');
  writeFileSync(file, buildLargeDossierJson(ELEMENT_COUNT));

  // ── Import ────────────────────────────────────────────────────────────────
  await page.click('[data-testid="import-button"]');
  await expect(page.locator('[data-testid="import-modal"]')).toBeVisible();

  const importStart = Date.now();
  await page.setInputFiles('input[type="file"]', file);

  // The canvas appears once the dossier is open.
  await page.waitForSelector('.react-flow', { timeout: 5 * 60 * 1000 });
  const importMs = Date.now() - importStart;

  // ── First render ──────────────────────────────────────────────────────────
  await page.waitForSelector('.react-flow__node', { timeout: 2 * 60 * 1000 });
  const firstNodeMs = Date.now() - importStart;

  // Let the progressive edge rendering settle.
  await page.waitForTimeout(3000);

  const counts = await page.evaluate(() => ({
    nodesInDom: document.querySelectorAll('.react-flow__node').length,
    edgesInDom: document.querySelectorAll('.react-flow__edge').length,
  }));

  // ── Interaction: pan ──────────────────────────────────────────────────────
  // Sample frame intervals while dragging the pane, which is the gesture users
  // report as laggy.
  const pan = await page.evaluate(async () => {
    const pane = document.querySelector('.react-flow__pane') as HTMLElement;
    if (!pane) return { frames: 0, worstFrameMs: 0, medianFrameMs: 0 };

    const intervals: number[] = [];
    let last = performance.now();
    let running = true;
    const tick = () => {
      const now = performance.now();
      intervals.push(now - last);
      last = now;
      if (running) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    const fire = (type: string, x: number, y: number) =>
      pane.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, buttons: 1 }));

    fire('mousedown', 600, 400);
    for (let i = 0; i < 60; i++) {
      fire('mousemove', 600 - i * 8, 400 - i * 4);
      await new Promise((r) => setTimeout(r, 16));
    }
    fire('mouseup', 120, 160);

    running = false;
    await new Promise((r) => setTimeout(r, 100));

    const sorted = [...intervals].sort((a, b) => a - b);
    return {
      frames: intervals.length,
      worstFrameMs: Math.round(sorted[sorted.length - 1] ?? 0),
      medianFrameMs: Math.round(sorted[Math.floor(sorted.length / 2)] ?? 0),
    };
  });

  // ── Zoomed out: the whole graph on screen ─────────────────────────────────
  // The measurement above pans across a nearly empty viewport, which is not
  // what "the display lags" describes. Zooming out puts every node in view.
  await page.click('[data-testid="fit-view"]');
  // fitView animates over 300 ms, then edges render progressively.
  await page.waitForTimeout(4000);

  const zoomedOut = await page.evaluate(() => ({
    zoomedOutNodesInDom: document.querySelectorAll('.react-flow__node').length,
    zoomedOutEdgesInDom: document.querySelectorAll('.react-flow__edge').length,
  }));

  const panZoomedOut = await page.evaluate(async () => {
    const pane = document.querySelector('.react-flow__pane') as HTMLElement;
    if (!pane) return { zoomedOutWorstFrameMs: 0, zoomedOutMedianFrameMs: 0 };
    const intervals: number[] = [];
    let last = performance.now();
    let running = true;
    const tick = () => {
      const now = performance.now();
      intervals.push(now - last);
      last = now;
      if (running) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    const fire = (type: string, x: number, y: number) =>
      pane.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, buttons: 1 }));
    fire('mousedown', 600, 400);
    for (let i = 0; i < 60; i++) {
      fire('mousemove', 600 - i * 4, 400 - i * 2);
      await new Promise((r) => setTimeout(r, 16));
    }
    fire('mouseup', 360, 280);
    running = false;
    await new Promise((r) => setTimeout(r, 100));
    const sorted = [...intervals].sort((a, b) => a - b);
    return {
      zoomedOutWorstFrameMs: Math.round(sorted[sorted.length - 1] ?? 0),
      zoomedOutMedianFrameMs: Math.round(sorted[Math.floor(sorted.length / 2)] ?? 0),
    };
  });

  // ── Interaction: zoom ─────────────────────────────────────────────────────
  const zoomStart = Date.now();
  await page.mouse.move(600, 400);
  for (let i = 0; i < 5; i++) {
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(50);
  }
  const zoomMs = Date.now() - zoomStart - 250;

  const results = {
    elements: ELEMENT_COUNT,
    importMs,
    firstNodeMs,
    ...counts,
    ...pan,
    ...zoomedOut,
    ...panZoomedOut,
    zoomMs,
    consoleErrors: consoleErrors.length,
  };
  console.log(JSON.stringify(results, null, 2));
  // Also on disk: console output is easily swallowed, and these numbers are
  // the point of the exercise.
  writeFileSync(`render-bench-${ELEMENT_COUNT}.json`, JSON.stringify(results, null, 2));

  // The only hard assertion: the canvas must actually be there. Everything
  // else is a measurement, and thresholds would go stale on other hardware.
  expect(counts.nodesInDom).toBeGreaterThan(0);
});
