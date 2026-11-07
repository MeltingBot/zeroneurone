import { test, expect, type Page } from '@playwright/test';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setupCleanEnvironment, waitForAppLoad } from './fixtures/test-utils';
import { buildLargeDossierJson } from './fixtures/large-dossier';

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    __znImport(path: string): Promise<any>;
  }
}

/** Import an app module as the app loaded it (a reused dev server adds `?t=`) */
const exposeImporter = (page: Page) =>
  page.addInitScript(() => {
    window.__znImport = (path: string) => {
      const loaded = performance
        .getEntriesByType('resource')
        .map((e) => e.name)
        .filter((name) => new URL(name).pathname === path);
      return import(/* @vite-ignore */ loaded.length > 0 ? loaded[loaded.length - 1] : path);
    };
  });

/** Open a small dossier on the canvas */
async function openDossier(page: Page) {
  await exposeImporter(page);
  await setupCleanEnvironment(page);
  await waitForAppLoad(page);
  const file = join(mkdtempSync(join(tmpdir(), 'zn-')), 'small.json');
  writeFileSync(file, buildLargeDossierJson(10));
  await page.click('[data-testid="import-button"]');
  await page.setInputFiles('input[type="file"]', file);
  await page.waitForSelector('.react-flow__node');
  await page.waitForTimeout(1000);
}

/** Sizes of the pages of a PDF, in points, from their MediaBox. */
function pdfPages(bytes: Buffer): { width: number; height: number }[] {
  const text = bytes.toString('latin1');
  return [...text.matchAll(/\/MediaBox\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]/g)]
    .map((m) => ({ width: Number(m[3]) - Number(m[1]), height: Number(m[4]) - Number(m[2]) }));
}

const MM_TO_PT = 72 / 25.4;

/**
 * Export modal → PDF: the graph laid out on one sheet of the chosen size, sent
 * to the print dialog. The printed page is rendered here to a real PDF.
 */
