import { test, expect, type Browser, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { connect } from 'node:net';
import { setupCleanEnvironment, createTestDossier, createElementOnCanvas, waitForAppLoad } from './fixtures/test-utils';

/**
 * Read-only sharing: a shared dossier gets one link and a write code. A
 * computer joined with the code writes as before; one joined without it
 * sees every change and can change nothing, even by writing into
 * the shared document behind the app's back (the relay drops its changes,
 * relay/access.js). Dev server only: reads the stores through Vite's URLs.
 */

const RELAY_PORT = Number(process.env.READONLY_RELAY_PORT ?? 4471);
const SERVER = `ws://localhost:${RELAY_PORT}`;
let relay: ChildProcess;

test.describe.configure({ mode: 'serial' });
test.skip(({ browserName }) => browserName !== 'chromium', 'one browser is enough for the protocol');

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

async function labels(page: Page): Promise<string[]> {
  await page.bringToFront();
  await page.waitForTimeout(100);
  return page.evaluate(async () => (await import('/src/stores/dossierStore.ts')).useDossierStore.getState().elements.map((e) => e.label));
}

async function join(browser: Browser, url: string, code?: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto(url);
  // A fresh browser has no server yet: accept the one from the link
  await page.getByRole('button', { name: /^(save|enregistrer)$/i }).click({ timeout: 30_000 });
  if (code) {
    const field = page.getByLabel(/^(write code|code d'écriture)$/i);
    // A wrong code: refused, the page stays
    await field.fill(code === '000000' ? '111111' : '000000');
    await page.getByRole('button', { name: /^(join|rejoindre)$/i }).click();
    await expect(page.getByText(/^(wrong code|code incorrect)$/i)).toBeVisible({ timeout: 10_000 });
    await field.fill(code);
  }
  await page.getByRole('button', { name: /^(join|rejoindre)$/i }).click({ timeout: 30_000 });
  const disclaimer = page.locator('[data-testid="disclaimer-accept"]');
  if (await disclaimer.isVisible({ timeout: 2000 }).catch(() => false)) await disclaimer.click();
  await page.waitForSelector('[data-testid="canvas"]', { timeout: 30_000 });
  return page;
}

async function create(page: Page, label: string): Promise<string> {
  await page.bringToFront();
  return page.evaluate(async (label) => {
    const { useDossierStore } = await import('/src/stores/dossierStore.ts');
    try {
      await useDossierStore.getState().createElement(label, { x: 50, y: 50 });
      return 'created';
    } catch (err) {
      return (err as Error).name;
    }
  }, label);
}

test('without the write code a computer sees everything and changes nothing; with it, writes both ways', async ({ browser }) => {
  test.setTimeout(4 * 60 * 1000);

  // The author shares: a link and a write code
  const owner = await (await browser.newContext()).newPage();
  await setupCleanEnvironment(owner);
  await owner.evaluate((url) => localStorage.setItem('zeroneurone-signaling-server', url), SERVER);
  await owner.reload();
  await waitForAppLoad(owner);
  await createTestDossier(owner, 'Lecture seule');
  await createElementOnCanvas(owner, 400, 300);
  await owner.getByRole('button', { name: /^(share|partager)$/i }).first().click();
  const dialog = owner.getByRole('dialog');
  await dialog.getByRole('button', { name: /^(share|partager)$/i }).click();
  // One link, read-only without the write code
  const linkInput = dialog.getByRole('textbox', { name: /^(share link|lien de partage)$/i });
  const codeInput = dialog.getByRole('textbox', { name: /^(write code|code d'écriture)$/i });
  await expect(linkInput).toHaveValue(/\/join\/w1-.*#.*wlock=/, { timeout: 20_000 });
  await expect(codeInput).toHaveValue(/^\d{6}$/, { timeout: 20_000 });
  const url = await linkInput.inputValue();
  const code = await codeInput.inputValue();
  expect(url).not.toContain('wseed=');
  await owner.keyboard.press('Escape');
  const initial = await labels(owner);
  expect(initial).toHaveLength(1);

  // A second computer with the code, a third without
  const writer = await join(browser, url, code);
  const reader = await join(browser, url);
  await expect.poll(() => labels(writer), { timeout: 30_000 }).toEqual(initial);
  await expect.poll(() => labels(reader), { timeout: 30_000 }).toEqual(initial);
  await expect(reader.getByTestId('read-only-link-banner')).toBeVisible();
  await expect(writer.getByTestId('read-only-link-banner')).toHaveCount(0);
  // The reader shows up, marked as such, for the others and for itself
  await owner.bringToFront();
  await expect(owner.locator('[data-reader="true"]')).toHaveCount(1, { timeout: 30_000 });
  await expect(reader.locator('[data-reader="true"]')).toHaveCount(1);

  // Author and code holder write both ways
  expect(await create(owner, 'Par l\'auteur')).toBe('created');
  expect(await create(writer, 'Par le second')).toBe('created');
  await expect.poll(async () => (await labels(writer)).sort(), { timeout: 30_000 }).toContain('Par l\'auteur');
  await expect.poll(async () => (await labels(owner)).sort(), { timeout: 30_000 }).toContain('Par le second');
  await expect.poll(async () => (await labels(reader)).length, { timeout: 30_000 }).toBe(3);

  // The reader's app refuses changes
  expect(await create(reader, 'Par le lecteur')).toBe('DossierLockedError');

  // Written into the shared document behind the app's back: goes nowhere
  await reader.bringToFront();
  await reader.evaluate(async () => {
    const { syncService } = await import('/src/services/syncService.ts');
    syncService.getYDoc()!.getMap('meta').set('forgedByReader', 'yes');
  });
  // The same write with the code does arrive: had the reader's got through, it would be seen
  await writer.bringToFront();
  await writer.evaluate(async () => {
    const { syncService } = await import('/src/services/syncService.ts');
    syncService.getYDoc()!.getMap('meta').set('writtenByWriter', 'yes');
  });
  await expect.poll(async () => {
    await owner.bringToFront();
    return owner.evaluate(async () => {
      const { syncService } = await import('/src/services/syncService.ts');
      return syncService.getYDoc()!.getMap('meta').get('writtenByWriter') ?? null;
    });
  }, { timeout: 30_000 }).toBe('yes');
  // Something the author writes afterwards still arrives: the reader is connected
  expect(await create(owner, 'Après la tentative')).toBe('created');
  await expect.poll(async () => labels(reader), { timeout: 30_000 }).toContain('Après la tentative');
  await expect.poll(async () => labels(writer), { timeout: 30_000 }).toContain('Après la tentative');
  for (const page of [owner, writer]) {
    await page.bringToFront();
    expect(await page.evaluate(async () => {
      const { syncService } = await import('/src/services/syncService.ts');
      return syncService.getYDoc()!.getMap('meta').get('forgedByReader') ?? null;
    })).toBeNull();
  }

  // Reopened later, the reader is still read-only (kept with the dossier)
  await reader.reload();
  await reader.waitForSelector('[data-testid="canvas"]', { timeout: 30_000 });
  await expect(reader.getByTestId('read-only-link-banner')).toBeVisible({ timeout: 30_000 });
  expect(await create(reader, 'Après rechargement')).toBe('DossierLockedError');

  for (const page of [owner, writer, reader]) await page.context().close();
});
