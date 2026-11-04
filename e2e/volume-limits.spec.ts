import { test, expect, type Page, type CDPSession } from '@playwright/test';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setupCleanEnvironment, waitForAppLoad } from './fixtures/test-utils';
import { buildLargeDossierJson } from './fixtures/large-dossier';

/**
 * Volume benchmark: how a dossier behaves as elements and properties grow.
 *
 * Imports a synthetic dossier through the real import path, then measures
 * import, reopening (reload: Y.Doc decode, store, search index), search,
 * a property edit, and the matrix view (one column per distinct key).
 * Records JS heap after GC and the origin's storage usage.
 * Chromium only (CDP). Encryption is off. On the dev server, numbers are
 * pessimistic (React dev code, StrictMode, unminified). On a build made with
 * `--mode bench`, which exposes the modules the bench drives:
 *
 *   BENCH_ELEMENTS=5000 BENCH_PROPS=50 npx playwright test volume-limits --project=chromium --reporter=list
 *
 *   npx vite build --mode bench --outDir dist-bench
 *   npx vite preview --outDir dist-bench --port 4174 --strictPort
 *   BENCH_URL=http://localhost:4174 BENCH_ELEMENTS=5000 BENCH_PROPS=50 npx playwright test volume-limits --project=chromium --reporter=list
 *
 * BENCH_ELEMENTS  elements (default 2000)
 * BENCH_PROPS     properties per element (default 20)
 * BENCH_KEYS      distinct property keys in the dossier, >= BENCH_PROPS (default BENCH_PROPS)
 * BENCH_UNIQUE    share of unique values, 0..1 (default 0.5); 1 = phone numbers,
 *                 hashes, IMEI... (worst case for search), 0 = repeated values
 * BENCH_URL       private dev server, avoids reloads caused by edits in the main one
 * BENCH_OUT       result file (default: <tmp>/volume-bench-<E>x<P>.json)
 * BENCH_PROFILE_DIR  also writes the raw CPU profiles (.cpuprofile) there
 */

const ELEMENTS = Number(process.env.BENCH_ELEMENTS ?? 2000);
const PROPS = Number(process.env.BENCH_PROPS ?? 20);
const KEYS = Math.max(PROPS, Number(process.env.BENCH_KEYS ?? PROPS));
const UNIQUE = Math.min(1, Math.max(0, Number(process.env.BENCH_UNIQUE ?? 0.5)));
const SETTLE_MS = 2500;
const TARGET_VALUE = 'zzbenchcible';
const OUT_FILE = process.env.BENCH_OUT ?? join(tmpdir(), `volume-bench-${ELEMENTS}x${PROPS}.json`);

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    __znImport(path: string): Promise<any>;
    __znBenchModules?: Record<string, unknown>;
    __longTasks: number[];
    __frames: number[];
    __framesOn: boolean;
  }
}

test.describe.configure({ mode: 'serial', timeout: 30 * 60 * 1000 });
if (process.env.BENCH_URL) test.use({ baseURL: process.env.BENCH_URL });

/** Same element/link layout as the render benchmarks, with many properties. */
function buildDossierJson(): string {
  const data = JSON.parse(buildLargeDossierJson(ELEMENTS));
  data.elements.forEach((el: { properties: unknown[] }, i: number) => {
    el.properties = Array.from({ length: PROPS }, (_, j) => {
      const key = `cle_${(i * PROPS + j) % KEYS}`;
      // Deterministic spread between unique and repeated values.
      const unique = ((i * 31 + j * 17) % 100) < UNIQUE * 100;
      const value = unique
        ? `+336${String(i * PROPS + j).padStart(8, '0')}`
        : `valeur ${(i + j) % 50}`;
      return { key, value, type: 'text' };
    });
  });
  data.elements[0].properties[0].value = TARGET_VALUE;
  return JSON.stringify(data);
}

const results: Record<string, unknown>[] = [];
function record(result: Record<string, unknown>) {
  console.log(JSON.stringify(result));
  results.push(result);
  // Outside the project root: Vite reloads the page on any file it watches.
  writeFileSync(OUT_FILE, JSON.stringify({ config: { ELEMENTS, PROPS, KEYS, UNIQUE }, results }, null, 2));
}

