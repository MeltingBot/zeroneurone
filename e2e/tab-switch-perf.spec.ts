import { test, expect, type Page, type CDPSession } from '@playwright/test';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setupCleanEnvironment, waitForAppLoad } from './fixtures/test-utils';
import { buildLargeDossierJson } from './fixtures/large-dossier';

/**
 * Switching from a canvas tab to "All" on a heavy dossier: main-thread long
 * tasks and the functions with the most self time. Chromium only (CDP):
 *
 *   BENCH_ELEMENTS=6000 BENCH_URL=http://localhost:5190 npx playwright test tab-switch-perf --project=chromium --reporter=list
 */

const ELEMENT_COUNT = Number(process.env.BENCH_ELEMENTS ?? 6000);
test.describe.configure({ mode: 'serial', timeout: 15 * 60 * 1000 });
if (process.env.BENCH_URL) test.use({ baseURL: process.env.BENCH_URL });

interface ProfileNode { id: number; callFrame: { functionName: string; url: string; lineNumber: number } }

function topSelfTime(profile: { nodes: ProfileNode[]; samples?: number[]; timeDeltas?: number[] }, n = 30) {
  const byNode = new Map<number, number>();
  const samples = profile.samples ?? [];
  const deltas = profile.timeDeltas ?? [];
  for (let i = 0; i < samples.length; i++) byNode.set(samples[i], (byNode.get(samples[i]) ?? 0) + (deltas[i] ?? 0) / 1000);
  const byFn = new Map<string, number>();
  for (const node of profile.nodes) {
    const ms = byNode.get(node.id);
    if (!ms) continue;
    const { functionName, url, lineNumber } = node.callFrame;
    if (functionName === '(idle)' || functionName === '(program)') continue;
    const key = `${functionName || '(anon)'} ${url.split('/').pop()?.split('?')[0] ?? ''}:${lineNumber + 1}`;
    byFn.set(key, (byFn.get(key) ?? 0) + ms);
  }
  return [...byFn.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([fn, ms]) => `${Math.round(ms)}ms ${fn}`);
}

/** Total time (self + callees) per app function, top N: where the time goes */
function topInclusive(profile: { nodes: (ProfileNode & { children?: number[] })[]; samples?: number[]; timeDeltas?: number[] }, n = 25) {
  const self = new Map<number, number>();
  const samples = profile.samples ?? [];
  const deltas = profile.timeDeltas ?? [];
  for (let i = 0; i < samples.length; i++) self.set(samples[i], (self.get(samples[i]) ?? 0) + (deltas[i] ?? 0) / 1000);
  const byId = new Map(profile.nodes.map((nd) => [nd.id, nd]));
  const total = new Map<number, number>();
  const sum = (id: number): number => {
    if (total.has(id)) return total.get(id)!;
    const nd = byId.get(id)!;
    let t = self.get(id) ?? 0;
    for (const c of nd.children ?? []) t += sum(c);
    total.set(id, t);
    return t;
  };
  const byFn = new Map<string, number>();
  for (const nd of profile.nodes) {
    const { functionName, url, lineNumber } = nd.callFrame;
    if (!url || !functionName || /^(run|exports\.jsx|jsxDEV|renderWithHooks|performWork|workLoop|beginWork|commit)/.test(functionName)) continue;
    const key = `${functionName} ${url.split('/').pop()?.split('?')[0] ?? ''}:${lineNumber + 1}`;
    byFn.set(key, Math.max(byFn.get(key) ?? 0, sum(nd.id)));
  }
  return [...byFn.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([fn, ms]) => `${Math.round(ms)}ms ${fn}`);
}

async function switchTo(page: Page, tabId: string | null) {
  await page.evaluate(async (id) => {
    const tabs = await import('/src/stores/tabStore.ts');
    tabs.useTabStore.getState().setActiveTab(id);
  }, tabId);
}

