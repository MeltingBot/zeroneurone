import { test, expect, type Page } from '@playwright/test';
import { setupCleanEnvironment } from './fixtures/test-utils';

// The same person, from two cases: a tag and a city differ, the phone is the same
const CSV = [
  'type,label,tags,ville,tel',
  'element,Jean Martin,Personne;Suspect,Paris,0601010101',
  'element,J. Martin,Personne,Lyon,0601010101',
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

type Stored = { label: string; tags: string[]; properties: { key: string; value: unknown }[] };
const summary = async (page: Page) => (await readStore<Stored>(page, 'elements'))
  .map((e) => ({ tags: [...e.tags].sort(), props: e.properties.map((p) => `${p.key}=${p.value}`).sort() }));

test('merging keeps only the tags and property values left checked; undo and redo follow', async ({ page }) => {
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

  const table = page.getByTestId('merge-keep');
  await expect(table).toBeVisible();
  // The same phone in both: one choice, checked in both columns
  const phones = table.getByRole('checkbox', { name: 'tel : 0601010101' });
  await expect(phones).toHaveCount(2);
  await phones.first().uncheck();
  await expect(phones.last()).not.toBeChecked();
  await phones.first().check();
  // Drop a tag and one of the two cities
  await table.getByRole('checkbox', { name: 'Suspect', exact: true }).uncheck();
  await table.getByRole('checkbox', { name: 'ville : Paris' }).uncheck();
  await page.getByTestId('merge-confirm').click();

  const merged = [{ tags: ['Personne'], props: ['tel=0601010101', 'ville=Lyon'] }];
  await expect.poll(() => summary(page), { timeout: 10000 }).toEqual(merged);

  // One undo: both elements as they were; redo: the same choice again
  await page.locator('.react-flow__pane').click({ position: { x: 50, y: 50 } });
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await summary(page)).length, { timeout: 10000 }).toBe(2);
  expect((await summary(page)).map((s) => s.tags.join(';')).sort()).toEqual(['Personne', 'Personne;Suspect']);
  // The app gets the element back from the shared document after the database:
  // redo once it holds both again
  await expect.poll(() => page.evaluate(async () => (await import('/src/stores/dossierStore.ts')).useDossierStore.getState().elements.length), { timeout: 10000 }).toBe(2);
  await page.keyboard.press('Control+Shift+z');
  await expect.poll(() => summary(page), { timeout: 10000 }).toEqual(merged);
});
