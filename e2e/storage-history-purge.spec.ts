import { test, expect } from '@playwright/test';
import { ydocStorage } from './fixtures/ydoc-storage';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import {
  setupCleanEnvironment, createTestDossier, createElementOnCanvas, navigateHomeViaBackButton, getElementCount,
} from './fixtures/test-utils';

/**
 * "Compacting" used to fold the update log into one snapshot that still
 * carried every tombstone: nothing was freed. The purge rebuilds the document
 * from its content; this checks space is freed and the content survives.
 */
test.describe('Y.js history purge', () => {
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(async ({ page }) => {
    await setupCleanEnvironment(page);
  });

  test('frees space and keeps the dossier content', async ({ page }) => {
    await createTestDossier(page, 'Dossier historique');
    for (const [x, y] of [[300, 200], [500, 300], [400, 450]]) {
      await createElementOnCanvas(page, x, y);
      await page.keyboard.press('Escape');
    }
    await expect(page.locator('.react-flow__node')).toHaveCount(3);

    // Build up history: drag the elements around
    for (let round = 0; round < 8; round++) {
      for (let i = 0; i < 3; i++) {
        const box = await page.locator('.react-flow__node').nth(i).boundingBox();
        if (!box) continue;
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 + (round % 2 ? -40 : 40), box.y + box.height / 2 + 15, { steps: 4 });
        await page.mouse.up();
      }
    }

    await navigateHomeViaBackButton(page);
    const before = await ydocStorage(page);
    expect(before).toHaveLength(1);

    await page.getByRole('button', { name: /^(storage|stockage)$/i }).click();
    await page.getByRole('button', { name: /^maintenance$/i }).click();
    await page.getByRole('button', { name: /^(purge all|tout purger)$/i }).click();
    await expect(page.getByRole('status').filter({ hasText: /space freed|espace libéré/i }))
      .toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('status')).not.toContainText(/skipped|ignorés|not processed|non traités/i);

    const after = await ydocStorage(page);
    expect(after[0].count).toBe(1);
    expect(after[0].bytes).toBeLessThan(before[0].bytes);

    // The dossier reopens with its elements
    await page.keyboard.press('Escape');
    await page.getByText('Dossier historique').first().click();
    await page.waitForSelector('[data-testid="canvas"]', { timeout: 10_000 });
    await expect(page.locator('.react-flow__node')).toHaveCount(3, { timeout: 10_000 });
    expect(await getElementCount(page)).toBe(3);
  });

  test('a local dossier keeps its files out of the Y.js database', async ({ page }) => {
    await createTestDossier(page, 'Dossier fichiers');
    await createElementOnCanvas(page, 400, 300);

    // Random bytes: incompressible, so a copy would show in the size
    const dir = mkdtempSync(join(tmpdir(), 'zn-asset-'));
    const file = join(dir, 'son.mp3');
    writeFileSync(file, randomBytes(400_000));
    await page.setInputFiles('input[type="file"]', file);
    await page.getByRole('button', { name: /files|fichiers/i }).first().click();
    await expect(page.getByText('son.mp3').first()).toBeVisible({ timeout: 20_000 });

    await navigateHomeViaBackButton(page);
    const [ydoc] = await ydocStorage(page);
    expect(ydoc.bytes).toBeLessThan(100_000);
  });
});
