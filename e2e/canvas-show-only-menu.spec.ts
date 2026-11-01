import { test, expect } from '@playwright/test';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setupCleanEnvironment, waitForAppLoad } from './fixtures/test-utils';
import { buildLargeDossierJson } from './fixtures/large-dossier';

/**
 * Element menu once the element is shown alone: "Hide" and "Show only" mean
 * nothing, "Show hidden (n)" takes their place and shows everything again.
 * Dev server only: reaches the stores through Vite's module URLs.
 */
test('an element shown alone offers to show the hidden ones', async ({ page }) => {
  test.setTimeout(120_000);
  await setupCleanEnvironment(page);
  await waitForAppLoad(page);
  const file = join(mkdtempSync(join(tmpdir(), 'zn-')), 'small.json');
  writeFileSync(file, buildLargeDossierJson(10));
  await page.click('[data-testid="import-button"]');
  await page.setInputFiles('input[type="file"]', file);
  await page.waitForSelector('.react-flow__node');
  await page.waitForTimeout(1000);

  const id = await page.locator('.react-flow__node').first().getAttribute('data-id');
  const node = page.locator(`.react-flow__node[data-id="${id}"]`);
  const menu = page.getByRole('menu');

  await node.click({ button: 'right' });
  await expect(menu.getByText('Hide element')).toBeVisible();
  await menu.getByText('Show only this element').click();
  await expect(page.locator('.react-flow__node')).toHaveCount(1);

  await node.click({ button: 'right' });
  await expect(menu.getByText('Hide element')).toHaveCount(0);
  await expect(menu.getByText('Show only this element')).toHaveCount(0);
  await menu.getByText('Show hidden (9)').click();
  // Only on-screen nodes are rendered: read what is hidden from the view store
  await expect.poll(() => page.evaluate(async () =>
    (await import('/src/stores/viewStore.ts')).useViewStore.getState().hiddenElementIds.size)).toBe(0);
});
