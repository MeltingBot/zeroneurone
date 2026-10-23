import { test, expect, type Page, type CDPSession } from '@playwright/test';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setupCleanEnvironment, waitForAppLoad } from './fixtures/test-utils';
import { buildLargeDossierJson } from './fixtures/large-dossier';

/**
 * Interaction benchmark on a heavy dossier: drag, create, delete, paste, zoom.
 *
 * Complements render-perf (pan/zoom frames) with the edits users report as
 * slow. For each action it records main-thread long tasks during the action
 * and the settle window after it (the 500 ms safety resync writes to Dexie
 * there), plus the functions with the most self time from a CPU profile.
 * Chromium only (CDP). Run it explicitly:
 *
 *   BENCH_ELEMENTS=10000 npx playwright test interaction-perf --project=chromium --reporter=list
 */

const ELEMENT_COUNT = Number(process.env.BENCH_ELEMENTS ?? 5000);
const BULK = Number(process.env.BENCH_BULK ?? 500);
const SETTLE_MS = 2500;
const OUT_FILE = process.env.BENCH_OUT ?? join(tmpdir(), `interaction-bench-${ELEMENT_COUNT}.json`);
const allResults: unknown[] = [];
/** Set by dragFrames, merged into the next measure() result. */
let lastFrames: Record<string, number> | null = null;

test.describe.configure({ mode: 'serial', timeout: 15 * 60 * 1000 });
// A private dev server avoids reloads from edits made in the main one.
if (process.env.BENCH_URL) test.use({ baseURL: process.env.BENCH_URL });

interface ProfileNode {
  id: number;
  callFrame: { functionName: string; url: string; lineNumber: number };
  hitCount?: number;
}

/** Self time per function, top N, from a CDP CPU profile. */
function topSelfTime(profile: { nodes: ProfileNode[]; samples?: number[]; timeDeltas?: number[] }, n = 12) {
  const byNode = new Map<number, number>();
  const samples = profile.samples ?? [];
  const deltas = profile.timeDeltas ?? [];
  for (let i = 0; i < samples.length; i++) {
    byNode.set(samples[i], (byNode.get(samples[i]) ?? 0) + (deltas[i] ?? 0) / 1000);
  }
  const byFn = new Map<string, number>();
  for (const node of profile.nodes) {
    const ms = byNode.get(node.id);
    if (!ms) continue;
    const { functionName, url, lineNumber } = node.callFrame;
    if (functionName === '(idle)' || functionName === '(program)') continue;
    const file = url.split('/').pop()?.split('?')[0] ?? '';
    const key = `${functionName || '(anon)'} ${file}:${lineNumber + 1}`;
    byFn.set(key, (byFn.get(key) ?? 0) + ms);
  }
  return [...byFn.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([fn, ms]) => `${Math.round(ms)}ms ${fn}`);
}

async function measure(page: Page, cdp: CDPSession, name: string, action: () => Promise<void>) {
  await page.evaluate(() => {
    const w = window as unknown as { __longTasks: number[] };
    w.__longTasks = [];
  });
  await cdp.send('Profiler.start');
  const start = Date.now();
  await action();
  const actionMs = Date.now() - start;
  await page.waitForTimeout(SETTLE_MS);
  const { profile } = await cdp.send('Profiler.stop');
  const tasks = await page.evaluate(() => (window as unknown as { __longTasks: number[] }).__longTasks);
  const dom = await page.evaluate(() => {
    const t = (document.querySelector('.react-flow__viewport') as HTMLElement | null)?.style.transform ?? '';
    return {
      zoom: Number(/scale\(([\d.]+)\)/.exec(t)?.[1] ?? 0),
      nodesInDom: document.querySelectorAll('.react-flow__node').length,
      edgesInDom: document.querySelectorAll('.react-flow__edge').length,
      domNodes: document.getElementsByTagName('*').length,
    };
  });
  const result = {
    name,
    actionMs,
    longTaskTotalMs: Math.round(tasks.reduce((a, b) => a + b, 0)),
    longTaskMaxMs: Math.round(Math.max(0, ...tasks)),
    longTasks: tasks.length,
    ...dom,
    ...lastFrames,
    top: topSelfTime(profile as never),
  };
  lastFrames = null;
  console.log(JSON.stringify(result, null, 2));
  allResults.push(result);
  // Outside the project root: Vite reloads the page on any file it watches.
  writeFileSync(OUT_FILE, JSON.stringify(allResults, null, 2));
  return result;
}