async function longTasks(page: Page) {
  const tasks = await page.evaluate(() => window.__longTasks);
  return {
    longTaskTotalMs: Math.round(tasks.reduce((a, b) => a + b, 0)),
    longTaskMaxMs: Math.round(Math.max(0, ...tasks)),
  };
}

interface ProfileNode {
  id: number;
  callFrame: { functionName: string; url: string; lineNumber: number };
}

/** Self time per function and per source file, top N, from a CDP CPU profile. */
function topSelfTime(profile: { nodes: ProfileNode[]; samples?: number[]; timeDeltas?: number[] }, n = 15) {
  const byNode = new Map<number, number>();
  const samples = profile.samples ?? [];
  const deltas = profile.timeDeltas ?? [];
  for (let i = 0; i < samples.length; i++) {
    byNode.set(samples[i], (byNode.get(samples[i]) ?? 0) + (deltas[i] ?? 0) / 1000);
  }
  const byFn = new Map<string, number>();
  const byFile = new Map<string, number>();
  for (const node of profile.nodes) {
    const ms = byNode.get(node.id);
    if (!ms) continue;
    const { functionName, url, lineNumber } = node.callFrame;
    if (functionName === '(idle)' || functionName === '(program)') continue;
    const file = url.split('/').pop()?.split('?')[0] || '(native)';
    const key = `${functionName || '(anon)'} ${file}:${lineNumber + 1}`;
    byFn.set(key, (byFn.get(key) ?? 0) + ms);
    byFile.set(file, (byFile.get(file) ?? 0) + ms);
  }
  const top = (m: Map<string, number>) => [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, ms]) => `${Math.round(ms)}ms ${k}`);
  return { topFunctions: top(byFn), topFiles: top(byFile) };
}

async function stopProfile(cdp: CDPSession, name: string) {
  const raw = (await cdp.send('Profiler.stop')).profile;
  // Raw profile, readable in DevTools (Performance > Load profile).
  if (process.env.BENCH_PROFILE_DIR) writeFileSync(join(process.env.BENCH_PROFILE_DIR, `${name}.cpuprofile`), JSON.stringify(raw));
  return topSelfTime(raw as never);
}

/** With `cdp`, the action and its settle window are CPU-profiled. */
async function measure(page: Page, name: string, action: () => Promise<void>, settle = SETTLE_MS, cdp?: CDPSession) {
  await page.evaluate(() => { window.__longTasks = []; });
  if (cdp) await cdp.send('Profiler.start');
  const start = Date.now();
  await action();
  const actionMs = Date.now() - start;
  await page.waitForTimeout(settle);
  const profile = cdp ? await stopProfile(cdp, name) : {};
  const result = { name, actionMs, ...(await longTasks(page)), ...profile };
  record(result);
  return result;
}

async function heapMb(cdp: CDPSession) {
  await cdp.send('HeapProfiler.collectGarbage');
  const { metrics } = await cdp.send('Performance.getMetrics');
  const used = metrics.find((m) => m.name === 'JSHeapUsedSize')?.value ?? 0;
  return Math.round(used / 1e6);
}

async function storageMb(page: Page) {
  const usage = await page.evaluate(async () => (await navigator.storage.estimate()).usage ?? 0);
  return Math.round(usage / 1e6);
}

async function storeElementCount(page: Page) {
  return page.evaluate(async () => {
    const { useDossierStore } = await window.__znImport('/src/stores/dossierStore.ts');
    return useDossierStore.getState().elements.length;
  });
}

