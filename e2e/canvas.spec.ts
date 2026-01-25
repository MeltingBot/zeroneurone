import { test, expect } from '@playwright/test';
import {
  setupCleanEnvironment,
  createTestInvestigation,
  createElementOnCanvas,
  getElementCount,
  getLinkCount,
  openSearch,
} from './fixtures/test-utils';

test.describe('Canvas Element Operations', () => {
  test.beforeEach(async ({ page }) => {
    await setupCleanEnvironment(page);
    await createTestInvestigation(page, 'Canvas Test');
  });

  test('should create an element by double-clicking on canvas', async ({ page }) => {
    // Double-click on the canvas to create an element
    await createElementOnCanvas(page, 400, 300);

    // Verify element was created
    const elementCount = await getElementCount(page);
    expect(elementCount).toBe(1);

    // Verify detail panel shows element details
    await expect(page.locator('[data-testid="detail-panel"]')).toBeVisible();
  });

  test('should edit element label via detail panel', async ({ page }) => {
    // Create an element
    await createElementOnCanvas(page, 400, 300);

    // Edit the label in the detail panel
    const labelInput = page.locator('[data-testid="element-label-input"]');
    await labelInput.fill('My Test Element');

    // Wait for debounce
    await page.waitForTimeout(600);

    // Verify the label on the canvas node was updated
    const nodeLabel = page.locator('.react-flow__node').first();
    await expect(nodeLabel).toContainText('My Test Element');
  });

  test('should delete selected element with Delete key', async ({ page }) => {
    // Create an element
    await createElementOnCanvas(page, 400, 300);
    expect(await getElementCount(page)).toBe(1);

    // Click on canvas to ensure focus is not on an input
    await page.locator('[data-testid="canvas"]').click({ position: { x: 100, y: 100 } });

    // Element should still be selected, press Delete
    await page.keyboard.press('Delete');

    // Verify element was deleted
    await page.waitForTimeout(500);
    expect(await getElementCount(page)).toBe(0);
  });

  test('should select element and show detail panel', async ({ page }) => {
    // Create an element
    await createElementOnCanvas(page, 400, 300);

    // Click elsewhere to deselect
    await page.locator('[data-testid="canvas"]').click({ position: { x: 100, y: 100 } });

    // Wait a bit
    await page.waitForTimeout(300);

    // Click on the element to select it
    const element = page.locator('.react-flow__node').first();
    await element.click();

    // Verify detail panel shows
    await expect(page.locator('[data-testid="detail-panel"]')).toBeVisible();
  });

  test('should create link by dragging from element to element', async ({ page }) => {
    // Create first element
    await createElementOnCanvas(page, 200, 200);

    // Click away to deselect
    await page.locator('[data-testid="canvas"]').click({ position: { x: 100, y: 100 } });
    await page.waitForTimeout(300);

    // Create second element
    await createElementOnCanvas(page, 500, 200);

    // Verify we have 2 elements
    expect(await getElementCount(page)).toBe(2);

    // Get the handle from the first element
    const firstElement = page.locator('.react-flow__node').first();
    const secondElement = page.locator('.react-flow__node').nth(1);

    // Get bounding boxes
    const firstBox = await firstElement.boundingBox();
    const secondBox = await secondElement.boundingBox();

    if (!firstBox || !secondBox) {
      throw new Error('Could not get element bounding boxes');
    }

    // Drag from right side of first element to left side of second element
    // to create a connection
    const sourceX = firstBox.x + firstBox.width - 5;
    const sourceY = firstBox.y + firstBox.height / 2;
    const targetX = secondBox.x + 5;
    const targetY = secondBox.y + secondBox.height / 2;

    await page.mouse.move(sourceX, sourceY);
    await page.mouse.down();
    await page.mouse.move(targetX, targetY, { steps: 10 });
    await page.mouse.up();

    // Wait for link to be created
    await page.waitForTimeout(500);

    // Verify link was created
    expect(await getLinkCount(page)).toBeGreaterThanOrEqual(1);
  });
});

test.describe('Search (Ctrl+K)', () => {
  test.beforeEach(async ({ page }) => {
    await setupCleanEnvironment(page);
    await createTestInvestigation(page, 'Search Test');
  });

  test('should open search modal with Ctrl+K', async ({ page }) => {
    await openSearch(page);
    await expect(page.locator('[data-testid="search-input"]')).toBeVisible();
  });

  test('should close search modal with Escape', async ({ page }) => {
    await openSearch(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-testid="search-input"]')).not.toBeVisible();
  });

  test('should search and find element', async ({ page }) => {
    // Create an element
    await createElementOnCanvas(page, 400, 300);

    // Edit label
    const labelInput = page.locator('[data-testid="element-label-input"]');
    await labelInput.fill('Unique Searchable Name');
    await page.waitForTimeout(600);

    // Click away to deselect
    await page.locator('[data-testid="canvas"]').click({ position: { x: 100, y: 100 } });
    await page.waitForTimeout(300);

    // Open search
    await openSearch(page);

    // Type search query
    await page.fill('[data-testid="search-input"]', 'Unique');

    // Wait for results
    await page.waitForTimeout(200);

    // Verify result appears
    const result = page.locator('[data-testid="search-result"]').first();
    await expect(result).toBeVisible();
    await expect(result).toContainText('Unique Searchable Name');

    // Click on result
    await result.click();

    // Verify element is selected (detail panel shows)
    await expect(page.locator('[data-testid="detail-panel"]')).toBeVisible();
    await expect(page.locator('[data-testid="element-label-input"]')).toHaveValue('Unique Searchable Name');
  });
});
