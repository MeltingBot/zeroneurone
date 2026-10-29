import { test, expect, type Page } from '@playwright/test';
import { setupCleanEnvironment, createTestDossier, createElementOnCanvas } from './fixtures/test-utils';

// A phone bill: one row per call. Each row becomes an event of the caller
// and of the called number (a pivot), linked once per pair; a number that
// both calls and is called is one element.
const FADETTE = [
  'appelant;appele;date;duree;lat;lng',
  '0601010101;0602020202;14/03/2020 08:30;42;48.85;2.35',
  '0601010101;0602020202;14/03/2020 09:10;12;48.86;2.34',
  '0601010101;0603030303;15/03/2020 18:05;300;45.76;4.83',
  '0601010101;0603030303;pas de date;5;45.76;4.83',
  '0602020202;0601010101;16/03/2020 11:00;60;48.85;2.35',
].join('\n');

/** Rows of a store of the app's IndexedDB */
async function readStore<T>(page: Page, store: string): Promise<T[]> {
  return page.evaluate((name) => new Promise<T[]>((resolve, reject) => {
    const req = indexedDB.open('zeroneurone');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const all = req.result.transaction(name, 'readonly').objectStore(name).getAll();
      all.onsuccess = () => resolve(all.result as T[]);
      all.onerror = () => reject(all.error);
    };
  }), store);
}

test('CSV without native columns opens the mapping; rows become events and pivots', async ({ page }) => {
  await setupCleanEnvironment(page);

  await page.click('[data-testid="import-button"]');
  await expect(page.locator('[data-testid="import-modal"]')).toBeVisible();
  await page.locator('[data-testid="import-file-input"]').setInputFiles({
    name: 'fadette.csv', mimeType: 'text/csv', buffer: Buffer.from(FADETTE, 'utf-8'),
  });

  // The dossier is created and opens on the mapping assistant
  const modal = page.locator('[data-testid="json-mapping-modal"]');
  await expect(modal).toBeVisible({ timeout: 15000 });

  await modal.locator('[data-testid="json-mapping-record-as"]').selectOption('event');
  await modal.locator('[data-testid="json-mapping-hostField"]').selectOption('appelant');
  await modal.locator('[data-testid="json-mapping-dateField"]').selectOption('date');
  await modal.locator('[data-testid="json-mapping-target-appele"]').selectOption('pivot');
  await modal.locator('[data-testid="json-mapping-import"]').click();

  // Placement: click on the canvas
  await expect(modal).toBeHidden();
  await page.locator('.react-flow__pane').click({ position: { x: 400, y: 300 } });
  await expect(page.locator('.react-flow__node')).toHaveCount(3, { timeout: 10000 });

  // The row without a date is skipped; calls between two numbers, either way, make one link
  await expect.poll(async () => {
    const els = await readStore<{ label: string; events?: unknown[] }>(page, 'elements');
    return els.map((e) => [e.label, e.events?.length ?? 0]).sort();
  }, { timeout: 10000 }).toEqual([['0601010101', 4], ['0602020202', 3], ['0603030303', 1]]);
  expect(await readStore(page, 'links')).toHaveLength(2);

  // The file name is the source of what the import created
  const els = await readStore<{ source: string; events?: { source?: string }[] }>(page, 'elements');
  expect(els.every((e) => e.source === 'fadette.csv')).toBe(true);
  expect(els.flatMap((e) => e.events ?? []).every((ev) => ev.source === 'fadette.csv')).toBe(true);
});

