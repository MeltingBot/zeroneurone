import { test, expect } from '@playwright/test';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setupCleanEnvironment, waitForAppLoad } from './fixtures/test-utils';
import { buildLargeDossierJson } from './fixtures/large-dossier';

/**
 * A position-locked element shows a lock on the canvas, as soon as it is
 * locked and until it is unlocked (the node redraws on the change).
 * Dev server only: reaches the stores through Vite's module URLs.
 */
test('a locked element shows a lock on the canvas', async ({ page }) => {
  test.setTimeout(120_000);
  await setupCleanEnvironment(page);
  await waitForAppLoad(page);
  const file = join(mkdtempSync(join(tmpdir(), 'zn-')), 'dossier.json');
  writeFileSync(file, buildLargeDossierJson(3));
  await page.click('[data-testid="import-button"]');
  await page.setInputFiles('input[type="file"]', file);
  await page.waitForSelector('.react-flow__node');
  await page.waitForTimeout(1000);

  const id = await page.evaluate(() => document.querySelector('.react-flow__node')!.getAttribute('data-id')!);
  const node = page.locator(`.react-flow__node[data-id="${id}"]`);
  const setLocked = (locked: boolean) => page.evaluate(async ({ elementId, locked }) => {
    await (await import('/src/stores/dossierStore.ts')).useDossierStore.getState()
      .updateElement(elementId, { isPositionLocked: locked });
  }, { elementId: id, locked });

  await expect(node.getByTestId('position-lock-badge')).toHaveCount(0);
  await setLocked(true);
  await expect(node.getByTestId('position-lock-badge')).toBeVisible();
  await expect(node.getByTestId('position-lock-badge')).toHaveAttribute('title', 'Position locked');
  await setLocked(false);
  await expect(node.getByTestId('position-lock-badge')).toHaveCount(0);
});
