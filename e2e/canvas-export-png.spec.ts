import { test, expect, type Page } from '@playwright/test';
import { writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setupCleanEnvironment, waitForAppLoad } from './fixtures/test-utils';
import { buildLargeDossierJson } from './fixtures/large-dossier';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Open a small dossier on the canvas */
async function openDossier(page: Page) {
  await setupCleanEnvironment(page);
  await waitForAppLoad(page);
  const file = join(mkdtempSync(join(tmpdir(), 'zn-')), 'small.json');
  writeFileSync(file, buildLargeDossierJson(10));
  await page.click('[data-testid="import-button"]');
  await page.setInputFiles('input[type="file"]', file);
  await page.waitForSelector('.react-flow__node');
  await page.waitForTimeout(1000);
}

/** Export modal → Image → PNG at `scale`, returns the downloaded file */
async function exportPng(page: Page, scale: number, transparent: boolean) {
  await page.getByTitle('Export', { exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Image' }).click();
  await dialog.getByText('PNG (canvas image)').click();
  await dialog.getByRole('button', { name: `${scale}x`, exact: true }).click();
  if (transparent) await dialog.getByLabel('Transparent background').check();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: 'Export', exact: true }).click(),
  ]);
  const path = await download.path();
  return { name: download.suggestedFilename(), bytes: readFileSync(path!) };
}

/** Decode the PNG in the page: count distinct colours and fully transparent pixels */
const analyse = (page: Page, bytes: Buffer) =>
  page.evaluate(async (b64) => {
    const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0);
    const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    const colours = new Set<number>();
    let transparent = 0;
    for (let i = 0; i < data.length; i += 4 * 7) {
      colours.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
      if (data[i + 3] === 0) transparent++;
    }
    return { width: bitmap.width, height: bitmap.height, colours: colours.size, transparent };
  }, bytes.toString('base64'));

/**
 * Export modal → PNG: a real PNG file at the chosen resolution, with the graph
 * drawn on it, on white or on a transparent background.
 */
test('canvas PNG export downloads the graph at the chosen resolution', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await openDossier(page);
  const box = (await page.locator('[data-report-capture="canvas"]').boundingBox())!;

  const opaque = await exportPng(page, 2, false);
  expect(opaque.name).toMatch(/_canvas_2x\.png$/);
  expect(opaque.bytes.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
  // IHDR: width and height, big-endian, right after the signature and chunk header
  const width = opaque.bytes.readUInt32BE(16);
  const height = opaque.bytes.readUInt32BE(20);
  expect(Math.abs(width - box.width * 2)).toBeLessThanOrEqual(2);
  expect(Math.abs(height - box.height * 2)).toBeLessThanOrEqual(2);
  await expect(page.getByText('PNG (2x) export complete')).toBeVisible();
  await expect(page.getByText('PNG export error')).toHaveCount(0);

  const drawn = await analyse(page, opaque.bytes);
  expect(drawn.transparent).toBe(0);
  // Not a blank page: nodes, labels and links bring many colours
  expect(drawn.colours).toBeGreaterThan(20);
  writeFileSync(test.info().outputPath('canvas_2x.png'), opaque.bytes);

  const clear = await exportPng(page, 1, true);
  expect(clear.name).toMatch(/_canvas_1x\.png$/);
  const seeThrough = await analyse(page, clear.bytes);
  expect(Math.abs(seeThrough.width - box.width)).toBeLessThanOrEqual(1);
  expect(seeThrough.transparent).toBeGreaterThan(0);
  expect(seeThrough.colours).toBeGreaterThan(20);

  expect(errors.filter((e) => /png|html-to-image/i.test(e))).toEqual([]);
});
