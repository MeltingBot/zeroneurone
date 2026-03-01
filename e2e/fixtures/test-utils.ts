import { Page, expect } from '@playwright/test';

/**
 * Clear all IndexedDB databases for a clean test state.
 * Properly awaits each deletion request before returning.
 * Note: This must be called AFTER navigating to the page.
 */
export async function clearIndexedDB(page: Page) {
  await page.evaluate(async () => {
    function deleteDB(name: string): Promise<void> {
      return new Promise((resolve) => {
        const req = indexedDB.deleteDatabase(name);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
      });
    }

    // Enumerate and delete all databases (Chrome 73+)
    if ('databases' in indexedDB) {
      try {
        const dbs = await indexedDB.databases();
        await Promise.all(dbs.map(db => db.name ? deleteDB(db.name) : Promise.resolve()));
        return;
      } catch {
        // fall through to known names
      }
    }
    await Promise.all(['zeroneurone', 'zeroneurone-db'].map(deleteDB));
  });
}

/**
 * Wait for the app to be fully loaded
 */
export async function waitForAppLoad(page: Page) {
  // Wait for either the landing page or the dossier list to appear
  await page.waitForSelector('[data-testid="landing-section"], [data-testid="dossier-list"]', {
    timeout: 30000,
  });
}

/**
 * Create a new dossier from the home page
 */
export async function createTestDossier(page: Page, name: string, description = '') {
  // Click new dossier button (handle both landing and list view)
  const newButton = page.locator('[data-testid="new-dossier"]').first();
  await newButton.click();

  // Handle disclaimer modal if it appears (first time users)
  const disclaimerModal = page.locator('[data-testid="disclaimer-accept"]');
  if (await disclaimerModal.isVisible({ timeout: 1000 }).catch(() => false)) {
    await disclaimerModal.click();
    // Wait for create modal to open after accepting disclaimer
    await page.waitForSelector('[data-testid="dossier-name"]');
  }

  // Fill in dossier details
  await page.fill('[data-testid="dossier-name"]', name);
  if (description) {
    await page.fill('[data-testid="dossier-description"]', description);
  }

  // Create the dossier
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
 * Navigate home using the back button (client-side navigation)
 * This preserves IndexedDB state better than page.goto('/')
 */
export async function navigateHomeViaBackButton(page: Page) {
  const backButton = page.locator('[data-testid="back-to-home"]');
  await backButton.click();
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
 * Create an element on the canvas using the 'E' keyboard shortcut.
 * More reliable than double-click in headless mode.
 * Moves the mouse to the target position first so the element lands there.
 */
export async function createElementOnCanvas(page: Page, x: number, y: number) {
  // Wait for React Flow pane to be ready
  const pane = page.locator('.react-flow__pane');
  await pane.waitFor({ state: 'visible', timeout: 10_000 });

  // Move mouse to the desired canvas position so the 'E' handler uses it
  const paneBounds = await pane.boundingBox();
  if (paneBounds) {
    await page.mouse.move(paneBounds.x + x, paneBounds.y + y);
  }

  // Press 'E' — window-level keydown handler creates an element at cursor position
  // The handler skips inputs/textareas, so make sure no input is focused first
  await page.keyboard.press('Escape'); // deselect / blur any active input
  await page.keyboard.press('e');

  // Wait for the label input to appear (element created and selected)
  await page.waitForSelector('[data-testid="element-label-input"]', { timeout: 10_000 });
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
  // Navigate to the app
  await page.goto('/');

  // Clear any existing data
  await clearIndexedDB(page);

  // Reload to ensure clean state
  await page.reload();
  await waitForAppLoad(page);
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
