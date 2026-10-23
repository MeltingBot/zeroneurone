import { test, expect } from '@playwright/test';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setupCleanEnvironment, waitForAppLoad } from './fixtures/test-utils';
import { buildLargeDossierJson } from './fixtures/large-dossier';

/**
 * On a short window (a laptop screen), the export dialog is taller than the
 * viewport. It must fit on screen and its list must scroll down to the last
 * formats (PNG), instead of running off the page with no way to reach them.
 */
test('the export dialog scrolls on a short window', async ({ page }) => {
  await setupCleanEnvironment(page);
  await waitForAppLoad(page);
  const file = join(mkdtempSync(join(tmpdir(), 'zn-')), 'small.json');
  writeFileSync(file, buildLargeDossierJson(10));
  await page.click('[data-testid="import-button"]');
  await page.setInputFiles('input[type="file"]', file);
  await page.waitForSelector('.react-flow__node');

  // A laptop window (the app asks for 600 px at least)
  await page.setViewportSize({ width: 1280, height: 640 });
  await page.locator('button[title="Export"]').first().click();
  const dialog = page.locator('[role="dialog"]').filter({ hasText: 'PNG' });
  await expect(dialog).toBeVisible();

  // The dialog stays inside the window
  const box = (await dialog.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(640);

  // The last format can be reached by scrolling the list
  const png = dialog.getByText('PNG', { exact: false }).last();
  await png.scrollIntoViewIfNeeded();
  const pngBox = (await png.boundingBox())!;
  expect(pngBox.y + pngBox.height).toBeLessThanOrEqual(640);
  expect(pngBox.y).toBeGreaterThanOrEqual(0);
});
