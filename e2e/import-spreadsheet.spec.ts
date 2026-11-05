import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setupCleanEnvironment, createTestDossier } from './fixtures/test-utils';

/**
 * A workbook (XLSX, ODS) is imported as the CSV of the sheet the user picks:
 * same path as a CSV (column mapping when the columns are not native).
 * Fixtures: src/utils/__fixtures__/spreadsheet (sheets Personnes, Vide, Liens, Formats).
 */
const fixture = (name: string) => ({
  name: name.replace(/^(openpyxl|libreoffice)/, 'Enquête'),
  mimeType: 'application/octet-stream',
  buffer: readFileSync(fileURLToPath(new URL(`../src/utils/__fixtures__/spreadsheet/${name}`, import.meta.url))),
});

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

/** Import a workbook from the home page and pick a sheet; `mapping`: its columns are not native */
async function importAndPick(page: Page, file: string, sheet: string, mapping: boolean) {
  await setupCleanEnvironment(page);
  await page.click('[data-testid="import-button"]');
  await page.locator('[data-testid="import-file-input"]').setInputFiles(fixture(file));
  const picker = page.getByTestId('sheet-picker');
  await expect(picker).toBeVisible();
  // The empty sheet is not offered
  await expect(picker.getByRole('button', { name: /Vide/ })).toHaveCount(0);
  await picker.getByRole('button', { name: new RegExp(`^${sheet}`) }).click();
  if (!mapping) return;
  const modal = page.locator('[data-testid="json-mapping-modal"]');
  await expect(modal).toBeVisible({ timeout: 15000 });
  await modal.locator('[data-testid="json-mapping-import"]').click();
  await expect(modal).toBeHidden();
  await page.locator('.react-flow__pane').click({ position: { x: 400, y: 300 } });
}

type Stored = { label: string; properties: { key: string; value: unknown }[] };

test('an XLSX sheet with native columns is imported as a native CSV, text cells kept as typed', async ({ page }) => {
  // A "label" column: imported at once, no column mapping
  await importAndPick(page, 'openpyxl.xlsx', 'Personnes', false);
  await expect(page.locator('.react-flow__node')).toHaveCount(2, { timeout: 10000 });
  const els = await readStore<Stored>(page, 'elements');
  expect(els.map((e) => e.label).sort()).toEqual(['Jean Dupont', 'Marie Martin']);
  const jean = els.find((e) => e.label === 'Jean Dupont')!;
  expect(jean.properties.find((p) => p.key === 'Téléphone')?.value).toBe('0601020304');
  // The dossier is named after the workbook and the sheet
  const dossiers = await readStore<{ name: string }>(page, 'dossiers');
  expect(dossiers.map((d) => d.name)).toEqual(['Enquête - Personnes']);
});

test('an ODS sheet keeps what its formats show (postcode, phone)', async ({ page }) => {
  // No native column: the dossier opens on the column mapping
  await importAndPick(page, 'libreoffice.ods', 'Formats', true);
  await expect(page.locator('.react-flow__node')).toHaveCount(1, { timeout: 10000 });
  const [el] = await readStore<Stored>(page, 'elements');
  const values = [el.label, ...el.properties.map((p) => String(p.value))];
  expect(values).toContain('01000');
  expect(values).toContain('06 12 34 56 78');
});

test('cancelling the sheet choice creates nothing', async ({ page }) => {
  await setupCleanEnvironment(page);
  await page.click('[data-testid="import-button"]');
  await page.locator('[data-testid="import-file-input"]').setInputFiles(fixture('libreoffice.xlsx'));
  const picker = page.getByTestId('sheet-picker');
  await expect(picker).toBeVisible();
  await picker.getByRole('button', { name: /Annuler|Cancel/ }).last().click();
  await expect(picker).toBeHidden();
  await expect(page.locator('[data-testid="import-modal"]')).toBeVisible();
  expect(await readStore(page, 'dossiers')).toEqual([]);
});

test('into the open dossier: the sheet picked opens the column mapping', async ({ page }) => {
  await setupCleanEnvironment(page);
  await createTestDossier(page, 'Dossier ouvert');
  await page.getByTitle(/^(Import|Importer)/).first().click();
  await page.locator('input[type="file"]').first().setInputFiles(fixture('openpyxl.xlsx'));
  const picker = page.getByTestId('sheet-picker');
  await picker.getByRole('button', { name: /^Liens/ }).click();
  // "type" holds no native value: column mapping, on the CSV of that sheet
  const modal = page.locator('[data-testid="json-mapping-modal"]');
  await expect(modal).toBeVisible({ timeout: 15000 });
  await expect(modal.locator('textarea').first()).toHaveValue('from,to,type\nJean Dupont,Marie Martin,Appel');
  // The sheet names the source of what the import creates
  await expect(modal.locator('input[value="Enquête - Liens.csv"]')).toHaveCount(1);
});
