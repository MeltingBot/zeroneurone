import { test, expect } from '@playwright/test';
import { setupCleanEnvironment, createTestInvestigation, goToHomePage, navigateHomeViaBackButton } from './fixtures/test-utils';

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

test.describe('Investigation Lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    await setupCleanEnvironment(page);
  });

  test('should display landing page when no investigations exist', async ({ page }) => {
    await expect(page.locator('[data-testid="landing-section"]')).toBeVisible();
  });

  test('should create a new investigation and navigate to canvas', async ({ page }) => {
    const investigationName = 'Test Investigation';
    await createTestInvestigation(page, investigationName, 'Test description');

    // Verify we're on the canvas
    await expect(page.locator('[data-testid="canvas"]')).toBeVisible();

    // Go back home and wait for investigation list
    await goHomeAndWaitForList(page);

    const card = page.locator(`[data-testid^="investigation-card-"]`);
    await expect(card).toBeVisible();
    await expect(card).toContainText(investigationName);
  });

  test('should rename an investigation', async ({ page }) => {
    // First create an investigation
    await createTestInvestigation(page, 'Original Name');

    // Go back home and wait for investigation list
    await goHomeAndWaitForList(page);

    // Open the menu on the card
    const menuButton = page.locator('[data-testid^="investigation-card-"] [data-testid="card-menu"]');
    await menuButton.click();

    // Click rename
    await page.click('[data-testid="rename-action"]');

    // Wait for rename modal
    await page.waitForSelector('[data-testid="rename-input"]');

    // Clear and type new name
    await page.fill('[data-testid="rename-input"]', 'Renamed Investigation');

    // Confirm rename
    await page.click('[data-testid="rename-confirm"]');

    // Verify the name was updated
    const card = page.locator(`[data-testid^="investigation-card-"]`);
    await expect(card).toContainText('Renamed Investigation');
  });

  test('should delete an investigation', async ({ page }) => {
    // First create an investigation
    await createTestInvestigation(page, 'To Be Deleted');

    // Go back home and wait for investigation list
    await goHomeAndWaitForList(page);

    // Verify the card exists
    const cardBefore = page.locator(`[data-testid^="investigation-card-"]`);
    await expect(cardBefore).toBeVisible();

    // Open the menu on the card
    const menuButton = page.locator('[data-testid^="investigation-card-"] [data-testid="card-menu"]');
    await menuButton.click();

    // Click delete
    await page.click('[data-testid="delete-action"]');

    // Confirm deletion
    await page.waitForSelector('[data-testid="confirm-delete"]');
    await page.click('[data-testid="confirm-delete"]');

    // Wait for delete to complete
    await page.waitForTimeout(500);

    // Verify the investigation is gone (either landing section shows or no cards)
    const landingVisible = await page.locator('[data-testid="landing-section"]').isVisible({ timeout: 3000 }).catch(() => false);
    const cardsExist = await page.locator('[data-testid^="investigation-card-"]').count();

    // Either landing section should be visible, or there should be no cards
    expect(landingVisible || cardsExist === 0).toBeTruthy();
  });

  test('should navigate to investigation canvas on card click', async ({ page }) => {
    // First create an investigation
    await createTestInvestigation(page, 'Click Test');

    // Go back home and wait for investigation list
    await goHomeAndWaitForList(page);

    // Click on the card
    const card = page.locator(`[data-testid^="investigation-card-"]`);
    await card.click();

    // Verify we're on the canvas
    await expect(page.locator('[data-testid="canvas"]')).toBeVisible();
  });
});
