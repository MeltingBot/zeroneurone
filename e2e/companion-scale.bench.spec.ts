/**
 * Companion with a large dossier: how long joining, the list, the search and
 * the timeline take on a phone-like CPU (4x slower). A benchmark, not a test:
 * runs only with COMPANION_BENCH=1, and prints its measures.
 *
 *   COMPANION_BENCH=1 COMPANION_BENCH_SIZES=2000,5000,1000+200 npx playwright test e2e/companion-scale.bench.spec.ts
 */
import { test, expect, devices, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { connect } from 'node:net';
import { setupCleanEnvironment } from './fixtures/test-utils';
import { buildLargeDossierJson } from './fixtures/large-dossier';

const RELAY_PORT = 4471;
const SERVER = `ws://localhost:${RELAY_PORT}`;
/** "5000" = 5000 elements; "1000+200" = 1000 elements, 200 of them with a ~450 KB photo */
const SIZES = (process.env.COMPANION_BENCH_SIZES ?? '2000,5000,1000+200').split(',').map((spec) => {
  const [elements, photos] = spec.split('+').map(Number);
  return { elements, photos: photos || 0, name: spec };
});

test.describe.configure({ mode: 'serial' });
test.skip(!process.env.COMPANION_BENCH, 'Benchmark: COMPANION_BENCH=1 to run');

let relay: ChildProcess | null = null;
test.beforeAll(async () => {
  const log = process.env.BENCH_RELAY_LOG ? (await import('node:fs')).openSync(process.env.BENCH_RELAY_LOG, 'w') : 'ignore';
  relay = spawn('node', ['relay/index.js'], { stdio: ['ignore', log, log], env: { ...process.env, PORT: String(RELAY_PORT) } });
  for (let i = 0; i < 50; i++) {
    const up = await new Promise((resolve) => {
      const socket = connect(RELAY_PORT, 'localhost', () => { socket.end(); resolve(true); });
      socket.on('error', () => resolve(false));
    });
    if (up) return;
    await new Promise((r) => setTimeout(r, 200));
  }
});
test.afterAll(() => { relay?.kill(); });

const heapMB = async (page: Page) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const { metrics } = await cdp.send('Performance.getMetrics');
  return Math.round((metrics.find((m) => m.name === 'JSHeapUsedSize')?.value ?? 0) / 1024 / 1024);
};

