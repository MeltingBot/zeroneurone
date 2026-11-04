import { test, expect, type Page } from '@playwright/test';
import { writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setupCleanEnvironment, waitForAppLoad } from './fixtures/test-utils';
import { buildLargeDossierJson } from './fixtures/large-dossier';

/** A small dossier whose first element has a multi-line source and a location */
async function openDossier(page: Page) {
  await setupCleanEnvironment(page);
  await waitForAppLoad(page);
  const data = JSON.parse(buildLargeDossierJson(6));
  data.elements[0].source = 'https://a.example/1\nhttps://b.example/2';
  data.elements[0].geo = { type: 'point', lat: 48.85, lng: 2.35 };
  const file = join(mkdtempSync(join(tmpdir(), 'zn-')), 'small.json');
  writeFileSync(file, JSON.stringify(data));
  await page.click('[data-testid="import-button"]');
  await page.setInputFiles('input[type="file"]', file);
  await page.waitForSelector('.react-flow__node');
  await page.waitForTimeout(1000);
}

async function openExport(page: Page, category: string, format: string) {
  await page.getByTitle('Export', { exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Export' });
  await dialog.getByRole('button', { name: category }).click();
  await dialog.getByText(format, { exact: true }).click();
  return dialog;
}

test('redacted export: confirmed first, then free of text and locations', async ({ page }) => {
  test.setTimeout(120_000);
  await openDossier(page);

  // Cancelling the confirmation exports nothing
  let dialog = await openExport(page, 'Backup', 'JSON');
  await dialog.getByLabel('Redact').check();
  await dialog.getByRole('button', { name: 'Export', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Redacted export' });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(confirm).toHaveCount(0);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    (async () => {
      await dialog.getByRole('button', { name: 'Export', exact: true }).click();
      await page.getByRole('dialog', { name: 'Redacted export' }).getByRole('button', { name: 'Export redacted' }).click();
    })(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^redacted_.*\.json$/);
  const text = readFileSync((await download.path())!, 'utf8');
  for (const secret of ['Jean Dupont', 'Ville ', 'source-', 'a.example', '48.85']) {
    expect(text).not.toContain(secret);
  }
  const json = JSON.parse(text);
  expect(json.elements).toHaveLength(6);
  expect(json.elements[0].label).toBe('███ 1');

  // PNG: the canvas is shown anonymised only for the capture
  dialog = await openExport(page, 'Image', 'PNG (canvas image)');
  await dialog.getByLabel('Redact').check();
  const [png] = await Promise.all([
    page.waitForEvent('download'),
    (async () => {
      await dialog.getByRole('button', { name: 'Export', exact: true }).click();
      await page.getByRole('dialog', { name: 'Redacted export' }).getByRole('button', { name: 'Export redacted' }).click();
    })(),
  ]);
  expect(png.suggestedFilename()).toMatch(/^redacted_canvas_2x\.png$/);
  await expect(page.locator('.react-flow__node').getByText('Jean Dupont 0')).toBeVisible();
});

test('sources written on several lines become one line when the dossier opens', async ({ page }) => {
  test.setTimeout(120_000);
  await openDossier(page);
  const dialog = await openExport(page, 'Backup', 'JSON');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: 'Export', exact: true }).click(),
  ]);
  const json = JSON.parse(readFileSync((await download.path())!, 'utf8'));
  expect(json.elements.find((e: { label: string }) => e.label === 'Jean Dupont 0').source).toBe('https://a.example/1 ; https://b.example/2');
});