/** Frame intervals sampled while `gesture` runs in the page. */
async function dragFrames(page: Page, from: { x: number; y: number }, steps: number) {
  await page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __framesOn: boolean };
    w.__frames = [];
    w.__framesOn = true;
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      w.__frames.push(now - last);
      last = now;
      if (w.__framesOn) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.x + i * 4, from.y + i * 2);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  const frames = await page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __framesOn: boolean };
    w.__framesOn = false;
    return w.__frames;
  });
  const sorted = [...frames].sort((a, b) => a - b);
  lastFrames = {
    frames: frames.length,
    medianFrameMs: Math.round(sorted[Math.floor(sorted.length / 2)] ?? 0),
    worstFrameMs: Math.round(sorted[sorted.length - 1] ?? 0),
  };
}

/**
 * Selects `count` elements through the real store: `anchor` (a node on screen)
 * plus the next ones in store order. Import assigns fresh ids, so the
 * fixture's ids cannot be used.
 */
async function selectSome(page: Page, count: number, anchor?: string) {
  const n = await page.evaluate(async ([k, a]) => {
    const dossier = await import('/src/stores/dossierStore.ts');
    const sel = await import('/src/stores/selectionStore.ts');
    const all = dossier.useDossierStore.getState().elements.map((e) => e.id);
    const ids = (a ? [a, ...all.filter((id) => id !== a)] : all).slice(0, k);
    sel.useSelectionStore.getState().selectElements(ids);
    return sel.useSelectionStore.getState().selectedElementIds.size;
  }, [count, anchor ?? ''] as const);
  if (n !== count) throw new Error(`selected ${n}, expected ${count}`);
  await page.waitForTimeout(300);
}

/** Moves the viewport through the store; Canvas animates it over 300 ms. */
async function setView(page: Page, viewport: { x: number; y: number; zoom: number }) {
  await page.evaluate(async (v) => {
    const mod = await import('/src/stores/viewStore.ts');
    mod.useViewStore.getState().requestViewportChange(v);
  }, viewport);
  await page.waitForTimeout(2000);
}

async function nodesInDom(page: Page) {
  return page.evaluate(() => document.querySelectorAll('.react-flow__node').length);
}

async function elementCount(page: Page) {
  // Let the deferred store sync land before reading.
  await page.waitForTimeout(800);
  return page.evaluate(async () => {
    const mod = await import('/src/stores/dossierStore.ts');
    return mod.useDossierStore.getState().elements.length;
  });
}