/** Frame intervals while scrolling the element under (x, y) with the wheel. */
async function wheelFrames(page: Page, at: { x: number; y: number }, dx: number, dy: number, steps: number) {
  await page.evaluate(() => {
    window.__frames = [];
    window.__framesOn = true;
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      window.__frames.push(now - last);
      last = now;
      if (window.__framesOn) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.mouse.move(at.x, at.y);
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(dx, dy);
    await page.waitForTimeout(16);
  }
  const frames = await page.evaluate(() => {
    window.__framesOn = false;
    return window.__frames;
  });
  const sorted = [...frames].sort((a, b) => a - b);
  return {
    medianFrameMs: Math.round(sorted[Math.floor(sorted.length / 2)] ?? 0),
    worstFrameMs: Math.round(sorted[sorted.length - 1] ?? 0),
  };
}

test('volume limits: elements and properties', async ({ page }) => {
  await page.addInitScript(() => {
    // Import the module URL the app actually loaded (?t=…), not a fresh copy.
    window.__znImport = async (path: string) => {
      // Build made with `--mode bench`: the app exposes its modules itself.
      const bench = window.__znBenchModules;
      if (bench) {
        if (!bench[path]) throw new Error(`module not exposed by the bench build: ${path}`);
        return bench[path];
      }
      const loaded = performance
        .getEntriesByType('resource')
        .map((e) => e.name)
        .filter((name) => new URL(name).pathname === path);
      return import(/* @vite-ignore */ loaded.length > 0 ? loaded[loaded.length - 1] : path);
    };
    window.__longTasks = [];
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) window.__longTasks.push(e.duration);
      }).observe({ type: 'longtask', buffered: true });
    } catch { /* not supported */ }
  });

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 500 });

  await setupCleanEnvironment(page);
  await waitForAppLoad(page);

  const json = buildDossierJson();
  const file = join(mkdtempSync(join(tmpdir(), 'zn-volume-')), 'volume.json');
  writeFileSync(file, json);
  record({
    name: 'config',
    elements: ELEMENTS,
    propsPerElement: PROPS,
    totalProperties: ELEMENTS * PROPS,
    distinctKeys: KEYS,
    uniqueShare: UNIQUE,
    importFileMb: Math.round(json.length / 1e6),
  });

  // ── Import ───────────────────────────────────────────────────────────────
  await measure(page, 'import', async () => {
    await page.click('[data-testid="import-button"]');
    await expect(page.locator('[data-testid="import-modal"]')).toBeVisible();
    await page.setInputFiles('input[type="file"]', file);
    // Not '.react-flow__node': a large dossier may open in the overview
    // layer, drawn on a canvas, with no node in the DOM.
    await page.waitForSelector('[data-testid="canvas"]', { timeout: 20 * 60 * 1000 });
    await expect.poll(() => storeElementCount(page), { timeout: 20 * 60 * 1000 }).toBe(ELEMENTS);
  }, 8000);
  record({ name: 'after-import', heapMb: await heapMb(cdp), storageMb: await storageMb(page) });

  // ── Reopen (reload): read from storage, as a user opening the dossier ────
  // The profiler follows the page across the reload (same renderer).
  await cdp.send('Profiler.start');
  const reloadStart = Date.now();
  await page.reload();
  await expect.poll(() => storeElementCount(page).catch(() => 0), { timeout: 20 * 60 * 1000 }).toBe(ELEMENTS);
  const storeReadyMs = Date.now() - reloadStart;
  await expect.poll(() => page.evaluate(async (q) => {
    const { searchService } = await window.__znImport('/src/services/searchService.ts');
    return searchService.search(q, 5, 'exact').length;
  }, TARGET_VALUE), { timeout: 20 * 60 * 1000, intervals: [100, 250, 500] }).toBeGreaterThan(0);
  const searchReadyMs = Date.now() - reloadStart;
  await page.waitForTimeout(SETTLE_MS);
  const reopenProfile = await stopProfile(cdp, 'reopen');
  record({
    name: 'reopen',
    storeReadyMs,
    searchReadyMs,
    ...(await longTasks(page)),
    heapMb: await heapMb(cdp),
    ...reopenProfile,
  });

  // ── Search ───────────────────────────────────────────────────────────────
  const search = await page.evaluate(async (target) => {
    const { searchService } = await window.__znImport('/src/services/searchService.ts');
    const time = (q: string, mode: 'fuzzy' | 'exact') => {
      const t = performance.now();
      const hits = searchService.search(q, 20, mode).length;
      return { q, mode, ms: Math.round((performance.now() - t) * 10) / 10, hits };
    };
    return [time(target, 'exact'), time('valeur', 'fuzzy'), time('+3360', 'fuzzy'), time('valeyr', 'fuzzy')];
  }, TARGET_VALUE);
  record({ name: 'search', queries: search });

  // ── Edit one property of one element ─────────────────────────────────────
  await measure(page, 'edit-property', async () => {
    await page.evaluate(async () => {
      const { useDossierStore } = await window.__znImport('/src/stores/dossierStore.ts');
      const st = useDossierStore.getState();
      const el = st.elements[0];
      const properties = el.properties.map((p: { value: unknown }, i: number) =>
        (i === 1 ? { ...p, value: 'modifie' } : p));
      await st.updateElement(el.id, { properties });
    });
  }, SETTLE_MS, cdp);

  // ── Open the detail panel of an element ──────────────────────────────────
  await measure(page, 'select-element', async () => {
    await page.evaluate(async () => {
      const { useDossierStore } = await window.__znImport('/src/stores/dossierStore.ts');
      const { useSelectionStore } = await window.__znImport('/src/stores/selectionStore.ts');
      useSelectionStore.getState().selectElements([useDossierStore.getState().elements[0].id]);
    });
  }, 1500);

  // ── Matrix view: one column per distinct key ─────────────────────────────
  await page.evaluate(async () => {
    const { useSelectionStore } = await window.__znImport('/src/stores/selectionStore.ts');
    useSelectionStore.getState().clearSelection();
  });
  await measure(page, 'matrix-open', async () => {
    await page.evaluate(async () => {
      const { useViewStore } = await window.__znImport('/src/stores/viewStore.ts');
      useViewStore.getState().setDisplayMode('matrix');
    });
    await page.waitForSelector('[role="grid"] [role="gridcell"]', { timeout: 5 * 60 * 1000 });
  });
  const grid = page.locator('[role="grid"]');
  const box = await grid.boundingBox();
  if (!box) throw new Error('matrix grid not visible');
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const matrixInfo = await page.evaluate(() => {
    const g = document.querySelector('[role="grid"]');
    return {
      columns: Number(g?.getAttribute('aria-colcount') ?? 0),
      cellsInDom: document.querySelectorAll('[role="grid"] [role="gridcell"]').length,
    };
  });
  await page.evaluate(() => { window.__longTasks = []; });
  const vertical = await wheelFrames(page, center, 0, 400, 30);
  record({ name: 'matrix-scroll-vertical', ...matrixInfo, ...vertical, ...(await longTasks(page)) });
  await page.evaluate(() => { window.__longTasks = []; });
  const horizontal = await wheelFrames(page, center, 400, 0, 30);
  record({ name: 'matrix-scroll-horizontal', ...horizontal, ...(await longTasks(page)) });

  // ── Summary ──────────────────────────────────────────────────────────────
  const by = (n: string) => results.find((r) => r.name === n) ?? {};
  const s = (v: unknown) => String(v ?? '-');
  const imp = by('import'), aft = by('after-import'), re = by('reopen');
  const ed = by('edit-property'), mo = by('matrix-open');
  const mv = by('matrix-scroll-vertical'), mh = by('matrix-scroll-horizontal');
  console.log([
    '',
    `Volume ${ELEMENTS} éléments x ${PROPS} propriétés (${ELEMENTS * PROPS} au total, ${KEYS} clés, ${Math.round(UNIQUE * 100)} % de valeurs uniques)`,
    `  import                ${s(imp.actionMs)} ms`,
    `  mémoire JS / disque   ${s(aft.heapMb)} Mo / ${s(aft.storageMb)} Mo`,
    `  réouverture           données ${s(re.storeReadyMs)} ms, recherche prête ${s(re.searchReadyMs)} ms, plus long blocage ${s(re.longTaskMaxMs)} ms, mémoire ${s(re.heapMb)} Mo`,
    `  recherche             ${search.map((q) => `${q.q} ${q.ms} ms`).join(', ')}`,
    `  modifier 1 propriété  blocage total ${s(ed.longTaskTotalMs)} ms (max ${s(ed.longTaskMaxMs)} ms)`,
    `  matrice               ouverture ${s(mo.actionMs)} ms, ${s(mv.columns)} colonnes, ${s(mv.cellsInDom)} cellules`,
    `  défilement matrice    vertical médiane ${s(mv.medianFrameMs)} / pire ${s(mv.worstFrameMs)} ms, horizontal ${s(mh.medianFrameMs)} / ${s(mh.worstFrameMs)} ms`,
    `  résultats             ${OUT_FILE}`,
    '',
  ].join('\n'));

  expect(results.length).toBeGreaterThan(0);
});
