import { test, expect, type Page } from '@playwright/test';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { setupCleanEnvironment, createTestDossier, createElementOnCanvas, waitForAppLoad } from './fixtures/test-utils';
import { ydocStorage } from './fixtures/ydoc-storage';

/**
 * A local dossier keeps its files out of the Y.Doc; sharing it must send them,
 * or peers get the elements without their files. Needs a real sync server:
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

    // Share: the file goes into the Y.Doc for peers
    await owner.getByRole('button', { name: /^(share|partager)$/i }).first().click();
    const dialog = owner.getByRole('dialog');
    await dialog.getByRole('button', { name: /^(share|partager)$/i }).click();
    const urlInput = dialog.locator('input[readonly]');
    await expect(urlInput).toHaveValue(/\/join\//, { timeout: 20_000 });
    const shareUrl = await urlInput.inputValue();
    await expect.poll(async () => (await ydocStorage(owner))[0].bytes, { timeout: 30_000 })
      .toBeGreaterThan(300_000);

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
});
