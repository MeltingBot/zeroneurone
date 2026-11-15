import { test, expect, type Browser, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { connect } from 'node:net';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join as joinPath } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { setupCleanEnvironment, createTestDossier, createElementOnCanvas, waitForAppLoad } from './fixtures/test-utils';

/**
 * HTTP fallback (src/services/sseSocket.ts, relay/sse.js): on a network that
 * blocks WebSocket (here a relay refusing every handshake, a test-only
 * setting), computers switch to the fallback on their own, show it on the
 * connection icon, and collaborate as before: changes both ways, files.
 * Dev server only: reads the stores through Vite's URLs.
 */

const RELAY_PORT = Number(process.env.SSE_RELAY_PORT ?? 4472);
const SERVER = `ws://localhost:${RELAY_PORT}`;
let relay: ChildProcess;

test.describe.configure({ mode: 'serial' });
test.skip(({ browserName }) => browserName !== 'chromium', 'one browser is enough for the protocol');

test.beforeAll(async () => {
  relay = spawn('node', ['relay/index.js'], {
    stdio: 'ignore',
    env: { ...process.env, PORT: String(RELAY_PORT), RELAY_TEST_REFUSE_WS: '1' },
  });
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

async function labels(page: Page): Promise<string[]> {
  await page.bringToFront();
  await page.waitForTimeout(100);
  return page.evaluate(async () => (await import('/src/stores/dossierStore.ts')).useDossierStore.getState().elements.map((e) => e.label));
}

async function transport(page: Page): Promise<{ transport: string; connected: boolean }> {
  await page.bringToFront();
  return page.evaluate(async () => {
    const { syncService } = await import('/src/services/syncService.ts');
    const { transport, connected } = syncService.getState();
    return { transport, connected };
  });
}

async function create(page: Page, label: string): Promise<void> {
  await page.bringToFront();
  await page.evaluate(async (label) => {
    const { useDossierStore } = await import('/src/stores/dossierStore.ts');
    await useDossierStore.getState().createElement(label, { x: 50, y: 50 });
  }, label);
}

async function join(browser: Browser, url: string, code: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto(url);
  await page.getByRole('button', { name: /^(save|enregistrer)$/i }).click({ timeout: 30_000 });
  await page.getByLabel(/^(write code|code d'écriture)$/i).fill(code);
  await page.getByRole('button', { name: /^(join|rejoindre)$/i }).click({ timeout: 30_000 });
  const disclaimer = page.locator('[data-testid="disclaimer-accept"]');
  if (await disclaimer.isVisible({ timeout: 2000 }).catch(() => false)) await disclaimer.click();
  await page.waitForSelector('[data-testid="canvas"]', { timeout: 30_000 });
  return page;
}

test('WebSocket blocked: both computers switch to HTTP and collaborate, files included', async ({ browser }) => {
  test.setTimeout(4 * 60 * 1000);

  const owner = await (await browser.newContext()).newPage();
  await setupCleanEnvironment(owner);
  await owner.evaluate((url) => localStorage.setItem('zeroneurone-signaling-server', url), SERVER);
  await owner.reload();
  await waitForAppLoad(owner);
  await createTestDossier(owner, 'Repli HTTP');
  await createElementOnCanvas(owner, 400, 300);
  const content = randomBytes(200_000);
  const file = joinPath(mkdtempSync(joinPath(tmpdir(), 'zn-sse-')), 'piece.mp3');
  writeFileSync(file, content);
  await owner.getByRole('button', { name: /files|fichiers/i }).first().click();
  await owner.locator('label').filter({ hasText: /(browse|parcourir)$/i }).locator('input[type="file"]').setInputFiles(file);
  await expect(owner.getByText('piece.mp3').first()).toBeVisible({ timeout: 20_000 });

  await owner.getByRole('button', { name: /^(share|partager)$/i }).first().click();
  const dialog = owner.getByRole('dialog');
  await dialog.getByRole('button', { name: /^(share|partager)$/i }).click();
  const linkInput = dialog.getByRole('textbox', { name: /^(share link|lien de partage)$/i });
  const codeInput = dialog.getByRole('textbox', { name: /^(write code|code d'écriture)$/i });
  await expect(linkInput).toHaveValue(/\/join\//, { timeout: 20_000 });
  await expect(codeInput).toHaveValue(/^\d{6}$/, { timeout: 20_000 });
  const url = await linkInput.inputValue();
  const code = await codeInput.inputValue();
  await owner.keyboard.press('Escape');

  // WebSocket refused: after ~10 s the owner is connected over HTTP
  await expect.poll(() => transport(owner), { timeout: 40_000 }).toEqual({ transport: 'sse', connected: true });
  await expect(owner.getByTitle(/^(connected over http|connecté par http)/i)).toBeVisible();
  // Remembered for this relay
  expect(await owner.evaluate((server) => localStorage.getItem(`zn-collab-transport:${server}`), SERVER)).toContain('sse');

  // The second computer finds the same way, then gets the dossier and the file
  const peer = await join(browser, url, code);
  await expect.poll(() => transport(peer), { timeout: 40_000 }).toEqual({ transport: 'sse', connected: true });
  await expect.poll(() => labels(peer), { timeout: 30_000 }).toEqual(await labels(owner));
  await peer.bringToFront();
  await expect(peer.locator('.react-flow__node')).toHaveCount(1, { timeout: 30_000 });
  await peer.locator('.react-flow__node').first().click();
  await peer.getByRole('button', { name: /files|fichiers/i }).first().click();
  await expect(peer.getByText('piece.mp3').first()).toBeVisible({ timeout: 60_000 });
  await expect.poll(async () => {
    await peer.bringToFront();
    return peer.evaluate(async () => {
      const req = indexedDB.open('zeroneurone');
      const db = await new Promise<IDBDatabase>((r) => { req.onsuccess = () => r(req.result); });
      const assets = await new Promise<{ hash: string }[]>((r) => {
        const g = db.transaction('assets').objectStore('assets').getAll();
        g.onsuccess = () => r(g.result);
      });
      return assets.map((a) => a.hash);
    });
  }, { timeout: 60_000 }).toContain(createHash('sha256').update(content).digest('hex'));

  // Changes both ways
  await create(owner, 'Par l\'auteur');
  await create(peer, 'Par le second');
  await expect.poll(() => labels(peer), { timeout: 30_000 }).toContain('Par l\'auteur');
  await expect.poll(() => labels(owner), { timeout: 30_000 }).toContain('Par le second');

  // Reopened: straight to HTTP, no WebSocket wait
  await peer.reload();
  await peer.waitForSelector('[data-testid="canvas"]', { timeout: 30_000 });
  await expect.poll(() => transport(peer), { timeout: 8_000 }).toEqual({ transport: 'sse', connected: true });

  for (const page of [owner, peer]) await page.context().close();
});
