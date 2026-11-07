import { test, expect, type Page } from '@playwright/test';
import { setupCleanEnvironment } from './fixtures/test-utils';

// A graph as many tools write it: the elements in one array, the links in
// another naming their ends by id. Links outnumber elements (the links
// table is the one picked by default) and have ids of their own, overlapping
// the elements' ones. One link points at an id no element has.
const GRAPH = {
  nodes: [
    { id: 1, nom: 'Dupont' },
    { id: 2, nom: 'Martin' },
    { id: 3, nom: 'SCI Horizon' },
  ],
  edges: [
    { id: 1, source: 1, target: 3, type: 'gérant' },
    { id: 2, source: 2, target: 3, type: 'associé' },
    { id: 3, source: 1, target: 2, type: 'cousin' },
    { id: 4, source: 2, target: 99, type: 'inconnu' },
  ],
};

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

test('an array of elements and an array of links between them import together', async ({ page }) => {
  await setupCleanEnvironment(page);
  await page.click('[data-testid="import-button"]');
  await page.click('[data-testid="import-open-mapping"]');
  const modal = page.locator('[data-testid="json-mapping-modal"]');
  await expect(modal).toBeVisible({ timeout: 15000 });
  await modal.locator('input[type="file"]').setInputFiles({
    name: 'graphe.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(GRAPH), 'utf-8'),
  });

  // Both tables checked, the elements open
  const tables = modal.locator('[data-testid="json-mapping-tables"]');
  await expect(tables.getByRole('checkbox', { name: /nodes/ })).toBeChecked({ timeout: 15000 });
  await expect(tables.getByRole('checkbox', { name: /edges/ })).toBeChecked();
  await expect(modal.locator('[data-testid="json-mapping-record-as"]')).toHaveValue('element');

  // The links table: its rows are links, their ends the ids of the elements
  await tables.getByRole('button', { name: /edges/ }).click();
  await expect(modal.locator('[data-testid="json-mapping-record-as"]')).toHaveValue('link');
  await expect(modal.locator('[data-testid="json-mapping-link-fromField"]')).toHaveValue('source');
  await expect(modal.locator('[data-testid="json-mapping-link-toField"]')).toHaveValue('target');
  const nodesKey = await modal.locator('[data-testid="json-mapping-end-table-source"] option', { hasText: 'nodes' }).getAttribute('value');
  await expect(modal.locator('[data-testid="json-mapping-end-table-source"]')).toHaveValue(nodesKey!);
  await expect(modal.locator('[data-testid="json-mapping-end-table-target"]')).toHaveValue(nodesKey!);
  await expect(modal.getByPlaceholder('{first_name} {last_name}')).toHaveValue('{type}');

  await modal.locator('[data-testid="json-mapping-import"]').click();
  await expect(modal).toBeHidden({ timeout: 15000 });
  await page.locator('.react-flow__pane').click({ position: { x: 400, y: 300 } });

  // The three elements, and the id found nowhere as an element of its own
  await expect.poll(async () => (await readStore(page, 'elements')).length, { timeout: 10000 }).toBe(4);
  const els = await readStore<{ id: string; label: string; tags: string[] }>(page, 'elements');
  expect(els.map((e) => e.label).sort()).toEqual(['99', 'Dupont', 'Martin', 'SCI Horizon']);
  // The elements table is the main one: no tag after its name
  expect(els.flatMap((e) => e.tags)).toEqual([]);
  const label = (id: string) => els.find((e) => e.id === id)?.label;

  const links = await readStore<{ fromId: string; toId: string; label: string; properties: { key: string }[] }>(page, 'links');
  expect(links.map((l) => `${label(l.fromId)} > ${label(l.toId)} : ${l.label}`).sort()).toEqual([
    'Dupont > Martin : cousin',
    'Dupont > SCI Horizon : gérant',
    'Martin > 99 : inconnu',
    'Martin > SCI Horizon : associé',
  ]);
  // The type names the link: not repeated as a property
  expect(links.every((l) => !l.properties.some((p) => p.key === 'type'))).toBe(true);
});

test('a JSON file of no known format, imported as a file, opens the mapping', async ({ page }) => {
  await setupCleanEnvironment(page);
  await page.click('[data-testid="import-button"]');
  await page.locator('[data-testid="import-file-input"]').setInputFiles({
    name: 'graphe.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(GRAPH), 'utf-8'),
  });
  const modal = page.locator('[data-testid="json-mapping-modal"]');
  await expect(modal).toBeVisible({ timeout: 15000 });
  await expect(modal.locator('[data-testid="json-mapping-tables"]').getByRole('checkbox', { name: /edges/ })).toBeChecked();
  await modal.locator('[data-testid="json-mapping-import"]').click();
  await expect(modal).toBeHidden({ timeout: 15000 });
  await page.locator('.react-flow__pane').click({ position: { x: 400, y: 300 } });
  await expect.poll(async () => (await readStore(page, 'links')).length, { timeout: 10000 }).toBe(4);
});
