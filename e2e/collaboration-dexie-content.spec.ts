import { test, expect, type Browser, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { connect } from 'node:net';
import { setupCleanEnvironment } from './fixtures/test-utils';
import { buildLargeDossierJson } from './fixtures/large-dossier';

/**
 * What a collaborator changes must reach the local IndexedDB copy, not only
 * its row count: plugins (api.repositories, MarkNeurone), the import merge and
 * the card statistics read that copy. Dev server only.
 */

const RELAY_PORT = Number(process.env.COLLAB_RELAY_PORT ?? 4460);
const SERVER = `ws://localhost:${RELAY_PORT}`;
let relay: ChildProcess;

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

async function newPeer(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  await context.addInitScript((server) => localStorage.setItem('zeroneurone-signaling-server', server), SERVER);
  const page = await context.newPage();
  await setupCleanEnvironment(page);
  return page;
}

/** Fields compared between the store and the IndexedDB copy */
async function storeVsDexie(page: Page) {
  return page.evaluate(async () => {
    const d = (await import('/src/stores/dossierStore.ts')).useDossierStore.getState();
    const { db } = await import('/src/db/database.ts');
    const dossierId = d.currentDossier!.id;
    const el = (e: { id: string; label: string; notes: string; visual: { color: string; shape: string }; position: { x: number; y: number }; tags: string[] }) =>
      `${e.id}|${e.label}|${e.notes}|${e.visual?.color}|${e.visual?.shape}|${Math.round(e.position.x)},${Math.round(e.position.y)}|${[...(e.tags ?? [])].join(',')}`;
    const lk = (l: { id: string; label: string; visual: { color: string } }) => `${l.id}|${l.label}|${l.visual?.color}`;
    const dexieEls = await db.elements.where({ dossierId }).toArray();
    const dexieLinks = await db.links.where({ dossierId }).toArray();
    const sort = (a: string[]) => a.sort();
    const store = { elements: sort(d.elements.map(el as never)), links: sort(d.links.map(lk as never)) };
    const dexie = { elements: sort(dexieEls.map(el as never)), links: sort(dexieLinks.map(lk as never)) };
    return {
      store, dexie,
      differentElements: store.elements.filter((x) => !dexie.elements.includes(x)),
      differentLinks: store.links.filter((x) => !dexie.links.includes(x)),
    };
  });
}

test('changes received from a collaborator reach the local IndexedDB copy', async ({ browser }) => {
  test.setTimeout(4 * 60 * 1000);

  const a = await newPeer(browser);
  const file = join(mkdtempSync(join(tmpdir(), 'zn-collab-')), 'collab.json');
  writeFileSync(file, buildLargeDossierJson(60));
  await a.click('[data-testid="import-button"]');
  await a.setInputFiles('input[type="file"]', file);
  await a.waitForSelector('.react-flow__node', { timeout: 60_000 });
  await a.waitForTimeout(2000);
  const { shareUrl } = await a.evaluate(async () =>
    (await import('/src/stores/syncStore.ts')).useSyncStore.getState().share('Collab'));

  const b = await newPeer(browser);
  await b.goto(shareUrl);
  await b.getByRole('button', { name: 'Join', exact: true }).click();
  await b.waitForSelector('.react-flow__node', { timeout: 60_000 });
  await expect.poll(async () => (await storeVsDexie(b)).store.elements.length, { timeout: 60_000 }).toBe(60);

  // A edits content without changing any count
  await a.evaluate(async () => {
    const store = (await import('/src/stores/dossierStore.ts')).useDossierStore;
    const s = store.getState();
    const els = s.elements;
    for (let i = 0; i < 5; i++) await s.updateElement(els[i].id, { label: `renommé-${i}`, notes: `note-${i}` });
    await s.updateElements(els.slice(5, 10).map((e) => e.id), { visual: { color: '#123456' } });
    await s.updateElement(els[10].id, { tags: ['tag-distant'] });
    await s.updateElementPositions(els.slice(11, 14).map((e, i) => ({ id: e.id, position: { x: 9000 + i, y: 9000 } })));
    const links = s.links;
    await s.updateLink(links[0].id, { label: 'lien-renommé' });
    await s.updateLinks(links.slice(1, 3).map((l) => l.id), { visual: { color: '#654321' } });
  });

  // B shows the changes in memory…
  await expect.poll(async () => (await storeVsDexie(b)).store.elements.filter((x) => x.includes('|renommé-')).length,
    { timeout: 30_000 }).toBe(5);
  // …and its IndexedDB copy has them too
  await expect.poll(async () => {
    const r = await storeVsDexie(b);
    return { elements: r.differentElements, links: r.differentLinks };
  }, { timeout: 15_000 }).toEqual({ elements: [], links: [] });
});