for (const { elements: size, photos, name } of SIZES) {
  test(`companion with ${name} elements`, async ({ browser }) => {
    test.setTimeout(15 * 60 * 1000);
    const desktopContext = await browser.newContext();
    await desktopContext.addInitScript((server) => localStorage.setItem('zeroneurone-signaling-server', server), SERVER);
    const desktop = await desktopContext.newPage();
    await setupCleanEnvironment(desktop);
    const file = join(mkdtempSync(join(tmpdir(), 'zn-bench-')), `bench-${size}.json`);
    // Every element dated (a period over ten years): the timeline holds them all
    const dossier = JSON.parse(buildLargeDossierJson(size)) as { elements: { dateRange: unknown }[] };
    dossier.elements.forEach((e, i) => {
      e.dateRange = { start: new Date(2016 + (i % 10), i % 12, 1 + (i % 28)).toISOString(), end: null };
    });
    writeFileSync(file, JSON.stringify(dossier));
    await desktop.click('[data-testid="import-button"]');
    await desktop.setInputFiles('input[type="file"]', file);
    await desktop.waitForSelector('.react-flow__node', { timeout: 300_000 });
    await desktop.waitForTimeout(3000);
    if (photos > 0) {
      // Photos on the first elements, each a few bytes apart (no deduplication)
      const png = (await import('node:fs')).readFileSync('public/logo.png').toString('base64');
      await desktop.evaluate(async ({ png, photos }) => {
        const d = (await import('/src/stores/dossierStore.ts')).useDossierStore.getState();
        const bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0));
        for (let i = 0; i < photos; i++) {
          const tail = new TextEncoder().encode(`#${i}#`);
          await d.addAsset(`el-${i}`, new File([bytes, tail], `photo-${i}.png`, { type: 'image/png' }));
        }
      }, { png, photos });
      await desktop.waitForTimeout(3000);
    }
    const mobileUrl = await desktop.evaluate(async () => {
      const { useSyncStore } = await import('/src/stores/syncStore.ts');
      const { syncService } = await import('/src/services/syncService.ts');
      const { encryptionKey } = await useSyncStore.getState().share('Bench', true);
      return syncService.buildShareUrl(syncService.getDossierId()!, encryptionKey, 'Bench', true, 'm');
    });

    const { defaultBrowserType: _ignored, ...iphone } = devices['iPhone 13'];
    const phoneContext = await browser.newContext({ ...iphone, locale: 'fr-FR' });
    const phone = await phoneContext.newPage();
    const cdp = await phoneContext.newCDPSession(phone);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const measures: Record<string, number> = {};
    const time = async (name: string, run: () => Promise<unknown>) => {
      const t0 = Date.now();
      await run();
      measures[name] = Date.now() - t0;
    };

    await phone.goto(mobileUrl);
    await time('join → first row (ms)', async () => {
      await phone.getByRole('button', { name: 'Ouvrir sur ce téléphone' }).click();
      await expect(phone.locator('main ul li').first()).toBeVisible({ timeout: 600_000 });
    });
    await time('join → every element in the data (ms)', async () => {
      await expect.poll(async () => phone.locator('main ul li').count(), { timeout: 600_000, intervals: [500] }).toBeGreaterThanOrEqual(Math.min(size, 50));
      await phone.waitForFunction((n) => document.querySelectorAll('main ul li').length >= n || !!document.querySelector('[data-rows-limited]'), size, { timeout: 600_000, polling: 500 });
    });
    measures['rows in the DOM'] = await phone.locator('main ul li').count();
    if (photos > 0) {
      // Until every photo is on the phone: its thumbnail shown on the first rows is not enough
      await time('join → every photo on the phone (ms)', async () => {
        const complete = () => phone.evaluate(async () => {
          const { syncService } = await import('/src/services/syncService.ts');
          const { isAssetComplete } = await import('/src/services/assetSync.ts');
          let n = 0;
          syncService.getYDoc()?.getMap('assets').forEach((a) => { if (isAssetComplete(a as never)) n++; });
          return n;
        });
        await expect.poll(complete, { timeout: 600_000, intervals: [2000] }).toBeGreaterThanOrEqual(photos);
      });
      measures['heap with every photo (MB)'] = await heapMB(phone);
      // Binary data lives outside the JS heap: counted from the document itself
      const held = await phone.evaluate(async () => {
        const { syncService } = await import('/src/services/syncService.ts');
        const { getReceivedBytes, isAssetComplete } = await import('/src/services/assetSync.ts');
        let bytes = 0;
        let complete = 0;
        syncService.getYDoc()?.getMap('assets').forEach((a) => {
          bytes += getReceivedBytes(a as never);
          if (isAssetComplete(a as never)) complete++;
        });
        return { mb: Math.round(bytes / 1024 / 1024), complete };
      });
      measures['photos complete on the phone'] = held.complete;
      measures['photo bytes held in memory (MB)'] = held.mb;
      measures['local copy on the phone (MB)'] = await phone.evaluate(async () => Math.round(((await navigator.storage.estimate()).usage ?? 0) / 1024 / 1024));
    }
    measures['heap after join (MB)'] = await heapMB(phone);
    await time('reload → first row (ms)', async () => {
      await phone.reload();
      await expect(phone.locator('main ul li').first()).toBeVisible({ timeout: 600_000 });
    });
    await time('search "Dupont 12" → results (ms)', async () => {
      await phone.getByPlaceholder('Rechercher').fill('Dupont 12');
      await expect(phone.getByText(/\d+ résultats?/)).toBeVisible({ timeout: 120_000 });
    });
    await phone.getByRole('button', { name: 'Effacer la recherche' }).click();
    await time('timeline tab → first entry (ms)', async () => {
      await phone.getByRole('button', { name: 'Chronologie' }).click();
      await expect(phone.locator('main li[data-index]').first()).toBeVisible({ timeout: 120_000 });
    });
    measures['timeline entries in the DOM'] = await phone.locator('main li[data-index]').count();
    await time('timeline jump to the last year (ms)', async () => {
      await phone.locator('button[data-period="2025"]').click();
      await expect(phone.locator('button[data-period="2025"]')).toHaveAttribute('aria-current', 'true', { timeout: 120_000 });
    });
    await time('back to the list (ms)', async () => {
      await phone.getByRole('button', { name: 'Éléments' }).click();
      await expect(phone.locator('main ul li').first()).toBeVisible({ timeout: 120_000 });
    });
    measures['heap at the end (MB)'] = await heapMB(phone);

    console.log(`\n=== Companion, ${size} elements (CPU x4) ===`);
    for (const [k, v] of Object.entries(measures)) console.log(`${k.padEnd(40)} ${v}`);
    await phoneContext.close();
    await desktopContext.close();
  });
}
