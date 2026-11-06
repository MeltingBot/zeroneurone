import { test, expect, type Page } from '@playwright/test';
import { setupCleanEnvironment } from './fixtures/test-utils';

const CSV = [
  'type,label,tags,ville',
  'element,Jean Martin,Personne;Suspect,Paris',
  'element,J. Martin,Personne,Lyon',
].join('\n');

/** Rows of a store of the app's IndexedDB */
async function readStore<T>(page: Page, store: string): Promise<T[]> {
  return page.evaluate((name) => new Promise<T[]>((resolve, reject) => {
    const req = indexedDB.open('zeroneurone');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const all = req.result.transaction(name, 'readonly').objectStore(name).getAll();
      all.onsuccess = () => resolve(all.result as T[]);
      all.onerror = () => reject(all.error);
    };
  }), store);
}

const labels = async (page: Page) => (await readStore<{ label: string }>(page, 'elements')).map((e) => e.label).sort();

test('a merge undone can be redone at once', async ({ page }) => {
  await setupCleanEnvironment(page);
  await page.click('[data-testid="import-button"]');
  await page.locator('[data-testid="import-file-input"]').setInputFiles({
    name: 'affaires.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV, 'utf-8'),
  });
  await expect(page.locator('.react-flow__node')).toHaveCount(2, { timeout: 15000 });

  const ids = await page.evaluate(async () => {
    const ids = [...document.querySelectorAll('.react-flow__node')].map((n) => n.getAttribute('data-id')!);
    (await import('/src/stores/selectionStore.ts')).useSelectionStore.getState().selectElements(ids);
    return ids;
  });
  await page.waitForTimeout(300);
  await page.locator(`.react-flow__node[data-id="${ids[0]}"]`).click({ button: 'right' });
  const organize = page.getByRole('menuitem', { name: 'Organize' });
  if (await organize.count()) await organize.hover();
  await page.getByRole('menuitem', { name: 'Merge' }).click();
  await page.getByTestId('merge-confirm').click();
  await expect.poll(async () => (await labels(page)).length, { timeout: 10000 }).toBe(1);
  const kept = await labels(page);

  // Undo, then redo with no pause: the redo waits for the undo, then finds the
  // element it put back (the app used to see it only 500 ms later)
  await page.locator('.react-flow__pane').click({ position: { x: 50, y: 50 } });
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+Shift+z');
  await expect.poll(() => labels(page), { timeout: 10000 }).toEqual(kept);
  await expect(page.locator('.react-flow__node')).toHaveCount(1);
});