test('canvas PDF export prints the graph on one A0 sheet', async ({ page, browserName, context }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await openDossier(page);

  // Keep the printed page: the frame is removed once the dialog closes
  await page.evaluate(() => {
    const w = window as unknown as { __printed?: string };
    new MutationObserver((records) => {
      for (const r of records) {
        for (const node of r.addedNodes) {
          if (node instanceof HTMLIFrameElement && node.id === 'zn-print-frame') w.__printed = node.srcdoc;
        }
      }
    }).observe(document.body, { childList: true });
  });

  await page.getByTitle('Export', { exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Image' }).click();
  await dialog.getByText('PDF (print)').click();
  await dialog.getByRole('button', { name: 'A0', exact: true }).click();
  await dialog.getByRole('button', { name: 'Landscape', exact: true }).click();
  await dialog.getByRole('button', { name: 'Export', exact: true }).click();

  const html = await page.waitForFunction(() => (window as unknown as { __printed?: string }).__printed)
    .then((h) => h.jsonValue() as Promise<string>);
  expect(html).toContain('@page { size: 1189mm 841mm; margin: 10mm; }');
  expect(html).toMatch(/<g id="nodes">/);
  // White paper: no canvas-coloured fill behind the graph
  expect(html).not.toContain('fill="#faf8f5"/>');
  await expect(dialog).toHaveCount(0);
  expect(errors.filter((e) => /PDF export failed/.test(e))).toEqual([]);

  // The sheet rendered to a real PDF: Chromium only
  if (browserName !== 'chromium') return;
  const sheet = await context.newPage();
  await sheet.setContent(html);
  const pdf = await sheet.pdf({ preferCSSPageSize: true, printBackground: true });
  const pages = pdfPages(pdf);
  expect(pages).toHaveLength(1);
  expect(Math.abs(pages[0].width - 1189 * MM_TO_PT)).toBeLessThan(2);
  expect(Math.abs(pages[0].height - 841 * MM_TO_PT)).toBeLessThan(2);
  // Vector: the labels are text in the PDF, not an image
  expect(pdf.toString('latin1')).not.toContain('/Subtype /Image');
  await sheet.close();
});

/** A JPEG of `width` × `height`, two colours, made in the page. */
const MAKE_JPEG = `async (width, height) => {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#c03030'; ctx.fillRect(0, 0, width / 2, height);
  ctx.fillStyle = '#3030c0'; ctx.fillRect(width / 2, 0, width / 2, height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  return new File([blob], 'photo.jpg', { type: 'image/jpeg' });
}`;

test('the images printed come from the original files, sized for 300 dpi', async ({ page }) => {
  await setupCleanEnvironment(page);
  await waitForAppLoad(page);
  const sizes = await page.evaluate(async (make) => {
    const makeJpeg = eval(make) as (w: number, h: number) => Promise<File>;
    const { printImageDataUrl } = await import('/src/services/printExportService.ts');
    const decoded = async (url: string | null) => {
      if (!url) return null;
      const bitmap = await createImageBitmap(await (await fetch(url)).blob());
      return [bitmap.width, bitmap.height];
    };
    const big = await makeJpeg(3000, 2000);
    return {
      reduced: await decoded(await printImageDataUrl(big, { width: 900, height: 900 })),
      // A wide, low frame: the height sets the size
      lowFrame: await decoded(await printImageDataUrl(big, { width: 900, height: 100 })),
      capped: await decoded(await printImageDataUrl(await makeJpeg(6000, 3000), { width: 9000, height: 9000 })),
      asIs: await decoded(await printImageDataUrl(await makeJpeg(400, 300), { width: 900, height: 900 })),
      notImage: await printImageDataUrl(new File(['x'], 'a.pdf', { type: 'application/pdf' }), { width: 900, height: 900 }),
    };
  }, MAKE_JPEG);
  expect(sizes.reduced).toEqual([900, 600]);
  expect(sizes.lowFrame).toEqual([150, 100]);
  expect(sizes.capped).toEqual([4096, 2048]);
  expect(sizes.asIs).toEqual([400, 300]);
  expect(sizes.notImage).toBeNull();
});

test('canvas PDF export embeds the original photo of an element, not its thumbnail', async ({ page, browserName, context }) => {
  test.setTimeout(120_000);
  await openDossier(page);
  // A 3000 × 2000 photo attached to the first element
  await page.evaluate(async (make) => {
    const makeJpeg = eval(make) as (w: number, h: number) => Promise<File>;
    const { useDossierStore } = await window.__znImport('/src/stores/dossierStore.ts');
    const { fileService } = await import('/src/services/fileService.ts');
    const s = useDossierStore.getState();
    const element = s.elements.find((e) => !e.isGroup && !e.isAnnotation)!;
    const asset = await fileService.saveAsset(s.currentDossier!.id, await makeJpeg(3000, 2000));
    await s.updateElement(element.id, { assetIds: [asset.id] });
    const w = window as unknown as { __printed?: string };
    new MutationObserver((records) => {
      for (const r of records) for (const node of r.addedNodes) {
        if (node instanceof HTMLIFrameElement && node.id === 'zn-print-frame') w.__printed = node.srcdoc;
      }
    }).observe(document.body, { childList: true });
  }, MAKE_JPEG);

  await page.getByTitle('Export', { exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Image' }).click();
  await dialog.getByText('PDF (print)').click();
  await dialog.getByRole('button', { name: 'A0', exact: true }).click();
  await dialog.getByRole('button', { name: 'Export', exact: true }).click();
  const html = await page.waitForFunction(() => (window as unknown as { __printed?: string }).__printed)
    .then((h) => h.jsonValue() as Promise<string>);

  const href = html.match(/<image href="(data:image\/[^"]+)"/)?.[1];
  expect(href).toBeTruthy();
  // Decoded in a page of its own: in Firefox the print window stays open over the app
  const probe = await context.newPage();
  const size = await probe.evaluate(async (url) => {
    const bitmap = await createImageBitmap(await (await fetch(url)).blob());
    return [bitmap.width, bitmap.height];
  }, href!);
  await probe.close();
  // Sized for its frame at 300 dpi: here above the 200 px thumbnail, below the 3000 px file
  expect(Math.max(...size)).toBeGreaterThan(200);
  expect(Math.max(...size)).toBeLessThan(3000);

  // ZN_PDF_SAMPLE=<path>: keep the A0 PDF to look at it
  if (browserName === 'chromium' && process.env.ZN_PDF_SAMPLE) {
    const sheet = await context.newPage();
    await sheet.setContent(html);
    writeFileSync(process.env.ZN_PDF_SAMPLE, await sheet.pdf({ preferCSSPageSize: true, printBackground: true }));
    await sheet.close();
  }
});
