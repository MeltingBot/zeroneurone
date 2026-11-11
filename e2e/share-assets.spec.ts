import { test, expect, type Page } from '@playwright/test';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { setupCleanEnvironment, createTestDossier, createElementOnCanvas, waitForAppLoad } from './fixtures/test-utils';
import { ydocStorage } from './fixtures/ydoc-storage';

/**
 * A local dossier keeps its files out of the Y.Doc; sharing it must send them,
 * or peers get the elements without their files. Shared, a file's bytes go to
 * the files document (filesSync.ts), its metadata to the main one. Needs a
 * real sync server (or a local relay: ZN_SYNC_SERVER=ws://localhost:4444):
 *   ZN_SYNC_SERVER=wss://sync.zeroneurone.com npx playwright test e2e/share-assets.spec.ts
 */
const SERVER = process.env.ZN_SYNC_SERVER;

async function useServer(page: Page) {
  await page.evaluate((url) => localStorage.setItem('zeroneurone-signaling-server', url), SERVER!);
  await page.reload();
  await waitForAppLoad(page);
}

test.describe('Sharing a dossier with files', () => {
  test.skip(!SERVER, 'ZN_SYNC_SERVER not set');
  test.describe.configure({ timeout: 180_000 });

  test('a peer joining receives the files of a dossier shared from local', async ({ browser }) => {
    const owner = await (await browser.newContext()).newPage();
    await setupCleanEnvironment(owner);
    await useServer(owner);
    await createTestDossier(owner, 'Partage fichiers');
    await createElementOnCanvas(owner, 400, 300);

    const content = randomBytes(300_000);
    const dir = mkdtempSync(join(tmpdir(), 'zn-share-'));
    const file = join(dir, 'piece.mp3');
    writeFileSync(file, content);
    await owner.setInputFiles('input[type="file"]', file);
    await owner.getByRole('button', { name: /files|fichiers/i }).first().click();
    await expect(owner.getByText('piece.mp3').first()).toBeVisible({ timeout: 20_000 });

    // Local: the file is not copied into the Y.Doc
    await owner.waitForTimeout(1500);
    expect((await ydocStorage(owner))[0].bytes).toBeLessThan(100_000);

    // Share: the file goes to the files document for peers; the main one
    // only gets its metadata and thumbnail (the phone reads only that one)
    await owner.getByRole('button', { name: /^(share|partager)$/i }).first().click();
    const dialog = owner.getByRole('dialog');
    await dialog.getByRole('button', { name: /^(share|partager)$/i }).click();
    const urlInput = dialog.locator('input[readonly]').first();
    await expect(urlInput).toHaveValue(/\/join\//, { timeout: 20_000 });
    const shareUrl = await urlInput.inputValue();
    await expect.poll(async () => (await ydocStorage(owner, 'zeroneurone-files-'))[0]?.bytes ?? 0, { timeout: 30_000 })
      .toBeGreaterThan(300_000);
    expect((await ydocStorage(owner))[0].bytes).toBeLessThan(100_000);

    // The peer joins and gets the file
    const peer = await (await browser.newContext()).newPage();
    await peer.goto(shareUrl);
    // A fresh browser has no server yet: accept the one from the link
    await peer.getByRole('button', { name: /^(save|enregistrer)$/i }).click({ timeout: 30_000 });
    await peer.getByRole('button', { name: /^(join|rejoindre)$/i }).click({ timeout: 30_000 });
    const disclaimer = peer.locator('[data-testid="disclaimer-accept"]');
    if (await disclaimer.isVisible({ timeout: 2000 }).catch(() => false)) await disclaimer.click();
    await peer.waitForSelector('[data-testid="canvas"]', { timeout: 30_000 });
    await expect(peer.locator('.react-flow__node')).toHaveCount(1, { timeout: 30_000 });
    await peer.locator('.react-flow__node').first().click();
    await peer.getByRole('button', { name: /files|fichiers/i }).first().click();
    await expect(peer.getByText('piece.mp3').first()).toBeVisible({ timeout: 60_000 });

    // Same bytes on the peer's side
    const peerHash = await peer.evaluate(async () => {
      const req = indexedDB.open('zeroneurone');
      const db = await new Promise<IDBDatabase>((r) => { req.onsuccess = () => r(req.result); });
      const assets = await new Promise<{ hash: string }[]>((r) => {
        const g = db.transaction('assets').objectStore('assets').getAll();
        g.onsuccess = () => r(g.result);
      });
      return assets.map((a) => a.hash);
    });
    const { createHash } = await import('node:crypto');
    expect(peerHash).toContain(createHash('sha256').update(content).digest('hex'));

    await owner.context().close();
    await peer.context().close();
  });

  test('a file added while the other computer is off reaches it when it comes back', async ({ browser }) => {
    const owner = await (await browser.newContext()).newPage();
    await setupCleanEnvironment(owner);
    await useServer(owner);
    await createTestDossier(owner, 'Différé');
    await createElementOnCanvas(owner, 400, 300);
    await owner.getByRole('button', { name: /^(share|partager)$/i }).first().click();
    const dialog = owner.getByRole('dialog');
    await dialog.getByRole('checkbox').first().check();
    await dialog.getByRole('button', { name: /^(share|partager)$/i }).click();
    const urlInput = dialog.locator('input[readonly]').first();
    await expect(urlInput).toHaveValue(/async=1/, { timeout: 20_000 });
    const shareUrl = await urlInput.inputValue();
    const dossierId = new URLSearchParams(new URL(shareUrl).hash.slice(1)).get('id');
    await owner.keyboard.press('Escape');

    // The other computer joins, then is switched off
    const peerContext = await browser.newContext();
    const peer = await peerContext.newPage();
    await peer.goto(shareUrl);
    await peer.getByRole('button', { name: /^(save|enregistrer)$/i }).click({ timeout: 30_000 });
    await peer.getByRole('button', { name: /^(join|rejoindre)$/i }).click({ timeout: 30_000 });
    const disclaimer = peer.locator('[data-testid="disclaimer-accept"]');
    if (await disclaimer.isVisible({ timeout: 2000 }).catch(() => false)) await disclaimer.click();
    await expect(peer.locator('.react-flow__node')).toHaveCount(1, { timeout: 30_000 });
    await peer.close({ runBeforeUnload: true });

    // A file added meanwhile; then this computer goes too
    const content = randomBytes(400_000);
    const file = join(mkdtempSync(join(tmpdir(), 'zn-share-')), 'releve.pdf');
    writeFileSync(file, content);
    await owner.locator('.react-flow__node').first().click();
    await owner.setInputFiles('input[type="file"]', file);
    await expect.poll(async () => (await ydocStorage(owner, 'zeroneurone-files-'))[0]?.bytes ?? 0, { timeout: 30_000 })
      .toBeGreaterThan(400_000);
    await owner.waitForTimeout(2000);
    await owner.context().close();

    // The other computer comes back alone: the relay's buffer brings the file
    const back = await peerContext.newPage();
    await back.goto(`/dossier/${dossierId}`);
    await expect(back.locator('.react-flow__node')).toHaveCount(1, { timeout: 30_000 });
    await expect.poll(async () => back.evaluate(async () => {
      const req = indexedDB.open('zeroneurone');
      const db = await new Promise<IDBDatabase>((r) => { req.onsuccess = () => r(req.result); });
      const assets = await new Promise<{ hash: string }[]>((r) => {
        const g = db.transaction('assets').objectStore('assets').getAll();
        g.onsuccess = () => r(g.result);
      });
      db.close();
      return assets.map((a) => a.hash);
    }), { timeout: 60_000 }).toContain((await import('node:crypto')).createHash('sha256').update(content).digest('hex'));
    await peerContext.close();
  });
});