test('a CSV template applies to another file with the same columns', async ({ page }) => {
  await setupCleanEnvironment(page);
  const openMapping = async (name: string) => {
    await page.click('[data-testid="import-button"]');
    await page.locator('[data-testid="import-file-input"]').setInputFiles({
      name, mimeType: 'text/csv', buffer: Buffer.from(FADETTE, 'utf-8'),
    });
    const modal = page.locator('[data-testid="json-mapping-modal"]');
    await expect(modal).toBeVisible({ timeout: 15000 });
    return modal;
  };

  // Set up and save a template on a first file
  let modal = await openMapping('fadette-mars.csv');
  await modal.locator('[data-testid="json-mapping-record-as"]').selectOption('event');
  await modal.locator('[data-testid="json-mapping-hostField"]').selectOption('appele');
  await modal.locator('[data-testid="json-mapping-target-duree"]').selectOption('notes');
  await modal.locator('[data-testid="json-mapping-save-template"]').click();
  await modal.locator('[data-testid="json-mapping-template-name"]').fill('Fadette');
  await modal.locator('[data-testid="json-mapping-template-name"]').press('Enter');
  await expect(modal.locator('[data-testid="json-mapping-template"] option', { hasText: 'Fadette' })).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(modal).toBeHidden();
  // Nothing imported: back to the home page, the empty dossier deleted
  await expect(page.locator('[data-testid="landing-section"]')).toBeVisible({ timeout: 10000 });

  // A file with another name: the template restores every setting
  modal = await openMapping('fadette-avril.csv');
  const tplId = await modal.locator('[data-testid="json-mapping-template"] option', { hasText: 'Fadette' }).getAttribute('value');
  await modal.locator('[data-testid="json-mapping-template"]').selectOption(tplId!);
  await expect(modal.locator('[data-testid="json-mapping-record-as"]')).toHaveValue('event');
  await expect(modal.locator('[data-testid="json-mapping-hostField"]')).toHaveValue('appele');
  await expect(modal.locator('[data-testid="json-mapping-target-duree"]')).toHaveValue('notes');
});

test('the mapping opens from the home page, in a new dossier', async ({ page }) => {
  await setupCleanEnvironment(page);
  await page.click('[data-testid="import-button"]');
  await expect(page.locator('[data-testid="import-modal"]')).toBeVisible();
  await page.click('[data-testid="import-open-mapping"]');

  await expect(page).toHaveURL(/\/dossier\//);
  const modal = page.locator('[data-testid="json-mapping-modal"]');
  await expect(modal).toBeVisible({ timeout: 15000 });
  // Given up: the empty dossier made for it is deleted, back to the home page
  await page.keyboard.press('Escape');
  await expect(modal).toBeHidden();
  await expect(page.locator('[data-testid="landing-section"]')).toBeVisible({ timeout: 10000 });
  expect(await readStore(page, 'dossiers')).toHaveLength(0);
});

test('a CSV import cancelled at placement leaves no dossier', async ({ page }) => {
  await setupCleanEnvironment(page);
  await page.click('[data-testid="import-button"]');
  await page.locator('[data-testid="import-file-input"]').setInputFiles({
    name: 'fadette.csv', mimeType: 'text/csv', buffer: Buffer.from(FADETTE, 'utf-8'),
  });
  const modal = page.locator('[data-testid="json-mapping-modal"]');
  await expect(modal).toBeVisible({ timeout: 15000 });
  await modal.locator('[data-testid="json-mapping-import"]').click();
  await expect(modal).toBeHidden();
  // Placement cancelled
  await page.click('[data-testid="import-placement-cancel"]');
  await expect(page.locator('[data-testid="landing-section"]')).toBeVisible({ timeout: 10000 });
  expect(await readStore(page, 'dossiers')).toHaveLength(0);
});

test('a placement cancelled in an existing dossier leaves the dossier alone', async ({ page }) => {
  await setupCleanEnvironment(page);
  await createTestDossier(page, 'Existant');
  await createElementOnCanvas(page, 400, 300);
  await page.waitForTimeout(600);
  const before = await readStore<{ id: string }>(page, 'dossiers');
  expect(before).toHaveLength(1);

  // Paste-free route: the mapping of the open dossier, through its import modal
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('zn:json-mapping-paste', {
    detail: { text: JSON.stringify([{ nom: 'A', ville: 'Paris' }, { nom: 'B', ville: 'Lyon' }]) },
  })));
  const modal = page.locator('[data-testid="json-mapping-modal"]');
  await expect(modal).toBeVisible({ timeout: 10000 });
  await modal.locator('[data-testid="json-mapping-import"]').click();
  await expect(modal).toBeHidden();
  await page.click('[data-testid="import-placement-cancel"]');
  await expect(page.locator('[data-testid="import-placement-cancel"]')).toBeHidden();

  await expect(page).toHaveURL(/\/dossier\//);
  expect((await readStore<{ id: string }>(page, 'dossiers')).map((d) => d.id)).toEqual(before.map((d) => d.id));
  expect(await readStore(page, 'elements')).toHaveLength(1);
});
