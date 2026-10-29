import { test, expect } from '@playwright/test';
import { setupCleanEnvironment, createTestDossier } from './fixtures/test-utils';

test('the dossier is renamed from its title in the header', async ({ page }) => {
  await setupCleanEnvironment(page);
  await createTestDossier(page, 'Ancien nom');

  const title = page.locator('[data-testid="dossier-title"]');
  await expect(title).toHaveText('Ancien nom');

  // Escape cancels
  await title.dblclick();
  await page.locator('[data-testid="dossier-title-input"]').fill('Abandonné');
  await page.keyboard.press('Escape');
  await expect(title).toHaveText('Ancien nom');

  // Enter saves; an empty name keeps the current one
  await title.dblclick();
  await page.locator('[data-testid="dossier-title-input"]').fill('Nouveau nom');
  await page.keyboard.press('Enter');
  await expect(title).toHaveText('Nouveau nom');
  await title.dblclick();
  await page.locator('[data-testid="dossier-title-input"]').fill('   ');
  await page.keyboard.press('Enter');
  await expect(title).toHaveText('Nouveau nom');
});
