import { test, expect, type Page } from '@playwright/test';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setupCleanEnvironment, createTestDossier, createElementOnCanvas } from './fixtures/test-utils';
import { buildMinimalPdf, buildParagraphPdf } from './fixtures/minimal-pdf';

/** Attaches `pdf` to a new element and opens its preview. */
async function openPdfPreview(page: Page, pdf: Buffer) {
  await createTestDossier(page, 'Dossier PDF');
  await createElementOnCanvas(page, 400, 300);

  const dir = mkdtempSync(join(tmpdir(), 'zn-pdf-'));
  const file = join(dir, 'document.pdf');
  writeFileSync(file, pdf);

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
}

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

    await openPdfPreview(page, buildMinimalPdf());

    const canvas = page.getByTestId('pdf-preview-canvas');
    await expect(canvas).toBeVisible({ timeout: 30_000 });

    // A destroyed worker leaves a zero-sized canvas and an error boundary.
    const size = await canvas.evaluate((el) => ({
      width: (el as HTMLCanvasElement).width,
      height: (el as HTMLCanvasElement).height,
    }));
    expect(size.width).toBeGreaterThan(0);
    expect(size.height).toBeGreaterThan(0);

    // The text layer over the canvas is what makes the text selectable.
    const textLayer = page.getByTestId('pdf-preview-text');
    await expect(textLayer).toContainText('ZeroNeurone', { timeout: 10_000 });
    const selected = await textLayer.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);
      return sel.toString();
    });
    expect(selected).toContain('ZeroNeurone');

    // The span must sit over the drawn glyphs: the fixture prints the word at
    // x=20, baseline y=100 (from the bottom) on a 200x200 page, in 18pt.
    const geometry = await page.evaluate(() => {
      const canvas = document.querySelector('[data-testid="pdf-preview-canvas"]')!.getBoundingClientRect();
      const span = document.querySelector('[data-testid="pdf-preview-text"] span')!.getBoundingClientRect();
      const k = canvas.width / 200;
      return {
        left: (span.left - canvas.left) / k,
        top: (span.top - canvas.top) / k,
        height: span.height / k,
      };
    });
    expect(geometry.left).toBeGreaterThan(15);
    expect(geometry.left).toBeLessThan(25);
    expect(geometry.top).toBeGreaterThan(75);
    expect(geometry.top).toBeLessThan(100);
    expect(geometry.height).toBeGreaterThan(12);
    expect(geometry.height).toBeLessThan(25);

    // The exact regression: getPage() on a document whose transport was torn down.
    expect(errors.filter((e) => e.includes('sendWithPromise'))).toEqual([]);
    expect(errors.filter((e) => e.includes('Erreur de rendu'))).toEqual([]);
  });

  test('scrolls through every page and tracks the current one', async ({ page }) => {
    await openPdfPreview(page, buildMinimalPdf(8));

    const scroller = page.getByTestId('pdf-preview-scroll');
    const counter = page.getByText(/^\d+ \/ 8$/);
    const canvases = page.getByTestId('pdf-preview-canvas');
    await expect(canvases).toHaveCount(8, { timeout: 30_000 });
    await expect(counter).toHaveText('1 / 8');

    const drawnWidth = (n: number) =>
      canvases.nth(n - 1).evaluate((el) => (el as HTMLCanvasElement).width);

    // Only pages near the viewport are drawn; the last one waits its turn.
    await expect.poll(() => drawnWidth(1)).toBeGreaterThan(0);
    expect(await drawnWidth(8)).toBe(0);

    // Scrolling to the end moves the counter and draws the last page.
    await scroller.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await expect(counter).toHaveText('8 / 8');
    await expect.poll(() => drawnWidth(8)).toBeGreaterThan(0);
    await expect(page.getByTestId('pdf-preview-text').nth(7)).toContainText('Page 8');

    // The buttons jump to a page and the counter follows.
    await page.getByRole('button', { name: /page précédente|previous page/i }).click();
    await expect(counter).toHaveText('7 / 8');
    await scroller.evaluate((el) => { el.scrollTop = 0; });
    await expect(counter).toHaveText('1 / 8');
    await page.getByRole('button', { name: /page suivante|next page/i }).click();
    await expect(counter).toHaveText('2 / 8');

    // Zooming keeps the reader on the same page.
    // Scoped to the preview: the canvas toolbar has its own zoom buttons.
    await scroller.locator('..').getByRole('button', { name: /zoom out|dézoomer/i }).click();
    await expect(counter).toHaveText('2 / 8');
  });

  test('finds text across pages and steps through the matches', async ({ page }) => {
    await openPdfPreview(page, buildMinimalPdf(8));
    const scroller = page.getByTestId('pdf-preview-scroll');
    await expect(page.getByTestId('pdf-preview-canvas')).toHaveCount(8, { timeout: 30_000 });

    // Ctrl+F from inside the preview opens the search bar.
    await scroller.click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('ControlOrMeta+f');
    const input = page.getByTestId('pdf-preview-search');
    await expect(input).toBeFocused();

    // Case-insensitive; the undrawn page 6 is scrolled to and highlighted.
    await input.fill('PAGE 6');
    await expect(page.getByText('1 / 1', { exact: true })).toBeVisible({ timeout: 20_000 });
    const current = page.locator('.pdf-match-current');
    await expect(current).toHaveText('Page 6', { timeout: 10_000 });
    await expect(current).toBeInViewport();

    // The mark must sit over the drawn glyphs, in page units (200x200 page,
    // glyphs from x=20): "Page 6" at baseline 100 in 18pt, "suite 6" — the
    // page's second text item — at baseline 40 in 12pt.
    const markBox = () => page.evaluate(() => {
      const mark = document.querySelector('.pdf-match-current')!.getBoundingClientRect();
      const canvas = document.querySelector('[data-page="6"] canvas') as HTMLCanvasElement;
      const box = canvas.getBoundingClientRect();
      const k = canvas.width / 200;
      return { left: (mark.left - box.left) / k, top: (mark.top - box.top) / k };
    });
    let mark = await markBox();
    expect(mark.left).toBeGreaterThan(15);
    expect(mark.left).toBeLessThan(25);
    expect(mark.top).toBeGreaterThan(75);
    expect(mark.top).toBeLessThan(100);

    await input.fill('suite 6');
    await expect(current).toHaveText('suite 6');
    mark = await markBox();
    expect(mark.left).toBeGreaterThan(15);
    expect(mark.left).toBeLessThan(25);
    expect(mark.top).toBeGreaterThan(140);
    expect(mark.top).toBeLessThan(165);

    // Seven pages say "Page N" (2 to 8). Like a browser's find bar, a new
    // search starts from the page being read: page 6, the fifth match.
    await input.fill('page');
    const status = page.getByText(/^\d+ \/ 7$/);
    await expect(status).toHaveText('5 / 7');
    await expect(current).toHaveText('Page');
    await input.press('Enter');
    await expect(status).toHaveText('6 / 7');
    await input.press('Shift+Enter');
    await expect(status).toHaveText('5 / 7');
    // Past the last match, it wraps around to the first.
    await input.press('Enter');
    await input.press('Enter');
    await input.press('Enter');
    await expect(status).toHaveText('1 / 7');
    await expect(current).toBeInViewport();

    await input.fill('introuvable');
    await expect(page.getByText(/aucun résultat|no match/i)).toBeVisible();

    // Escape closes the search bar, not the preview.
    await input.press('Escape');
    await expect(input).toBeHidden();
    await expect(scroller).toBeVisible();
    await expect(page.locator('.pdf-match')).toHaveCount(0);
  });

  test('fits the whole page or the page width', async ({ page }) => {
    await openPdfPreview(page, buildMinimalPdf(3));
    const scroller = page.getByTestId('pdf-preview-scroll');
    const firstPage = scroller.locator('[data-page="1"]');
    await expect(firstPage).toBeVisible({ timeout: 30_000 });

    const measure = () => Promise.all([
      firstPage.evaluate((el) => el.getBoundingClientRect().toJSON() as DOMRect),
      scroller.evaluate((el) => ({ width: el.clientWidth, height: el.clientHeight })),
    ]);

    const fitPage = page.getByRole('button', { name: /page entière|whole page/i });
    await fitPage.click();
    await expect(fitPage).toHaveAttribute('aria-pressed', 'true');
    let [box, frame] = await measure();
    expect(box.height).toBeLessThanOrEqual(frame.height - 32 + 1);
    expect(box.width).toBeLessThanOrEqual(frame.width - 32 + 1);

    const fitWidth = page.getByRole('button', { name: /largeur de la page|page width/i });
    await fitWidth.click();
    await expect(fitWidth).toHaveAttribute('aria-pressed', 'true');
    await expect(fitPage).toHaveAttribute('aria-pressed', 'false');
    [box, frame] = await measure();
    // Unless the zoom ceiling stops it first, the page spans the width.
    const zoom = await scroller.locator('..').getByText(/^\d+%$/).textContent();
    if (zoom !== '300%') expect(Math.abs(box.width - (frame.width - 32))).toBeLessThan(2);

    // Zooming by hand leaves the fit mode.
    await scroller.locator('..').getByRole('button', { name: /zoom out|dézoomer/i }).click();
    await expect(fitWidth).toHaveAttribute('aria-pressed', 'false');
  });

  test('keeps a selection where the pointer leaves the text', async ({ page }) => {
    await openPdfPreview(page, buildParagraphPdf());
    await expect(page.getByTestId('pdf-preview-text').first()).toContainText('Troisieme', { timeout: 30_000 });
    await page.getByRole('button', { name: /whole page|page entière/i }).click();
    await page.waitForTimeout(1000);
    const box = (await page.locator('[data-page="1"]').boundingBox())!;
    // Page coordinates (595x842, origin bottom-left) to screen
    const at = (x: number, y: number) => [box.x + (x / 595) * box.width, box.y + (1 - y / 842) * box.height] as const;
    const selection = () => page.evaluate(() => window.getSelection()!.toString());
    const drag = async (from: readonly [number, number], to: readonly [number, number]) => {
      await page.evaluate(() => window.getSelection()?.removeAllRanges());
      await page.mouse.move(...from);
      await page.mouse.down();
      await page.mouse.move(...to, { steps: 10 });
      await page.mouse.up();
      return selection();
    };

    // From inside "Second ligne 2" (baseline 547) out to the empty right side:
    // the rest of that line, not the paragraphs above (Firefox) or below (Chromium)
    let text = await drag(at(70, 550), at(540, 550));
    expect(text).toContain('ligne 2 du paragraphe');
    expect(text).not.toContain('Premier');
    expect(text).not.toContain('Troisieme');

    // Down into the gap after the paragraph: stops before the next one
    text = await drag(at(70, 550), at(150, 485));
    expect(text).toContain('Second ligne 5');
    expect(text).not.toContain('Premier');
    expect(text).not.toContain('Troisieme ligne 2');

    // A double click in a gap selects nothing; on a word, the word
    await page.evaluate(() => window.getSelection()?.removeAllRanges());
    await page.mouse.dblclick(...at(450, 600));
    expect(await selection()).toBe('');
    await page.mouse.dblclick(...at(20 + 40 + 5, 547 + 3));
    expect((await selection()).trim()).toMatch(/^Second$/);
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
