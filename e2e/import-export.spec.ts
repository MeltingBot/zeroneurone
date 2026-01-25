import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import {
  setupCleanEnvironment,
  createTestInvestigation,
  createElementOnCanvas,
  getElementCount,
  goToHomePage,
  navigateHomeViaBackButton,
} from './fixtures/test-utils';

/**
 * Helper to navigate home using the back button and wait for investigation list
 * Uses client-side navigation which preserves IndexedDB state
 */
async function goHomeAndWaitForList(page: import('@playwright/test').Page) {
  // Use client-side navigation via the back button
  await navigateHomeViaBackButton(page);

  // Wait for the list to appear (not the landing page)
  await page.waitForSelector('[data-testid="investigation-list"]', { timeout: 10000 });
}

test.describe('Import/Export Operations', () => {
  test.beforeEach(async ({ page }) => {
    await setupCleanEnvironment(page);
  });

  test('should export investigation as ZIP', async ({ page }) => {
    // Create an investigation with some content
    await createTestInvestigation(page, 'Export Test');

    // Create an element
    await createElementOnCanvas(page, 400, 300);
    const labelInput = page.locator('[data-testid="element-label-input"]');
    await labelInput.fill('Test Element');
    await page.waitForTimeout(600);

    // Go back home and wait for list
    await goHomeAndWaitForList(page);

    // Open menu on the card
    const menuButton = page.locator('[data-testid^="investigation-card-"] [data-testid="card-menu"]');
    await menuButton.click();

    // Start waiting for download before clicking export
    const downloadPromise = page.waitForEvent('download');

    // Click export
    await page.click('[data-testid="export-action"]');

    // Wait for download
    const download = await downloadPromise;

    // Verify the download
    expect(download.suggestedFilename()).toContain('.zip');
  });

  test('should open import modal from home page', async ({ page }) => {
    // Click import button
    await page.click('[data-testid="import-button"]');

    // Verify import modal is open
    await expect(page.locator('[data-testid="import-modal"]')).toBeVisible();
  });

  test('should import ZIP file', async ({ page, context }) => {
    // First, create an investigation and export it to get a valid ZIP
    await createTestInvestigation(page, 'Original Investigation');
    await createElementOnCanvas(page, 400, 300);
    const labelInput = page.locator('[data-testid="element-label-input"]');
    await labelInput.fill('Original Element');
    await page.waitForTimeout(600);

    // Go home and export
    await goHomeAndWaitForList(page);

    const menuButton = page.locator('[data-testid^="investigation-card-"] [data-testid="card-menu"]');
    await menuButton.click();

    const downloadPromise = page.waitForEvent('download');
    await page.click('[data-testid="export-action"]');
    const download = await downloadPromise;

    // Save the downloaded file
    const downloadPath = path.join(__dirname, 'fixtures', 'test-export.zip');
    await download.saveAs(downloadPath);

    // Clear database and reload
    await setupCleanEnvironment(page);

    // Verify we're at landing (no investigations)
    await expect(page.locator('[data-testid="landing-section"]')).toBeVisible();

    // Click import button
    await page.click('[data-testid="import-button"]');
    await expect(page.locator('[data-testid="import-modal"]')).toBeVisible();

    // Upload the file
    const fileInput = page.locator('[data-testid="import-file-input"]');
    await fileInput.setInputFiles(downloadPath);

    // Wait for import to complete
    await page.waitForTimeout(2000);

    // Go back to home and wait for investigation list
    await goHomeAndWaitForList(page);

    // Verify investigation was imported
    const card = page.locator(`[data-testid^="investigation-card-"]`);
    await expect(card).toBeVisible();

    // Clean up test file
    if (fs.existsSync(downloadPath)) {
      fs.unlinkSync(downloadPath);
    }
  });
});
