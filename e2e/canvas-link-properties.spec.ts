import { test, expect } from '@playwright/test';
import { setupCleanEnvironment } from './fixtures/test-utils';

const CSV = [
  'type,label,de,vers,montant',
  'element,Jean Martin,,,',
  'element,Paul Durand,,,',
  'lien,virement,Jean Martin,Paul Durand,120',
].join('\n');

test('a property ticked in the Views panel shows on the links, not only on the elements', async ({ page }) => {
  await setupCleanEnvironment(page);
  await page.click('[data-testid="import-button"]');
  await page.locator('[data-testid="import-file-input"]').setInputFiles({
    name: 'virements.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV, 'utf-8'),
  });
  await expect(page.locator('.react-flow__edge-custom')).toHaveCount(1, { timeout: 15000 });
  const shown = page.locator('.react-flow__edge-custom text', { hasText: 'montant: 120' });
  await expect(shown).toHaveCount(0);

  await page.locator('[data-panel-tab="views"]').click();
  const box = page.locator('label', { hasText: /^montant$/ }).locator('input[type="checkbox"]');
  await box.click();
  await expect(box).toBeChecked();

  await expect(shown).toHaveCount(1);
});