async function measure(page: Page, cdp: CDPSession, name: string, action: () => Promise<void>) {
  await page.evaluate(() => { (window as unknown as { __longTasks: number[] }).__longTasks = []; });
  await cdp.send('Profiler.start');
  await action();
  await page.waitForTimeout(4000);
  const { profile } = await cdp.send('Profiler.stop');
  const tasks = await page.evaluate(() => (window as unknown as { __longTasks: number[] }).__longTasks);
  const result = {
    name,
    longTaskTotalMs: Math.round(tasks.reduce((a, b) => a + b, 0)),
    longTaskMaxMs: Math.round(Math.max(0, ...tasks)),
    longTasks: tasks.map(Math.round),
    top: topSelfTime(profile as never),
    inclusive: topInclusive(profile as never),
    dom: await page.evaluate(() => ({
      nodes: document.querySelectorAll('.react-flow__node').length,
      edges: document.querySelectorAll('.react-flow__edge').length,
      lowDetail: !!document.querySelector('.react-flow__node [class*="sketchy"]'),
    })),
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

test('switching to "All" on a heavy dossier', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __longTasks: number[] };
    w.__longTasks = [];
    try {
      new PerformanceObserver((list) => { for (const e of list.getEntries()) w.__longTasks.push(e.duration); })
        .observe({ type: 'longtask', buffered: false });
    } catch { /* not supported */ }
  });

  await setupCleanEnvironment(page);
  await waitForAppLoad(page);
  const dir = mkdtempSync(join(tmpdir(), 'zn-bench-'));
  const file = join(dir, 'heavy.json');
  writeFileSync(file, buildLargeDossierJson(ELEMENT_COUNT));
  await page.click('[data-testid="import-button"]');
  await expect(page.locator('[data-testid="import-modal"]')).toBeVisible();
  await page.setInputFiles('input[type="file"]', file);
  await page.waitForSelector('.react-flow__node', { timeout: 5 * 60 * 1000 });
  await page.waitForTimeout(8000);

  // A tab holding half the elements, opened
  const tabId = await page.evaluate(async () => {
    const dossier = await import('/src/stores/dossierStore.ts');
    const tabs = await import('/src/stores/tabStore.ts');
    const { currentDossier, elements } = dossier.useDossierStore.getState();
    const tab = await tabs.useTabStore.getState().createTab(currentDossier!.id, 'Moitié');
    await tabs.useTabStore.getState().addMembers(tab.id, elements.slice(0, Math.floor(elements.length / 2)).map((e) => e.id));
    tabs.useTabStore.getState().setActiveTab(tab.id);
    return tab.id;
  });
  await page.waitForTimeout(5000);

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 500 });

  await measure(page, cdp, 'tab → All (detail panel)', () => switchTo(page, null));
  await switchTo(page, tabId);
  await page.waitForTimeout(4000);

  // Same, minimap hidden
  await page.evaluate(async () => {
    const ui = await import('/src/stores/uiStore.ts');
    if (ui.useUIStore.getState().showMinimap) ui.useUIStore.getState().toggleMinimap();
  });
  await page.waitForTimeout(2000);
  await measure(page, cdp, 'tab → All (no minimap)', () => switchTo(page, null));
  await switchTo(page, tabId);
  await page.waitForTimeout(4000);
  await page.evaluate(async () => {
    const ui = await import('/src/stores/uiStore.ts');
    if (!ui.useUIStore.getState().showMinimap) ui.useUIStore.getState().toggleMinimap();
  });
  await page.waitForTimeout(2000);

  // Real click on "All": the activity bar must show before the long task
  await page.evaluate(() => {
    const w = window as unknown as { __barAt: number | null; __tasksAt: { start: number; duration: number }[] };
    w.__barAt = null;
    w.__tasksAt = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) w.__tasksAt.push({ start: e.startTime, duration: e.duration });
    }).observe({ type: 'longtask', buffered: false });
    const mo = new MutationObserver(() => {
      if (w.__barAt === null && document.querySelector('[role="progressbar"]')) w.__barAt = performance.now();
    });
    mo.observe(document.body, { childList: true, subtree: true });
  });
  await page.getByRole('button', { name: /^(Tous|All)$/ }).click();
  await page.waitForTimeout(4000);
  const timing = await page.evaluate(() => {
    const w = window as unknown as { __barAt: number | null; __tasksAt: { start: number; duration: number }[] };
    const big = w.__tasksAt.filter((t) => t.duration > 100);
    return { barAt: w.__barAt && Math.round(w.__barAt), firstBigTaskAt: big[0] && Math.round(big[0].start), bigTaskMs: big[0] && Math.round(big[0].duration) };
  });
  console.log('click All →', JSON.stringify(timing));
  expect(timing.barAt).not.toBeNull();
  if (timing.firstBigTaskAt) expect(timing.barAt!).toBeLessThan(timing.firstBigTaskAt);
  await switchTo(page, tabId);
  await page.waitForTimeout(4000);

  await page.evaluate(async () => {
    const ui = await import('/src/stores/uiStore.ts');
    ui.useUIStore.getState().setSidePanelTab('insights');
  });
  await page.waitForTimeout(6000);
  await measure(page, cdp, 'tab → All (insights panel)', () => switchTo(page, null));
});
