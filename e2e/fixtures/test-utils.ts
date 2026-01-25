import { Page, expect } from '@playwright/test';

/**
 * Clear all IndexedDB databases for a clean test state
 */
export async function clearIndexedDB(page: Page) {
  await page.evaluate(async () => {
    const databases = await indexedDB.databases();
    for (const db of databases) {
      if (db.name) {
        indexedDB.deleteDatabase(db.name);
      }
    }
  });
}

/**
 * Wait for the app to be fully loaded
 */
export async function waitForAppLoad(page: Page) {
  // Wait for either the landing page or the investigation list to appear
  await page.waitForSelector('[data-testid="landing-section"], [data-testid="investigation-list"]', {
    timeout: 30000,
  });
}

/**
 * Create a new investigation from the home page
 */
export async function createTestInvestigation(page: Page, name: string, description = '') {
  // Click new investigation button (handle both landing and list view)
  const newButton = page.locator('[data-testid="new-investigation"]').first();
  await newButton.click();

  // Handle disclaimer modal if it appears (first time users)
  const disclaimerModal = page.locator('[data-testid="disclaimer-accept"]');
  if (await disclaimerModal.isVisible({ timeout: 1000 }).catch(() => false)) {
    await disclaimerModal.click();
    // Wait for create modal to open after accepting disclaimer
    await page.waitForSelector('[data-testid="investigation-name"]');
  }

  // Fill in investigation details
  await page.fill('[data-testid="investigation-name"]', name);
  if (description) {
    await page.fill('[data-testid="investigation-description"]', description);
  }

  // Create the investigation
  await page.click('[data-testid="create-button"]');

  // Wait for navigation to the canvas
  await page.waitForSelector('[data-testid="canvas"]', { timeout: 10000 });
}

/**
 * Navigate to home page and wait for load
 */
export async function goToHomePage(page: Page) {
  await page.goto('/');
  await waitForAppLoad(page);
}

/**
 * Open the search modal (Ctrl+K)
 */
export async function openSearch(page: Page) {
  await page.keyboard.press('Control+k');
  await page.waitForSelector('[data-testid="search-input"]');
}

/**
 * Close search modal
 */
export async function closeSearch(page: Page) {
  await page.keyboard.press('Escape');
}

/**
 * Double-click on canvas to create an element at specific position
 */
export async function createElementOnCanvas(page: Page, x: number, y: number) {
  const canvas = page.locator('[data-testid="canvas"]');
  await canvas.dblclick({ position: { x, y } });
  // Wait for element to be created and selected
  await page.waitForSelector('[data-testid="detail-panel"]');
}

/**
 * Get the count of elements on the canvas
 */
export async function getElementCount(page: Page): Promise<number> {
  return await page.locator('.react-flow__node').count();
}

/**
 * Get the count of edges (links) on the canvas
 */
export async function getLinkCount(page: Page): Promise<number> {
  return await page.locator('.react-flow__edge').count();
}

/**
 * Set up a clean test environment
 */
export async function setupCleanEnvironment(page: Page) {
  await clearIndexedDB(page);
  await goToHomePage(page);
}

/**
 * Wait for a toast message to appear
 */
export async function waitForToast(page: Page, textMatch?: string | RegExp) {
  const toast = page.locator('[data-testid="toast"]');
  await expect(toast).toBeVisible();
  if (textMatch) {
    await expect(toast).toContainText(textMatch);
  }
}
