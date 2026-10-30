import { test, expect } from '@playwright/test';
import { setupCleanEnvironment, createTestDossier, createElementOnCanvas } from './fixtures/test-utils';

test('Escape closes the map location picker and nothing else', async ({ page }) => {
  await setupCleanEnvironment(page);
  await createTestDossier(page, 'Carte Echap');
  await createElementOnCanvas(page, 300, 300);
  await page.keyboard.press('Enter');

  const pick = page.locator('[data-tutorial="pick-on-map"]');
  if (!(await pick.isVisible())) {
    await page.getByRole('button', { name: /Localisation|Location/ }).first().click();
  }
  // The section header above can overlap the button while the panel lays out
  await pick.dispatchEvent('click');

  const dialog = page.getByRole('dialog', { name: /Choisir une localisation|Choose a location/ });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  // The key went to the picker only: the element is still selected
  await expect(page.locator('[data-testid="element-label-input"]')).toBeVisible();
});
