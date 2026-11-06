import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { setupCleanEnvironment } from './fixtures/test-utils';

// An xBRL-JSON report (OIM): facts keyed by id, periods as ISO intervals or
// instants written at midnight of the next day
const XBRL = {
  documentInfo: { documentType: 'https://xbrl.org/2021/xbrl-json', taxonomy: ['a.xsd'] },
  facts: {
    f1: { value: '20827056.0', decimals: 0, dimensions: { concept: 'ifrs-full:Revenue', entity: 'scheme:LEI1', period: '2025-01-01T00:00:00/2026-01-01T00:00:00', unit: 'ISO4217:EUR' } },
    f2: { value: '1500.0', decimals: 0, dimensions: { concept: 'ifrs-full:Equity', entity: 'scheme:LEI1', period: '2026-01-01T00:00:00', unit: 'ISO4217:EUR' } },
    f3: { value: '<span>Going concern</span>', dimensions: { concept: 'ifrs-full:DisclosureOfGoingConcern', entity: 'scheme:LEI1', period: '2025-01-01T00:00:00/2026-01-01T00:00:00', language: 'en' } },
  },
};

const MAPPING = {
  _key: { enabled: true, target: 'property', propKey: 'Fait xBRL' },
  value: { enabled: true, target: 'number', propKey: 'Valeur' },
  decimals: { enabled: false, target: 'ignore', propKey: 'decimals' },
  'dimensions.concept': { enabled: false, target: 'ignore', propKey: 'Concept' },
  'dimensions.unit': { enabled: true, target: 'property', propKey: 'Unité' },
};
const TABLE = {
  labelTemplate: '{dimensions.concept}', tagName: 'Émetteur', mapping: MAPPING, childMappings: {},
  filters: [{ field: 'dimensions.unit', op: 'nonempty', value: '' }], filterMode: 'all', maxImport: 2000,
  events: { hostField: 'dimensions.entity', dateField: 'dimensions.period', midnightIsDayBefore: true },
};
const TEMPLATE = {
  name: 'xBRL test', signature: [],
  config: { ...TABLE, format: 'json', ignoreEmpty: true, layout: 'grid', attachExisting: true, tables: { 'array:facts': TABLE }, included: ['array:facts'] },
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

/** Save a mapping template as the template manager would */
async function seedTemplate(page: Page, tpl: { name: string; signature: string[]; config: unknown }) {
  await page.evaluate((t) => new Promise<void>((resolve, reject) => {
    const req = indexedDB.open('zeroneurone');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const tx = req.result.transaction('jsonMappings', 'readwrite');
      tx.objectStore('jsonMappings').put({ id: crypto.randomUUID(), ...t, createdAt: new Date(), updatedAt: new Date() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
  }), tpl);
}

type Ev = { label: string; date: Date; dateEnd?: Date; properties?: { key: string; value: unknown }[] };
const day = (d: Date | undefined) => (d ? [d.getFullYear(), d.getMonth() + 1, d.getDate()] : null);

/** Import a JSON file through the mapping with a saved template; the events of the created elements */
async function importWithTemplate(page: Page, name: string, buffer: Buffer, templateName: string) {
  // A JSON of no known format goes through « Map a JSON or spreadsheet »
  await page.click('[data-testid="import-button"]');
  await page.click('[data-testid="import-open-mapping"]');
  const modal = page.locator('[data-testid="json-mapping-modal"]');
  await expect(modal).toBeVisible({ timeout: 15000 });
  await modal.locator('input[type="file"]').setInputFiles({ name, mimeType: 'application/json', buffer });
  await expect(modal.locator('[data-testid="json-mapping-template"]')).toBeVisible({ timeout: 60000 });
  const tplId = await modal.locator('[data-testid="json-mapping-template"] option', { hasText: templateName }).getAttribute('value');
  await modal.locator('[data-testid="json-mapping-template"]').selectOption(tplId!);
  await expect(modal.locator('[data-testid="json-mapping-record-as"]')).toHaveValue('event');
  await expect(modal.locator('[data-testid="json-mapping-midnight-day-before"]')).toBeChecked();
  await modal.locator('[data-testid="json-mapping-import"]').click();
  await expect(modal).toBeHidden({ timeout: 60000 });
  await page.locator('.react-flow__pane').click({ position: { x: 400, y: 300 } });
  await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 30000 });
  await expect.poll(async () => (await readStore<{ events?: Ev[] }>(page, 'elements')).length, { timeout: 30000 }).toBeGreaterThan(0);
  return readStore<{ label: string; tags: string[]; events?: Ev[] }>(page, 'elements');
}

test('the facts of an xBRL-JSON report, keyed by id, become dated events of the issuer', async ({ page }) => {
  await setupCleanEnvironment(page);
  await seedTemplate(page, TEMPLATE);
  const els = await importWithTemplate(page, 'rapport.json', Buffer.from(JSON.stringify(XBRL)), 'xBRL test');

  // One element per issuer; the text fact (no unit) is filtered out
  expect(els.map((e) => e.label)).toEqual(['scheme:LEI1']);
  expect(els[0].tags).toContain('Émetteur');
  const events = els[0].events ?? [];
  expect(events.map((e) => e.label).sort()).toEqual(['ifrs-full:Equity', 'ifrs-full:Revenue']);

  // The year 2025 ends on 31/12/2025, and so does the balance sheet
  const revenue = events.find((e) => e.label === 'ifrs-full:Revenue')!;
  expect(day(revenue.date)).toEqual([2025, 1, 1]);
  expect(day(revenue.dateEnd)).toEqual([2025, 12, 31]);
  const equity = events.find((e) => e.label === 'ifrs-full:Equity')!;
  expect(day(equity.date)).toEqual([2025, 12, 31]);
  expect(equity.dateEnd).toBeUndefined();
  expect(revenue.properties?.find((p) => p.key === 'Valeur')?.value).toBe(20827056);
  expect(revenue.properties?.find((p) => p.key === 'Fait xBRL')?.value).toBe('f1');
});

// A real report and template, given by path (not part of the repository):
// XBRL_FILE=…/rapport.json XBRL_TEMPLATE=…/mapping.json npx playwright test import-json-keyed
test('a real xBRL-JSON report with its template', async ({ page }) => {
  const file = process.env.XBRL_FILE, tplFile = process.env.XBRL_TEMPLATE;
  test.skip(!file || !tplFile, 'XBRL_FILE and XBRL_TEMPLATE not set');
  test.setTimeout(180000);
  const tpl = JSON.parse(readFileSync(tplFile!, 'utf-8')).templates[0];
  await setupCleanEnvironment(page);
  await seedTemplate(page, tpl);
  const els = await importWithTemplate(page, basename(file!), readFileSync(file!), tpl.name);
  const events = els.flatMap((e) => e.events ?? []);
  const links = await readStore(page, 'links');
  console.log(`elements: ${els.length}, links: ${links.length}, events: ${events.length} — tags: ${[...new Set(els.flatMap((e) => e.tags))].join(', ')}`);
  for (const e of events.slice(0, 5)) console.log(e.label, day(e.date), day(e.dateEnd), JSON.stringify(e.properties));
  expect(els.length).toBeGreaterThan(0);
  expect(events.length).toBeGreaterThan(0);
  // No date of the report stays on a midnight of 1 January
  expect(events.some((e) => day(e.date)?.join('-') === '2026-1-1' || day(e.dateEnd)?.join('-') === '2026-1-1')).toBe(false);
});
