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
 *
 *   BENCH_ELEMENTS=10000 BENCH_OVERVIEW=1 npx playwright test render-perf --project=chromium
 */

const ELEMENT_COUNT = Number(process.env.BENCH_ELEMENTS ?? 5000);
/** Share of elements with no link. Conditional handles only help these. */
const ISOLATED_RATIO = Number(process.env.BENCH_ISOLATED ?? 0);
/** BENCH_OVERVIEW=1 measures with the canvas overview layer (output suffixed -overview), else without. */
const OVERVIEW = process.env.BENCH_OVERVIEW === '1';

test.describe.configure({ mode: 'serial', timeout: 10 * 60 * 1000 });

test('render performance on a heavy dossier', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  await setupCleanEnvironment(page);
  await waitForAppLoad(page);
  // Set either way: the layer is on by default. Dev server only (the bench
  // baseURL): the store module is importable by path.
  await page.evaluate(async (on) => {
    const { useUIStore } = await import('/src/stores/uiStore.ts');
    useUIStore.getState().setCanvasOverviewLayer(on);
  }, OVERVIEW);

  // Write the fixture where the file chooser can reach it.
  const dir = mkdtempSync(join(tmpdir(), 'zn-bench-'));
  const file = join(dir, 'heavy.json');
  writeFileSync(file, buildLargeDossierJson(ELEMENT_COUNT, ISOLATED_RATIO));

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

  // ── Measurement helpers ───────────────────────────────────────────────────
  // Real input (page.mouse) only: d3-zoom ignores synthetic MouseEvents
  // dispatched on the pane, so a bench built on them measures a still view.
  // Each gesture checks that the viewport actually moved.
  const viewportTransform = () => page.evaluate(() =>
    getComputedStyle(document.querySelector('.react-flow__viewport') as HTMLElement).transform);
  /** A point where the empty pane itself is under the cursor (not a node, panel or minimap). */
  const findPanePoint = () => page.evaluate(() => {
    const r = document.querySelector('.react-flow__pane')!.getBoundingClientRect();
    for (let y = r.top + 40; y < r.bottom - 40; y += 20) {
      for (let x = r.right - 40; x > r.left + 40; x -= 20) {
        const el = document.elementFromPoint(x, y);
        if (el?.classList.contains('react-flow__pane')) return { x, y };
      }
    }
    return null;
  });
  const startFrameSampling = () => page.evaluate(() => {
    const w = window as unknown as { __znIntervals: number[]; __znSampling: boolean };
    w.__znIntervals = [];
    w.__znSampling = true;
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      w.__znIntervals.push(now - last);
      last = now;
      if (w.__znSampling) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const stopFrameSampling = () => page.evaluate(() => {
    const w = window as unknown as { __znIntervals: number[]; __znSampling: boolean };
    w.__znSampling = false;
    const sorted = [...w.__znIntervals].sort((a, b) => a - b);
    return {
      frames: sorted.length,
      worstFrameMs: Math.round(sorted[sorted.length - 1] ?? 0),
      medianFrameMs: Math.round(sorted[Math.floor(sorted.length / 2)] ?? 0),
    };
  });
  /** Drag the empty pane with the real mouse and sample frame intervals meanwhile. */
  const measureDragPan = async (dx: number, dy: number) => {
    const point = await findPanePoint();
    if (!point) throw new Error('No empty pane point to start a pan from');
    const before = await viewportTransform();
    await startFrameSampling();
    const start = Date.now();
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    for (let i = 1; i <= 30; i++) {
      await page.mouse.move(point.x + (dx * i) / 30, point.y + (dy * i) / 30);
    }
    await page.mouse.up();
    const durationMs = Date.now() - start;
    await page.waitForTimeout(100);
    const frames = await stopFrameSampling();
    const moved = before !== (await viewportTransform());
    return { ...frames, durationMs, moved };
  };

  // ── Interaction: pan ──────────────────────────────────────────────────────
  // Dragging the pane is the gesture users report as laggy.
  const pan = await measureDragPan(-240, -120);
  await page.waitForTimeout(1500);

  // ── Zoomed out: the whole graph on screen ─────────────────────────────────
  // The measurement above pans across a nearly empty viewport, which is not
  // what "the display lags" describes. Zooming out puts every node in view.
  await page.click('[data-testid="fit-view"]');
  // fitView animates over 300 ms, then edges render progressively.
  await page.waitForTimeout(4000);

  const zoomedOut = await page.evaluate(() => {
    const overview = document.querySelector('[data-testid="canvas-overview"]') as HTMLElement | null;
    return {
      zoomedOutNodesInDom: document.querySelectorAll('.react-flow__node').length,
      zoomedOutEdgesInDom: document.querySelectorAll('.react-flow__edge').length,
      // Deterministic, unlike frame timings: how much DOM the overview really holds.
      zoomedOutHandlesInDom: document.querySelectorAll('.react-flow__handle').length,
      zoomedOutTotalDomNodes: document.querySelectorAll('.react-flow__renderer *').length,
      // Overview layer (BENCH_OVERVIEW=1): what the canvas drew last
      overviewNodesDrawn: Number(overview?.dataset.nodesDrawn ?? 0),
      overviewLinksDrawn: Number(overview?.dataset.linksDrawn ?? 0),
      overviewDrawMs: Number(overview?.dataset.drawMs ?? 0),
    };
  });

  const zoomedOutPan = await measureDragPan(-160, -80);
  const panZoomedOut = {
    zoomedOutWorstFrameMs: zoomedOutPan.worstFrameMs,
    zoomedOutMedianFrameMs: zoomedOutPan.medianFrameMs,
    zoomedOutPanMs: zoomedOutPan.durationMs,
    zoomedOutPanMoved: zoomedOutPan.moved,
  };
  await page.waitForTimeout(1500);

  // ── Interaction: zoom (Ctrl+wheel; a plain wheel pans, see panOnScroll) ──
  const zoomPoint = await findPanePoint();
  if (!zoomPoint) throw new Error('No empty pane point to zoom from');
  await page.mouse.move(zoomPoint.x, zoomPoint.y);
  const zoomBefore = await viewportTransform();
  await startFrameSampling();
  const zoomStart = Date.now();
  await page.keyboard.down('Control');
  for (let i = 0; i < 5; i++) {
    await page.mouse.wheel(0, -100);
    await page.waitForTimeout(50);
  }
  await page.keyboard.up('Control');
  const zoomMs = Date.now() - zoomStart - 250;
  const zoomFrames = await stopFrameSampling();
  const zoomMoved = zoomBefore !== (await viewportTransform());
  await page.waitForTimeout(1500);

  // ── Interaction: wheel scroll (pans the view) ─────────────────────────────
  const wheelStart = Date.now();
  for (let i = 0; i < 5; i++) {
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(50);
  }
  const wheelPanMs = Date.now() - wheelStart - 250;

  const results = {
    elements: ELEMENT_COUNT,
    isolatedRatio: ISOLATED_RATIO,
    importMs,
    firstNodeMs,
    overviewLayer: OVERVIEW,
    ...counts,
    frames: pan.frames,
    worstFrameMs: pan.worstFrameMs,
    medianFrameMs: pan.medianFrameMs,
    panMoved: pan.moved,
    ...zoomedOut,
    ...panZoomedOut,
    zoomMs,
    zoomWorstFrameMs: zoomFrames.worstFrameMs,
    zoomMedianFrameMs: zoomFrames.medianFrameMs,
    zoomMoved,
    wheelPanMs,
    consoleErrors: consoleErrors.length,
  };
  console.log(JSON.stringify(results, null, 2));
  // Also on disk: console output is easily swallowed, and these numbers are
  // the point of the exercise.
  writeFileSync(`render-bench-${ELEMENT_COUNT}${ISOLATED_RATIO ? '-iso' : ''}${OVERVIEW ? '-overview' : ''}.json`, JSON.stringify(results, null, 2));

  // The only hard assertion: the canvas must actually be there. Everything
  // else is a measurement, and thresholds would go stale on other hardware.
  expect(counts.nodesInDom).toBeGreaterThan(0);
  // A gesture that did not move the view measured nothing.
  expect(pan.moved).toBe(true);
  expect(zoomedOutPan.moved).toBe(true);
  expect(zoomMoved).toBe(true);
});