test('interaction performance on a heavy dossier', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __longTasks: number[] };
    w.__longTasks = [];
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) w.__longTasks.push(e.duration);
      }).observe({ type: 'longtask', buffered: false });
    } catch { /* not supported */ }
  });

  // React Flow error 008: an edge whose handle cannot be found is not drawn.
  const missingHandle: string[] = [];
  page.on('console', (m) => { if (m.text().includes('008')) missingHandle.push(m.text()); });

  await setupCleanEnvironment(page);
  await waitForAppLoad(page);

  const dir = mkdtempSync(join(tmpdir(), 'zn-bench-'));
  const file = join(dir, 'heavy.json');
  writeFileSync(file, buildLargeDossierJson(ELEMENT_COUNT));

  await page.click('[data-testid="import-button"]');
  await expect(page.locator('[data-testid="import-modal"]')).toBeVisible();
  await page.setInputFiles('input[type="file"]', file);
  await page.waitForSelector('.react-flow__node', { timeout: 5 * 60 * 1000 });
  // Initial edge rendering, insights and the post-import Dexie copy.
  await page.waitForTimeout(8000);

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 500 });

  const results: unknown[] = [];

  // Node el-0 sits at the grid origin; bring it on screen by its DOM box.
  const nodeBox = async (id: string) => {
    const box = await page.locator(`.react-flow__node[data-id="${id}"]`).boundingBox({ timeout: 10_000 });
    if (!box) throw new Error(`node ${id} not on screen`);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  // The dossier may open zoomed out or in depending on timing; the two give
  // opposite numbers. Edits are measured close up, the overview at the end.
  // Retried: a fit-view scheduled by the dossier opening can land after ours.
  for (let i = 0; i < 5 && (await nodesInDom(page)) >= 100; i++) {
    await setView(page, { x: 0, y: 0, zoom: 1 });
    if (process.env.BENCH_DEBUG) {
      console.log('setView try', i, await page.evaluate(() => ({
        transform: (document.querySelector('.react-flow__viewport') as HTMLElement | null)?.style.transform,
        nodes: document.querySelectorAll('.react-flow__node').length,
        url: location.pathname,
      })));
    }
  }
  expect(await nodesInDom(page)).toBeLessThan(100);

  const visibleId = await page.evaluate(() =>
    document.querySelector('.react-flow__node')?.getAttribute('data-id') ?? '');

  // ── Drag one node ────────────────────────────────────────────────────────
  results.push(await measure(page, cdp, 'drag-1', async () => {
    await dragFrames(page, await nodeBox(visibleId), 40);
  }));

  // ── Drag BULK nodes ──────────────────────────────────────────────────────
  // The grabbed node is on screen; the rest of the selection is the grid
  // after it, mostly off screen — React Flow and the store move them all.
  // drag-1 may have pushed its node off screen: grab one that is visible now.
  const bulkId = await page.evaluate(() =>
    document.querySelector('.react-flow__node')?.getAttribute('data-id') ?? '');
  await selectSome(page, BULK, bulkId);
  results.push(await measure(page, cdp, `drag-${BULK}`, async () => {
    await dragFrames(page, await nodeBox(bulkId), 40);
  }));

  // ── Create one element ───────────────────────────────────────────────────
  // Through the store: a double-click at a fixed spot may land on a node.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  let before = await elementCount(page);
  results.push(await measure(page, cdp, 'create-1', async () => {
    await page.evaluate(async () => {
      const mod = await import('/src/stores/dossierStore.ts');
      await mod.useDossierStore.getState().createElement('bench', { x: -500, y: -500 });
    });
  }));
  expect(await elementCount(page)).toBe(before + 1);

  // ── Paste BULK elements (store path, as the clipboard handler ends) ──────
  before = await elementCount(page);
  results.push(await measure(page, cdp, `paste-${BULK}`, async () => {
    await page.evaluate(async (n) => {
      const mod = await import('/src/stores/dossierStore.ts');
      const st = mod.useDossierStore.getState();
      const src = st.elements.slice(0, n);
      const copies = src.map((el, i) => ({
        ...el,
        id: crypto.randomUUID(),
        label: `${el.label} copie`,
        position: { x: el.position.x, y: el.position.y - 20000 - i },
      }));
      st.pasteElements(copies, []);
    }, BULK);
  }));
  expect(await elementCount(page)).toBe(before + BULK);

  // ── Delete BULK elements ─────────────────────────────────────────────────
  await selectSome(page, BULK);
  before = await elementCount(page);
  results.push(await measure(page, cdp, `delete-${BULK}`, async () => {
    await page.keyboard.press('Delete');
  }));
  expect(await elementCount(page)).toBe(before - BULK);

  // ── Delete one element ───────────────────────────────────────────────────
  await selectSome(page, 1);
  before = await elementCount(page);
  results.push(await measure(page, cdp, 'delete-1', async () => {
    await page.keyboard.press('Delete');
  }));
  expect(await elementCount(page)).toBe(before - 1);

  // ── Overview: the whole graph on screen ──────────────────────────────────
  await page.keyboard.press('Escape');
  results.push(await measure(page, cdp, 'fit-view', async () => {
    await page.click('[data-testid="fit-view"]');
  }));
  expect(await nodesInDom(page)).toBeGreaterThan(ELEMENT_COUNT / 2);
  const overviewId = await page.evaluate(() =>
    document.querySelector('.react-flow__node')?.getAttribute('data-id') ?? '');
  results.push(await measure(page, cdp, 'overview-drag-1', async () => {
    await dragFrames(page, await nodeBox(overviewId), 40);
  }));
  results.push(await measure(page, cdp, 'overview-wheel-zoom-5', async () => {
    await page.mouse.move(600, 400);
    for (let i = 0; i < 5; i++) {
      await page.mouse.wheel(0, -120);
      await page.waitForTimeout(50);
    }
  }));

  // ── Back close up: edges must re-anchor to the full set of handles ───────
  await setView(page, { x: 0, y: 0, zoom: 1 });
  await page.waitForTimeout(1500);
  const closeUp = await page.evaluate(() => ({
    nodes: document.querySelectorAll('.react-flow__node').length,
    edges: document.querySelectorAll('.react-flow__edge').length,
    edgePathsWithNaN: [...document.querySelectorAll('.react-flow__edge path')]
      .filter((p) => (p.getAttribute('d') ?? '').includes('NaN')).length,
  }));
  const integrity = { name: 'integrity', ...closeUp, missingHandleErrors: missingHandle.length };
  console.log(JSON.stringify(integrity));
  allResults.push(integrity);
  writeFileSync(OUT_FILE, JSON.stringify(allResults, null, 2));
  expect(closeUp.edges).toBeGreaterThan(0);

  expect(results.length).toBeGreaterThan(0);
});
