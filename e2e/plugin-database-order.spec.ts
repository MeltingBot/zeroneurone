import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';

/**
 * In a fresh Chromium profile, a database created before ZeroNeurone's slows
 * every later write to it about 2.5 times, for good (measured: undoing the
 * deletion of 300 elements out of 2000 went from 0.45 s to 1.15 s when a
 * plugin created its database first). Plugins create theirs while
 * registering, so the app creates its own before loading them.
 */
const PLUGIN = `
export async function register() {
  const names = (await indexedDB.databases()).map((d) => d.name);
  globalThis.__znExistedAtRegister = names.includes('zeroneurone');
  await new Promise((resolve) => {
    const req = indexedDB.open('zz-plugin-db', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('rows');
    req.onsuccess = () => { req.result.close(); resolve(); };
    req.onerror = () => resolve();
  });
}
`;

test('the app database exists before plugins register, in a fresh profile', async ({ page }) => {
  const manifest = {
    manifestVersion: '2',
    plugins: [{
      id: 'db-order-probe',
      file: 'db-order-probe.js',
      name: 'Probe',
      integrity: createHash('sha256').update(PLUGIN).digest('hex'),
    }],
  };
  await page.route('**/plugins/manifest.json', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(manifest) }));
  await page.route('**/plugins/db-order-probe.js', (route) =>
    route.fulfill({ status: 200, contentType: 'text/javascript', body: PLUGIN }));

  await page.goto('/');
  await expect.poll(() => page.evaluate(() => (globalThis as { __znExistedAtRegister?: boolean }).__znExistedAtRegister))
    .toBe(true);

  // Created by Dexie with its full schema, not as an empty shell
  const stores = await page.evaluate(() => new Promise<string[]>((resolve) => {
    const req = indexedDB.open('zeroneurone');
    req.onsuccess = () => { const names = [...req.result.objectStoreNames]; req.result.close(); resolve(names); };
    req.onerror = () => resolve([]);
  }));
  expect(stores).toContain('dossiers');
  expect(stores).toContain('_encryptionMeta');
});
