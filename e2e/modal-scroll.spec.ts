import { test, expect } from '@playwright/test';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setupCleanEnvironment, waitForAppLoad } from './fixtures/test-utils';
import { buildLargeDossierJson } from './fixtures/large-dossier';

/**
 * On a short window (a laptop screen), the export dialog must fit on screen:
 * its longest category (Graph, five formats) scrolls down to the last format,
 * and the Export button stays reachable.
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
  const dialog = page.getByRole('dialog').filter({
    has: page.getByRole('button', { name: 'Graph', exact: true }),
  });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Graph', exact: true }).click();

  // The dialog stays inside the window
  const box = (await dialog.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(640);

  // The last format can be reached by scrolling the list
  const last = dialog.getByText('.anx', { exact: false }).last();
  await last.scrollIntoViewIfNeeded();
  const lastBox = (await last.boundingBox())!;
  expect(lastBox.y).toBeGreaterThanOrEqual(0);
  expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(640);

  // The Export button stays on screen
  const exportButton = dialog.getByRole('button', { name: /^Export$/ });
  const buttonBox = (await exportButton.boundingBox())!;
  expect(buttonBox.y + buttonBox.height).toBeLessThanOrEqual(640);
});
