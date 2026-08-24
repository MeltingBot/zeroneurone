import { test, expect } from '@playwright/test';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setupCleanEnvironment, createTestDossier, createElementOnCanvas } from './fixtures/test-utils';
import { buildMinimalPdf } from './fixtures/minimal-pdf';

/**
 * The PDF preview broke twice in two releases — once because the sandboxed
 * iframe blocked Chrome's viewer, once because a shared ref let one effect run
 * destroy another run's worker. Both were only caught by hand. This covers the
 * path that matters: attach a PDF, open it, and check something is drawn.
 */
test.describe('PDF preview', () => {
  // Uploading, extracting metadata and rasterising a page all take time.
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(async ({ page }) => {
    await setupCleanEnvironment(page);
  });

  test('renders an attached PDF without tearing down its own worker', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));

    await createTestDossier(page, 'Dossier PDF');
    await createElementOnCanvas(page, 400, 300);

    const dir = mkdtempSync(join(tmpdir(), 'zn-pdf-'));
    const file = join(dir, 'document.pdf');
    writeFileSync(file, buildMinimalPdf());

    // The Files section lives in the element detail panel.
    await page.setInputFiles('input[type="file"]', file);

    // Uploading a PDF surfaces the metadata import prompt asynchronously, and
    // it overlays the panel. Wait for it, dismiss it, and wait for it to go.
    const ignore = page.getByRole('button', { name: 'Ignorer' });
    await ignore.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => { /* no metadata found */ });
    if (await ignore.isVisible().catch(() => false)) {
      await ignore.click();
      await expect(ignore).toBeHidden({ timeout: 10_000 });
    }

    // Opening the attachment mounts PdfPreview. The button only shows on
    // hover, hence the explicit test id rather than a label lookup.
    // The Files accordion starts collapsed; open it before reaching the row.
    await page.getByRole('button', { name: /files|fichiers/i }).first().click();

    const row = page.getByText('document.pdf').first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    // The actions only appear on hover, as they do for a real user.
    await row.hover();
    await page.getByTestId('preview-asset').first().click();

    const canvas = page.getByTestId('pdf-preview-canvas');
    await expect(canvas).toBeVisible({ timeout: 30_000 });

    // A destroyed worker leaves a zero-sized canvas and an error boundary.
    const size = await canvas.evaluate((el) => ({
      width: (el as HTMLCanvasElement).width,
      height: (el as HTMLCanvasElement).height,
    }));
    expect(size.width).toBeGreaterThan(0);
    expect(size.height).toBeGreaterThan(0);

    // The exact regression: getPage() on a document whose transport was torn down.
    expect(errors.filter((e) => e.includes('sendWithPromise'))).toEqual([]);
    expect(errors.filter((e) => e.includes('Erreur de rendu'))).toEqual([]);
  });

  test('offers metadata re-extraction on an attached file', async ({ page }) => {
    await createTestDossier(page, 'Dossier metadonnees');
    await createElementOnCanvas(page, 400, 300);

    const dir = mkdtempSync(join(tmpdir(), 'zn-meta-'));
    const file = join(dir, 'document.pdf');
    writeFileSync(file, buildMinimalPdf());
    await page.setInputFiles('input[type="file"]', file);

    const ignore = page.getByRole('button', { name: 'Ignorer' });
    await ignore.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => { /* none found */ });
    if (await ignore.isVisible().catch(() => false)) {
      await ignore.click();
      await expect(ignore).toBeHidden({ timeout: 10_000 });
    }

    await page.getByRole('button', { name: /files|fichiers/i }).first().click();
    const row = page.getByText('document.pdf').first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.hover();

    // The whole point: extraction used to be reachable only at attach time.
    await page.getByTestId('extract-metadata').first().click();

    // Either the proposal reappears, or a toast says there was nothing to find.
    await expect(
      page.getByRole('button', { name: 'Ignorer' }).or(page.getByRole('alert'))
    ).toBeVisible({ timeout: 30_000 });
  });
});
