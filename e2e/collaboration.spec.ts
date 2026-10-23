import { test, expect, type Browser, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { connect } from 'node:net';
import { setupCleanEnvironment, waitForAppLoad } from './fixtures/test-utils';
import { buildLargeDossierJson } from './fixtures/large-dossier';

/**
 * Two browsers on one shared dossier through a local relay: quick creations,
 * deletions, renames, pastes, an undone deletion and tab moves on both sides
 * at once. Both must end up identical, in memory, in their local Dexie copy
 * and after a reload. Covers the incremental Y.Doc → store/Dexie sync.
 * Dev server only: drives the stores through Vite's module URLs.
 */

const RELAY_PORT = Number(process.env.COLLAB_RELAY_PORT ?? 4459);
const ELEMENTS = Number(process.env.COLLAB_ELEMENTS ?? 1000);
const SERVER = `ws://localhost:${RELAY_PORT}`;

let relay: ChildProcess;

test.beforeAll(async () => {
  relay = spawn('node', ['relay-server.js', String(RELAY_PORT)], { stdio: 'ignore' });
  // Ready once its port accepts connections
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

/** A fresh browser profile with the relay configured */
async function newPeer(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  await context.addInitScript((server) => localStorage.setItem('zeroneurone-signaling-server', server), SERVER);
  const page = await context.newPage();
  await setupCleanEnvironment(page);
  return page;
}

/** Everything that must match between peers, as one comparable value */
async function fingerprint(page: Page) {
  return page.evaluate(async () => {
    const d = (await import('/src/stores/dossierStore.ts')).useDossierStore.getState();
    const t = (await import('/src/stores/tabStore.ts')).useTabStore.getState();
    return {
      elements: d.elements.map((e) => `${e.id}|${e.label}`).sort(),
      links: d.links.map((l) => `${l.id}|${l.fromId}|${l.toId}`).sort(),
      tabs: t.tabs.map((tab) => `${tab.name}:${[...tab.memberElementIds].sort().join(',')}`).sort(),
    };
  });
}

/** Rows of the local Dexie copy for the open dossier */
async function dexieCounts(page: Page) {
  return page.evaluate(async () => {
    const d = (await import('/src/stores/dossierStore.ts')).useDossierStore.getState();
    const { db } = await import('/src/db/database.ts');
    const dossierId = d.currentDossier!.id;
    return {
      store: { elements: d.elements.length, links: d.links.length },
      dexie: {
        elements: await db.elements.where({ dossierId }).count(),
        links: await db.links.where({ dossierId }).count(),
      },
    };
  });
}

test('two peers editing at once converge', async ({ browser }) => {
  test.setTimeout(6 * 60 * 1000);

  // ── A imports a dossier and shares it ──────────────────────────────────
  const a = await newPeer(browser);
  const file = join(mkdtempSync(join(tmpdir(), 'zn-collab-')), 'collab.json');
  writeFileSync(file, buildLargeDossierJson(ELEMENTS));
  await a.click('[data-testid="import-button"]');
  await a.setInputFiles('input[type="file"]', file);
  await a.waitForSelector('.react-flow__node', { timeout: 120_000 });
  await a.waitForTimeout(3000);
  const { shareUrl } = await a.evaluate(async () =>
    (await import('/src/stores/syncStore.ts')).useSyncStore.getState().share('Collab'));
  expect(shareUrl).toContain('/join/');

  // ── B joins through the link ────────────────────────────────────────────
  const b = await newPeer(browser);
  await b.goto(shareUrl);
  await b.getByRole('button', { name: 'Join', exact: true }).click();
  await b.waitForSelector('.react-flow__node', { timeout: 120_000 });
  await expect.poll(async () => (await fingerprint(b)).elements.length, { timeout: 60_000 }).toBe(ELEMENTS);
  expect(await fingerprint(b)).toEqual(await fingerprint(a));

  // ── Both edit at once ───────────────────────────────────────────────────
  const editsA = a.evaluate(async () => {
    const store = (await import('/src/stores/dossierStore.ts')).useDossierStore;
    const tabs = (await import('/src/stores/tabStore.ts')).useTabStore;
    const all = store.getState().elements.map((e) => e.id);
    // Quick creations
    for (let i = 0; i < 20; i++) await store.getState().createElement(`A-new-${i}`, { x: -2000 - i * 50, y: 0 });
    // Renames
    for (let i = 0; i < 20; i++) await store.getState().updateElement(all[100 + i], { label: `A-renamed-${i}` });
    // A tab, and a move between tabs
    const d = store.getState().currentDossier!.id;
    const t1 = await tabs.getState().createTab(d, 'A-tab-1');
    await tabs.getState().addMembers(t1.id, all.slice(300, 400));
    const t2 = await tabs.getState().createTab(d, 'A-tab-2');
    await tabs.getState().addMembers(t2.id, all.slice(350, 360));
    await tabs.getState().removeMembers(t1.id, all.slice(350, 360));
  });
  const editsB = b.evaluate(async () => {
    const store = (await import('/src/stores/dossierStore.ts')).useDossierStore;
    const all = store.getState().elements.map((e) => e.id);
    // Deletions, one by one and in bulk
    for (let i = 0; i < 10; i++) await store.getState().deleteElements([all[500 + i]]);
    await store.getState().deleteElements(all.slice(600, 700));
    // Renames on other elements
    for (let i = 0; i < 20; i++) await store.getState().updateElement(all[200 + i], { label: `B-renamed-${i}` });
    // A paste of 50 copies
    const src = store.getState().elements.slice(0, 50);
    store.getState().pasteElements(src.map((el, i) => ({
      ...el, id: crypto.randomUUID(), label: `B-paste-${i}`, position: { x: el.position.x, y: el.position.y + 50000 },
    })), []);
  });
  await Promise.all([editsA, editsB]);

  // ── A deletes 100 through the UI, then undoes it ─────────────────────────
  await a.evaluate(async () => {
    const d = (await import('/src/stores/dossierStore.ts')).useDossierStore.getState();
    (await import('/src/stores/selectionStore.ts')).useSelectionStore.getState()
      .selectElements(d.elements.slice(800, 900).map((e) => e.id));
  });
  await a.keyboard.press('Delete');
  await a.waitForTimeout(1000);
  await a.keyboard.press('Control+z');

  // ── Same state everywhere ───────────────────────────────────────────────
  const expected = ELEMENTS + 20 - 110 + 50;
  await expect.poll(async () => (await fingerprint(a)).elements.length, { timeout: 60_000 }).toBe(expected);
  await expect.poll(async () => JSON.stringify(await fingerprint(b)) === JSON.stringify(await fingerprint(a)),
    { timeout: 30_000 }).toBe(true);
  const final = await fingerprint(a);
  // Sanity: the edits really happened
  expect(final.elements.length).toBe(expected);
  expect(final.elements.filter((e) => e.includes('|A-renamed-')).length).toBe(20);
  expect(final.elements.filter((e) => e.includes('|B-renamed-')).length).toBe(20);
  expect(final.tabs.length).toBe(2);

  // Dexie copies follow the store (incremental sync, 500 ms safety re-sync)
  for (const page of [a, b]) {
    await expect.poll(async () => {
      const c = await dexieCounts(page);
      return c.dexie.elements === c.store.elements && c.dexie.links === c.store.links;
    }, { timeout: 15_000 }).toBe(true);
  }

  // ── B reloads: same state on both sides, nothing left pending ───────────
  // Edits B makes while reconnecting must reach A too. They used to stay
  // blocked there, waiting on writes B made before connecting, which nobody
  // asked for (an emptied tab on A).
  await b.reload();
  await waitForAppLoad(b).catch(() => {});
  await b.waitForSelector('.react-flow__node', { timeout: 120_000 });
  const content = (f: Awaited<ReturnType<typeof fingerprint>>) => JSON.stringify({ elements: f.elements, links: f.links });
  await expect.poll(async () => content(await fingerprint(b)) === content(final), { timeout: 60_000 }).toBe(true);
  await expect.poll(async () => JSON.stringify(await fingerprint(b)) === JSON.stringify(await fingerprint(a)),
    { timeout: 30_000 }).toBe(true);
  for (const page of [a, b]) {
    const pending = await page.evaluate(async () => {
      const { syncService } = await import('/src/services/syncService.ts');
      const ydoc = syncService.getYDoc() as unknown as { store: { pendingStructs: unknown; pendingDs: unknown } };
      return ydoc.store.pendingStructs !== null || ydoc.store.pendingDs !== null;
    });
    expect(pending).toBe(false);
  }
});
