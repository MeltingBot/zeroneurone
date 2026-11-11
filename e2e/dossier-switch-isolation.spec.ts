import { test, expect, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { connect } from 'node:net';
import { setupCleanEnvironment } from './fixtures/test-utils';
import { buildLargeDossierJson } from './fixtures/large-dossier';

/**
 * Switching dossiers while a shared one is still loading must not mix them.
 *
 * A shared dossier's load waits for the network (up to 5 s). Opening another
 * dossier meanwhile used to let the first load finish last: the store then
 * showed dossier A over dossier B's Y.Doc, and the delayed write sent A's
 * name, options and files into B's collaboration room.
 * Dev server only: drives the stores through Vite's module URLs.
 */

const RELAY_PORT = Number(process.env.SWITCH_RELAY_PORT ?? 4462);
const SERVER = `ws://localhost:${RELAY_PORT}`;
let relay: ChildProcess;

// One relay for the file: its tests must not run side by side
test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  relay = spawn('node', ['relay/index.js'], { stdio: 'ignore', env: { ...process.env, PORT: String(RELAY_PORT) } });
  const deadline = Date.now() + 10_000;
  for (;;) {
    const open = await new Promise<boolean>((resolve) => {
      const socket = connect(RELAY_PORT, 'localhost', () => { socket.end(); resolve(true); });
      socket.on('error', () => resolve(false));
    });
    if (open) break;
    if (Date.now() > deadline) throw new Error('relay did not start');
    await new Promise((r) => setTimeout(r, 200));
  }
});

test.afterAll(() => { relay?.kill(); });

/** In-app navigation (no reload), as the app's own links do */
async function go(page: Page, path: string) {
  await page.evaluate((p) => {
    window.history.pushState({}, '', p);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}

test('opening another dossier while a shared one loads keeps them apart', async ({ browser }) => {
  test.setTimeout(3 * 60 * 1000);
  const context = await browser.newContext();
  await context.addInitScript((server) => localStorage.setItem('zeroneurone-signaling-server', server), SERVER);
  const page = await context.newPage();
  await setupCleanEnvironment(page);

  // Dossier A: imported, then shared (its loads now wait for the network)
  const file = join(mkdtempSync(join(tmpdir(), 'zn-switch-')), 'a.json');
  writeFileSync(file, buildLargeDossierJson(6));
  await page.click('[data-testid="import-button"]');
  await page.setInputFiles('input[type="file"]', file);
  await page.waitForSelector('.react-flow__node', { timeout: 60_000 });
  await page.waitForTimeout(1500);
  const a = await page.evaluate(async () => {
    const { useSyncStore } = await import('/src/stores/syncStore.ts');
    const { useDossierStore } = await import('/src/stores/dossierStore.ts');
    await useSyncStore.getState().share('A', true);
    const d = useDossierStore.getState();
    return { id: d.currentDossier!.id, labels: d.elements.map((e) => e.label) };
  });

  // Dossier B: local, one element of its own
  const bId = await page.evaluate(async () => {
    const { useDossierStore } = await import('/src/stores/dossierStore.ts');
    const b = await useDossierStore.getState().createDossier('Dossier B');
    return b.id;
  });
  await go(page, '/');
  await page.waitForTimeout(1000);
  await go(page, `/dossier/${bId}`);
  await expect.poll(() => page.evaluate(async () =>
    (await import('/src/stores/dossierStore.ts')).useDossierStore.getState().currentDossier?.id), { timeout: 20_000 }).toBe(bId);
  await page.evaluate(async () => {
    const { useDossierStore } = await import('/src/stores/dossierStore.ts');
    await useDossierStore.getState().createElement('B seul', { x: 0, y: 0 });
  });

  // Open A, then B before A's load ends
  await go(page, '/');
  await page.waitForTimeout(800);
  await go(page, `/dossier/${a.id}`);
  await page.waitForTimeout(300);
  await go(page, '/');
  await page.waitForTimeout(100);
  await go(page, `/dossier/${bId}`);

  // Long enough for A's load (5 s network wait) and its delayed write
  await page.waitForTimeout(9000);

  const state = await page.evaluate(async () => {
    const { useDossierStore } = await import('/src/stores/dossierStore.ts');
    const { syncService } = await import('/src/services/syncService.ts');
    const d = useDossierStore.getState();
    const ydoc = syncService.getYDoc();
    const labels: string[] = [];
    ydoc?.getMap('elements').forEach((m) => labels.push((m as { get(k: string): unknown }).get('label') as string));
    return {
      shown: d.currentDossier?.id,
      storeLabels: d.elements.map((e) => e.label),
      ydocDossier: syncService.getDossierId(),
      ydocLabels: labels,
      ydocName: ydoc?.getMap('meta').get('name') ?? null,
    };
  });

  expect(state.shown).toBe(bId);
  expect(state.ydocDossier).toBe(bId);
  expect(state.storeLabels).toEqual(['B seul']);
  expect(state.ydocLabels).toEqual(['B seul']);
  expect(state.ydocName).not.toBe('A');
  for (const label of a.labels) expect(state.ydocLabels).not.toContain(label);
});

test('the integrity check reports entries of another dossier', async ({ browser }) => {
  test.setTimeout(2 * 60 * 1000);
  const page = await (await browser.newContext()).newPage();
  await setupCleanEnvironment(page);

  // Two local dossiers; one element of A is planted in B's Y.Doc, as the bug did
  const ids = await page.evaluate(async () => {
    const { useDossierStore } = await import('/src/stores/dossierStore.ts');
    const a = await useDossierStore.getState().createDossier('Dossier source');
    const b = await useDossierStore.getState().createDossier('Dossier cible');
    return { a: a.id, b: b.id };
  });
  await go(page, `/dossier/${ids.b}`);
  await expect.poll(() => page.evaluate(async () =>
    (await import('/src/stores/dossierStore.ts')).useDossierStore.getState().currentDossier?.id), { timeout: 20_000 }).toBe(ids.b);
  await page.evaluate(async (a) => {
    const { syncService } = await import('/src/services/syncService.ts');
    const { elementToYMap } = await import('/src/services/yjs/elementMapper.ts');
    const { buildNewElement } = await import('/src/services/yjs/factories.ts');
    const ydoc = syncService.getYDoc()!;
    ydoc.getMap('elements').set('planted', elementToYMap({ ...buildNewElement(a, 'Élément intrus', { x: 0, y: 0 }), id: 'planted' }));
  }, ids.a);
  await page.waitForTimeout(1500);
  await go(page, '/');

  await page.locator('button[title="Storage"]').first().click();
  await page.getByRole('button', { name: 'Maintenance' }).click();
  const check = page.getByTestId('integrity-check');
  await check.getByRole('button', { name: 'Check' }).click();
  await expect(check).toContainText('Dossier cible');
  await expect(check).toContainText('1 element');
  await expect(check).toContainText('from "Dossier source"');
  await expect(check).toContainText('Élément intrus');
});
